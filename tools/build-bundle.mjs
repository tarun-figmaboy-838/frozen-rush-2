/* THE MODULES, AS ONE CLASSIC SCRIPT — so index.html opens off the disk.
 *
 * WHY. The game is written as ES modules, and a browser fetches a module with CORS
 * even from a file:// page. Opening game/index.html by double-clicking it therefore
 * failed at the first line with
 *
 *   Access to script at 'file:///.../js/main.js' from origin 'null' has been blocked
 *   by CORS policy: Cross origin requests are only supported for protocol schemes:
 *   chrome, chrome-untrusted, data, http, https.
 *
 * and the page stayed a blank dark stage. A classic <script> has no such restriction,
 * so the same code concatenated into one non-module file loads straight off the disk.
 *
 * WHAT IT DOES NOT DO. It is not a general bundler and does not try to be. It relies
 * on three facts that a test enforces:
 *   - the dependency graph is a fixed, acyclic list (ORDER below)
 *   - every top-level name across all six modules is UNIQUE, so they can share one
 *     scope with nothing renamed
 *   - the only import forms used are `import { a, b as c } from './x.js'`
 * If any of those stops being true the build fails loudly rather than emitting
 * something subtly wrong.
 *
 * STALENESS IS THE REAL RISK — a bundle that no longer matches the modules is worse
 * than no bundle, because http:// runs the modules and file:// runs the bundle, so the
 * two would silently disagree. tests/bundle.spec.mjs rebuilds in memory and fails if
 * the file on disk differs, so a forgotten rebuild is a red test rather than a bug
 * report from someone who opened the file version.
 *
 *     node tools/build-bundle.mjs           write game/js/game.bundle.js
 *     node tools/build-bundle.mjs --check   exit 1 if it is out of date, write nothing
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = resolve(import.meta.dirname, '..');
const JS = join(ROOT, 'game', 'js');
const OUT = join(JS, 'game.bundle.js');

/* Dependency order, deepest first. engine.js imports the two data modules; main.js
   imports the other three. */
export const ORDER = [
  'asset-versions.js',      // generated below: content hashes for every file under game/assets
  'polygons.js',
  'option-shapes.js',
  'engine.js',
  'bubble.js',
  'hud.js',
  'frontend.js',
  'tutorial.js',
  'main.js'
];

const IMPORT_RE = /^\s*import\s*\{([^}]*)\}\s*from\s*['"]\.\/([^'"]+)['"]\s*;?\s*$/;
const BARE_IMPORT_RE = /^\s*import\s+['"][^'"]+['"]\s*;?\s*$/;
const OTHER_IMPORT_RE = /^\s*import\s+(?!\{)/;
const NAME_RE = /^(?:export\s+)?(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;

/** Top-level declared names in a module's source. */
function topLevelNames(src) {
  const out = [];
  for (const line of src.split('\n')) {
    // top level only: no leading whitespace
    if (/^\s/.test(line)) continue;
    const m = line.match(NAME_RE);
    if (m) out.push(m[1]);
  }
  return out;
}

/** Strip module syntax, turning imports into local aliases. */
function flatten(name, src) {
  const aliases = [];
  const lines = [];
  for (const raw of src.split('\n')) {
    const im = raw.match(IMPORT_RE);
    if (im) {
      for (const part of im[1].split(',')) {
        const bits = part.trim().split(/\s+as\s+/);
        if (!bits[0]) continue;
        // `x as y` needs a local alias; a plain `x` is already in scope
        if (bits.length === 2) aliases.push(`const ${bits[1].trim()} = ${bits[0].trim()};`);
      }
      continue;                                   // the import line itself goes
    }
    if (BARE_IMPORT_RE.test(raw)) continue;
    if (OTHER_IMPORT_RE.test(raw)) {
      throw new Error(`${name}: only \`import { ... } from './x.js'\` is supported, got: ${raw.trim()}`);
    }
    if (/^\s*export\s+default/.test(raw)) {
      throw new Error(`${name}: export default is not supported by this bundler`);
    }
    // `export { a, b };` re-export statements carry nothing once flattened
    if (/^\s*export\s*\{/.test(raw)) continue;
    // `export const X` -> `const X`, and the same for let/var/function/class
    lines.push(raw.replace(/^(\s*)export\s+/, '$1'));
  }
  return (aliases.length ? aliases.join('\n') + '\n' : '') + lines.join('\n');
}

/* ---------------- ASSET VERSIONS ----------------
 *
 * WHY. The deployment caches everything under game/assets as immutable for a year
 * (vercel.json), which is the right header for files that never change under one name —
 * and exactly the wrong one the day they do. The character sheets were rebuilt as
 * six-column grids under the same file names; every browser that had visited before fed
 * the cached strips to code reading rows the strips did not have, and drew no character
 * at all. A cache header cannot fix that; the URL has to change when the file does.
 *
 * So every file under game/assets is hashed here, the map is written as a module the
 * engine imports, and every loader (images, audio, the CSS url()s) appends ?v=<hash>.
 * A changed file is a new URL; an unchanged one keeps its year of cache. Paths in CFG
 * stay bare, so the asset tests can still read them. */
const ASSETS = join(ROOT, 'game', 'assets');
const CSS_FILES = ['style.css', 'screens.css'].map(f => join(ROOT, 'game', 'css', f));

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}

/** { 'assets/char/mammoth-run.webp': 'a1b2c3d4', ... } — md5 of the bytes, 8 hex. */
export async function assetVersions() {
  const map = {};
  for (const p of (await walk(ASSETS)).sort()) {
    const key = 'assets/' + relative(ASSETS, p).split('\\').join('/');
    map[key] = createHash('md5').update(await readFile(p)).digest('hex').slice(0, 8);
  }
  return map;
}

/** The generated module's source. */
export async function assetVersionsModule() {
  const map = await assetVersions();
  const body = Object.entries(map).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  return `/* GENERATED by tools/build-bundle.mjs — DO NOT EDIT.
 *
 * A content hash for every file under game/assets. The engine appends it to asset URLs as
 * ?v=<hash>, so the deployment's year-long immutable cache can never hand a browser a stale
 * file under an unchanged name (see the note in tools/build-bundle.mjs). Rebuild with
 * node tools/build-bundle.mjs whenever anything under game/assets changes; tests/bundle.spec
 * fails if this is out of date. */
export const ASSET_V = {
${body}
};
`;
}

/** The two stylesheets with every url("../assets/...") carrying the file's current hash. */
export async function versionedCss() {
  const map = await assetVersions();
  const out = {};
  for (const file of CSS_FILES) {
    const src = await readFile(file, 'utf8');
    out[file] = src.replace(/url\("\.\.\/(assets\/[^"?]+)(?:\?v=[0-9a-f]+)?"\)/g,
      (m, path) => map[path] ? `url("../${path}?v=${map[path]}")` : m);
  }
  return out;
}

export async function build() {
  const sources = [];
  const seen = new Map();
  const manifest = await assetVersionsModule();
  for (const f of ORDER) {
    // the manifest is generated, not read: the bundle must reflect the assets as they are NOW
    const src = f === 'asset-versions.js' ? manifest : await readFile(join(JS, f), 'utf8');
    for (const n of topLevelNames(src)) {
      if (seen.has(n)) {
        throw new Error(
          `name collision: \`${n}\` is declared at top level in both ${seen.get(n)} and ${f}. ` +
          'The bundle puts every module in one scope, so top-level names must be unique. ' +
          'Rename one of them.');
      }
      seen.set(n, f);
    }
    sources.push({ f, body: flatten(f, src) });
  }

  const head = `/* GENERATED by tools/build-bundle.mjs — DO NOT EDIT.
 *
 * game/js/*.js, concatenated into one classic script so that game/index.html works
 * when it is opened straight off the disk. A browser fetches an ES module with CORS
 * even from a file:// page, which file:// refuses; a classic script has no such
 * restriction.
 *
 * Over http:// the game still runs from the MODULES — index.html loads this file only
 * when location.protocol is 'file:'. So this is a build artefact of the sources in
 * this folder and never the place to make a change.
 *
 * Rebuild:  node tools/build-bundle.mjs
 * In order: ${ORDER.join(', ')}
 */
(function () {
'use strict';
`;
  const body = sources.map(s =>
    `\n/* ==================== ${s.f} ==================== */\n${s.body}\n`).join('');
  return head + body + '\n})();\n';
}

const text = await build();
const manifestText = await assetVersionsModule();
const css = await versionedCss();
if (process.argv.includes('--check')) {
  const have = await readFile(OUT, 'utf8').catch(() => null);
  const haveManifest = await readFile(join(JS, 'asset-versions.js'), 'utf8').catch(() => null);
  let stale = have !== text || haveManifest !== manifestText;
  for (const [file, want] of Object.entries(css)) if ((await readFile(file, 'utf8')) !== want) stale = true;
  if (stale) {
    console.error('the build is OUT OF DATE (bundle, asset versions or stylesheet hashes) — run: node tools/build-bundle.mjs');
    process.exit(1);
  }
  console.log('game.bundle.js, asset-versions.js and the stylesheets are up to date');
} else {
  await writeFile(join(JS, 'asset-versions.js'), manifestText);
  for (const [file, want] of Object.entries(css)) await writeFile(file, want);
  await writeFile(OUT, text);
  const n = Object.keys(await assetVersions()).length;
  console.log(`game/js/game.bundle.js  ${(text.length / 1024).toFixed(1)}kB  from ${ORDER.length} modules;  ${n} assets versioned`);
}
