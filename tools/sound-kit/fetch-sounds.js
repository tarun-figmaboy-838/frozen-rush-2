#!/usr/bin/env node
/**
 * fetch-sounds.js — pull CC0 sound effects from Freesound into your project.
 *
 * Authoring-time tool, not a runtime dependency. You run it once from the
 * VS Code terminal; it writes audio files, a manifest and a credits file
 * into your assets folder. The shipped game never talks to Freesound.
 *
 *   node fetch-sounds.js                      # fetch everything in sounds.config.json
 *   node fetch-sounds.js --dry-run            # show what it would fetch, download nothing
 *   node fetch-sounds.js --only coin,jump     # just those keys
 *   node fetch-sounds.js --force              # re-download files that already exist
 *   node fetch-sounds.js --search "cartoon boing"   # browse results, download nothing
 *
 * Auth: put your key in a .env file next to this script —
 *
 *   FREESOUND_KEY=your_key_here
 *
 * Get one at https://freesound.org/apiv2/apply (free, needs a Freesound account).
 *
 * Requires Node 18+ for global fetch. No npm install.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const API = 'https://freesound.org/apiv2';
const CC0 = 'Creative Commons 0';
const THROTTLE_MS = 350;          // be a good citizen; Freesound rate-limits
const MAX_RETRIES = 3;

/* ------------------------------------------------------------------ *
 * Setup
 * ------------------------------------------------------------------ */

const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  die(`Node 18+ required for global fetch (you have ${process.versions.node}).`);
}

const argv = parseArgs(process.argv.slice(2));
const root = __dirname;

loadDotenv(path.join(root, '.env'));
const KEY = process.env.FREESOUND_KEY || process.env.FREESOUND_API_KEY;
if (!KEY) {
  die(
    'No API key. Create a .env file next to this script containing:\n' +
    '  FREESOUND_KEY=your_key_here\n' +
    'Request a key at https://freesound.org/apiv2/apply'
  );
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

const auth = { Authorization: 'Token ' + KEY };

async function request(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, { headers: auth });

    if (res.status === 429) {                       // rate limited
      const wait = Number(res.headers.get('retry-after') || 5) * 1000;
      warn(`rate limited, waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (res.status === 401) {
      die('401 Unauthorized — the key in .env was rejected by Freesound.');
    }
    if (!res.ok) {
      if (attempt < MAX_RETRIES && res.status >= 500) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
    }
    return res.json();
  }
  throw new Error('gave up after ' + MAX_RETRIES + ' retries: ' + url);
}

/**
 * Search for CC0 sounds. Freesound filter syntax is Solr's:
 *   filter=license:"Creative Commons 0" duration:[0.1 TO 3] avg_rating:[3 TO *]
 */
function searchUrl(spec) {
  const filters = [`license:"${CC0}"`];

  const min = spec.minDuration == null ? 0.05 : spec.minDuration;
  const max = spec.maxDuration == null ? 3 : spec.maxDuration;
  filters.push(`duration:[${min} TO ${max}]`);

  if (spec.minRating)  filters.push(`avg_rating:[${spec.minRating} TO *]`);
  if (spec.singleEvent) filters.push('single_event:true');
  if (spec.type)       filters.push(`type:${spec.type}`);
  if (spec.extraFilter) filters.push(spec.extraFilter);

  const params = new URLSearchParams({
    query: spec.query,
    filter: filters.join(' '),
    sort: spec.sort || 'downloads_desc',
    page_size: String(spec.pageSize || 12),
    // Ask for everything we need in one request rather than one call per hit.
    fields: 'id,name,username,license,duration,avg_rating,num_downloads,url,previews'
  });

  return `${API}/search/?${params}`;
}

async function search(spec) {
  const data = await request(searchUrl(spec));
  return data.results || [];
}

async function downloadPreview(sound, dest, quality) {
  const url = sound.previews && sound.previews[quality];
  if (!url) throw new Error(`no ${quality} preview for sound ${sound.id}`);

  const res = await fetch(url, { headers: auth });
  if (!res.ok) throw new Error(`${res.status} fetching preview for ${sound.id}`);

  const bytes = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, bytes);
  return bytes.length;
}

/* ------------------------------------------------------------------ *
 * Modes
 * ------------------------------------------------------------------ */

async function browse(query) {
  const hits = await search({ query, maxDuration: 5, pageSize: 15 });
  if (!hits.length) return log(`nothing CC0 matched "${query}"`);

  log(`CC0 results for "${query}"\n`);
  hits.forEach(function (s) {
    const rating = s.avg_rating ? s.avg_rating.toFixed(1) : ' - ';
    log(
      `  ${String(s.id).padEnd(9)} ${rating}★  ${s.duration.toFixed(2)}s  ` +
      `${String(s.num_downloads).padStart(6)}dl  ${trim(s.name, 42)}  @${s.username}`
    );
  });
  log('\nPaste a promising query into sounds.config.json, then run without --search.');
}

async function fetchAll(config) {
  const outDir = path.resolve(root, argv.out || config.out || 'assets/audio');
  const quality = config.format || 'preview-hq-mp3';
  const ext = quality.includes('ogg') ? '.ogg' : '.mp3';
  fs.mkdirSync(outDir, { recursive: true });

  let keys = Object.keys(config.sounds);
  if (argv.only) {
    const wanted = new Set(argv.only.split(',').map(function (s) { return s.trim(); }));
    keys = keys.filter(function (k) { return wanted.has(k); });
    if (!keys.length) die('--only matched no keys in sounds.config.json');
  }

  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : {};

  let fetched = 0, skipped = 0, failed = 0;

  for (const key of keys) {
    const spec = Object.assign({}, config.defaults, config.sounds[key]);
    const file = key + ext;
    const dest = path.join(outDir, file);

    if (fs.existsSync(dest) && !argv.force) {
      log(`  skip   ${key.padEnd(14)} already present (--force to replace)`);
      skipped++;
      continue;
    }

    try {
      const hits = await search(spec);
      if (!hits.length) {
        warn(`  none   ${key.padEnd(14)} no CC0 match for "${spec.query}"`);
        failed++;
        await sleep(THROTTLE_MS);
        continue;
      }

      const pick = hits[Math.min(spec.take == null ? 0 : spec.take, hits.length - 1)];

      if (argv['dry-run']) {
        log(`  would  ${key.padEnd(14)} ${trim(pick.name, 34)}  @${pick.username}  ` +
            `${pick.duration.toFixed(2)}s  #${pick.id}`);
      } else {
        const size = await downloadPreview(pick, dest, quality);
        log(`  ok     ${key.padEnd(14)} ${trim(pick.name, 34)}  ${kb(size)}`);
        fetched++;
      }

      manifest[key] = {
        file: file,
        id: pick.id,
        name: pick.name,
        author: pick.username,
        license: pick.license,
        duration: Number(pick.duration.toFixed(3)),
        source: pick.url
      };
    } catch (err) {
      warn(`  fail   ${key.padEnd(14)} ${err.message}`);
      failed++;
    }

    await sleep(THROTTLE_MS);
  }

  if (!argv['dry-run']) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(outDir, 'CREDITS.md'), credits(manifest));
    log(`\n  manifest.json and CREDITS.md written to ${path.relative(process.cwd(), outDir)}`);
  }

  log(`\n${fetched} fetched, ${skipped} skipped, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

function credits(manifest) {
  const rows = Object.keys(manifest).sort().map(function (k) {
    const m = manifest[k];
    return `| \`${k}\` | [${m.name}](${m.source}) | ${m.author} | ${m.license} |`;
  });
  return [
    '# Sound credits',
    '',
    'Every file below is Creative Commons 0 (public domain). No attribution is',
    'legally required — this list is here so the sources stay traceable.',
    '',
    '| Key | Sound | Author | Licence |',
    '| --- | --- | --- | --- |',
    ...rows,
    ''
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const name = a.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { out[name] = next; i++; }
    else out[name] = true;
  }
  return out;
}

function loadDotenv(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(function (line) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) return;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  });
}

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
const trim  = function (s, n) { return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; };
const kb    = function (b) { return (b / 1024).toFixed(0) + ' KB'; };
const log   = function (m) { console.log(m); };
const warn  = function (m) { console.warn(m); };
function die(m) { console.error('\n' + m + '\n'); process.exit(1); }

/* ------------------------------------------------------------------ *
 * Entry
 * ------------------------------------------------------------------ */

(async function main() {
  try {
    if (argv.search) return await browse(String(argv.search));

    const cfgPath = path.resolve(root, argv.config || 'sounds.config.json');
    if (!fs.existsSync(cfgPath)) {
      die(`No config at ${cfgPath}. Copy sounds.config.json from the kit, or use --search.`);
    }
    const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (!config.sounds || !Object.keys(config.sounds).length) {
      die('sounds.config.json has no "sounds" entries.');
    }

    log(`Fetching CC0 sounds${argv['dry-run'] ? ' (dry run)' : ''}\n`);
    await fetchAll(config);
  } catch (err) {
    die(err.stack || err.message);
  }
})();
