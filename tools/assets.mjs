/* Asset pipeline: rename, reorganise and convert to WebP.
 *
 * The shipped folder had grown three problems:
 *
 *   CLUTTER   ten raw source sheets (~17MB) sat next to the finished ones and were
 *             deployed with the game even though nothing referenced them.
 *   NAMING    three unrelated conventions (`bg-dawn`, `mammoth-run`, `ice-path`,
 *             `cover`), and the eight sky images gave no clue what order they run in.
 *   WEIGHT    ~40MB of PNG, all of it fetched before the game will start.
 *
 * This moves the sources out of the served folder, sorts the rest into
 * char/ sky/ env/ ui/, and writes WebP.
 *
 * Quality is chosen per kind, not globally:
 *   sprites  near-lossless with alpha. A character on a bright sky shows ringing
 *            around its outline at ordinary lossy settings, and the alpha edge is
 *            exactly what the slicer worked so hard to get clean.
 *   skies    plain lossy. Full-frame gradients and painted mountains, no alpha,
 *            nothing to ring against.
 *   env/ui   between the two.
 *
 *   node tools/assets.mjs          convert and report
 *   node tools/assets.mjs --check  report only, write nothing
 */
import sharp from 'sharp';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/* SPENT. THIS SCRIPT HAS ALREADY RUN AND CANNOT RUN AGAIN.
 *
 * It was the one-time migration that turned the delivered PNGs — dropped straight into
 * game/assets/ — into the WebP set the game loads, then moved the sources out to
 * art-source/. That is done: SRC below is game/assets, and the PNGs it names are no
 * longer there. Twelve of its seventeen entries now name files that exist nowhere
 * under those names (the sky set arrived as sky-*.png and ships as 0N-*.webp; the
 * cover arrived as cover-frozen-rush.png).
 *
 * It is kept, unrun, because the table below is the only remaining record of WHICH
 * delivered file became WHICH asset. Do not try to execute it. To rebuild a single
 * asset, convert the source in art-source/original-upload/ by hand to the output name
 * this table gives.
 *
 * The pipelines that are still LIVE are elsewhere and each has its own tool:
 *   the sprite sheets   tools/gif-to-grid.mjs  -> tools/slice-char.mjs
 *   the option blocks   tools/build-option-shapes.mjs
 *   the picture buttons tools/make-buttons.mjs
 *   the vector icons    tools/make-ui.mjs
 */
const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'game', 'assets');
const OUT = join(ROOT, 'game', 'assets');
const KEEP = join(ROOT, 'art-source');            // outside game/, never deployed
const CHECK = process.argv.includes('--check');

/* ---- the map: old name -> new path, and how to encode it ---------------------
   Sky images are numbered in the order the journey runs through them, so the
   sequence is readable from the file listing alone. */
const PLAN = [
  // characters
  ['mammoth-run.png',   'char/mammoth-run.webp',   'sprite'],
  ['mammoth-jump.png',  'char/mammoth-jump.webp',  'sprite'],
  ['mammoth-skid.png',  'char/mammoth-skid.webp',  'sprite'],
  ['mammoth-shake.png', 'char/mammoth-shake.webp', 'sprite'],
  ['mammoth-hurt.png',  'char/mammoth-hurt.webp',  'sprite'],
  // sky, in journey order
  ['bg-dawn.png',          'sky/01-dawn.webp',          'sky'],
  ['bg-early-morning.png', 'sky/02-early-morning.webp', 'sky'],
  ['bg-morning.png',       'sky/03-morning.webp',       'sky'],
  ['bg-midday.png',        'sky/04-midday.webp',        'sky'],
  ['bg-afternoon.png',     'sky/05-afternoon.webp',     'sky'],
  ['bg-sunset.png',        'sky/06-sunset.webp',        'sky'],
  ['bg-dusk.png',          'sky/07-dusk.webp',          'sky'],
  ['bg-night.png',         'sky/08-night.webp',         'sky'],
  // world
  ['ice-path.png',  'env/path.webp',      'env'],
  ['rock-wide.png', 'env/rock-wide.webp', 'env'],
  ['rock-tall.png', 'env/rock-tall.webp', 'env'],
  // interface
  ['cover.png', 'ui/cover.webp', 'ui']
];

/* Raw source sheets and abandoned art. Nothing references these; they are moved out
   of the served folder rather than deleted, because the slicer needs them if a sheet
   ever has to be rebuilt. */
const SOURCES = [
  'mammoth-run-raw.png', 'skid.png', 'shaking.png',
  'ice-crystal.png'
];

const ENCODE = {
  // near-lossless keeps the alpha edge the slicer produced and avoids ringing
  // around a character outlined against a bright sky
  sprite: { nearLossless: true, quality: 88, effort: 5, alphaQuality: 100 },
  sky:    { quality: 80, effort: 5, smartSubsample: true },
  env:    { nearLossless: true, quality: 86, effort: 5, alphaQuality: 100 },
  ui:     { quality: 86, effort: 5 }
};

const mb = n => (n / 1048576).toFixed(2) + ' MB';

async function main() {
  const before = await readdir(SRC);
  let pngTotal = 0;
  for (const f of before) {
    if (f.endsWith('.png')) pngTotal += (await stat(join(SRC, f))).size;
  }

  if (!CHECK) {
    for (const d of ['char', 'sky', 'env', 'ui']) await mkdir(join(OUT, d), { recursive: true });
    await mkdir(KEEP, { recursive: true });
  }

  const rows = [];
  let webpTotal = 0, missing = 0;

  for (const [from, to, kind] of PLAN) {
    const src = join(SRC, from);
    if (!existsSync(src)) { rows.push([from, 'MISSING', '', '', '']); missing++; continue; }
    const meta = await sharp(src).metadata();
    const srcSize = (await stat(src)).size;
    const dst = join(OUT, to);

    if (!CHECK) {
      await sharp(src).webp(ENCODE[kind]).toFile(dst);
      // the source PNG is only kept if it is one of the raws; finished sheets are
      // regenerable from art-source, so the duplicate is removed
      await rm(src);
    }
    const outSize = CHECK ? 0 : (await stat(dst)).size;
    webpTotal += outSize;
    rows.push([to, kind, `${meta.width}x${meta.height}`, mb(srcSize), CHECK ? '-' : mb(outSize),
      CHECK ? '' : `-${Math.round((1 - outSize / srcSize) * 100)}%`]);
  }

  for (const f of SOURCES) {
    const src = join(SRC, f);
    if (!existsSync(src)) continue;
    if (!CHECK) await rename(src, join(KEEP, f));
    rows.push([`art-source/${f}`, 'source', '', mb((await stat(CHECK ? src : join(KEEP, f))).size), 'moved out', '']);
  }

  const left = (await readdir(SRC)).filter(f => f.endsWith('.png'));

  const w = [0, 0, 0, 0, 0, 0];
  for (const r of rows) r.forEach((c, i) => { w[i] = Math.max(w[i], String(c).length); });
  const line = r => r.map((c, i) => String(c).padEnd(w[i])).join('  ');
  console.log(line(['FILE', 'KIND', 'PIXELS', 'PNG', 'WEBP', 'SAVED']));
  console.log(w.map(n => '-'.repeat(n)).join('  '));
  for (const r of rows) console.log(line(r));
  console.log('');
  console.log('PNG before : ' + mb(pngTotal));
  if (!CHECK) {
    console.log('WebP after : ' + mb(webpTotal) +
      '   (' + Math.round((1 - webpTotal / pngTotal) * 100) + '% smaller)');
  }
  if (missing) console.log('MISSING    : ' + missing + ' file(s) in the plan were not found');
  if (left.length) console.log('LEFTOVER   : ' + left.join(', '));
  else console.log('LEFTOVER   : none — every PNG is accounted for');
}

main().catch(e => { console.error(e); process.exit(1); });
