/* THE PROGRESS TRAIL'S FIVE PIECES, from the delivered art to what the page loads.
 *
 * Five stickers arrive as 1240-ish square PNGs with a great deal of transparent margin
 * around each — which matters more here than anywhere else in the game, because these
 * are laid out in a ROW. Untrimmed, every stone would be positioned by the margin of
 * its own canvas rather than by the stone, and a row of them would not sit on a line.
 * So each is trimmed to its own ink first and only then resized.
 *
 * They are trimmed to a COMMON aspect afterwards: the stones are drawn at slightly
 * different sizes within their squares, and a trail whose steps are three pixels apart
 * vertically reads as broken rather than as a path. Each stone is fitted into the same
 * box, centred, with its own proportions kept.
 *
 *   node tools/make-progress.mjs
 */
import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'art-source/progress';
const OUT = 'game/assets/progress';

/* The stones are laid out in a row nine wide plus a goal, so they are small on screen
   — about 46 stage px. Delivered at 3x that, which is what a 4K stage asks for and is
   still only a few kilobytes each once the margin is gone. */
const STONE = 144;
const GOAL = 190;        // the cave is the destination and is allowed to be bigger
const MOMO = 150;        // the marker that walks the trail

/* The card the whole thing sits on. Delivered as one wide ice frame with snow caps at
   each end; it is stretched to the card's box in CSS, which is safe here in a way it
   was not for the question plank — the middle of this art is a smooth gradient with no
   grain to smear, and the card's aspect (about 5.9) is within 15% of the art's 5.06, so
   the caps are never visibly squashed. 1100 wide covers a 4K stage at the size the card
   is drawn. */
const PANEL = 1100;

const JOBS = [
  { file: 'step-locked.png', out: 'step-locked.webp', w: STONE },
  { file: 'step-now.png', out: 'step-now.webp', w: STONE },
  { file: 'step-done.png', out: 'step-done.webp', w: STONE },
  { file: 'step-goal.png', out: 'step-goal.webp', w: GOAL },
  { file: 'step-momo.png', out: 'step-momo.webp', w: MOMO },
  { file: 'panel.png', out: 'panel.webp', w: PANEL }
];

await mkdir(OUT, { recursive: true });

const have = new Set(await readdir(SRC).catch(() => []));
const missing = JOBS.filter(j => !have.has(j.file)).map(j => j.file);
if (missing.length) {
  console.error('missing source art in ' + SRC + ':\n  ' + missing.join('\n  '));
  process.exit(1);
}

for (const j of JOBS) {
  const src = path.join(SRC, j.file);
  /* TRIMMED ON ALPHA, not on a background colour. These are stickers on transparency,
     and trim()'s default samples the top-left pixel — which is transparent, so it does
     the right thing, but saying so explicitly is what stops a future re-export with a
     white matte silently producing an untrimmed stone. */
  const trimmed = await sharp(src)
    .ensureAlpha()
    .trim({ threshold: 2 })
    .toBuffer({ resolveWithObject: true });

  const info = await sharp(trimmed.data).metadata();
  const out = path.join(OUT, j.out);
  await sharp(trimmed.data)
    .resize({ width: j.w, fit: 'inside', withoutEnlargement: false })
    .webp({ quality: 92, effort: 6 })
    .toFile(out);

  const after = await sharp(out).metadata();
  console.log(
    `${j.out.padEnd(20)} ${String(info.width).padStart(4)}x${String(info.height).padEnd(4)} trimmed` +
    ` -> ${after.width}x${after.height}`);
}

console.log('\nwritten to ' + OUT + ' — remember: node tools/build-bundle.mjs');
