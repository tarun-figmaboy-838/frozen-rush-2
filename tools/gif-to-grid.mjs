/* An animated GIF of a run cycle -> a padded grid PNG the character slicer can eat.
 *
 * The delivered run cycle arrived as a 36-frame animated GIF from a different tool than
 * the other sheets. Two things have to be handled before it can join them:
 *
 *   SEPARATION.  slice-char.mjs finds frames by connected components, not by grid
 *                arithmetic. That is what makes it robust to the odd layouts the other
 *                sheets arrived in, but it means two characters that touch become one
 *                frame. So the grid is written with generous gutters.
 *
 *   SIZE.        The slicer scales every sheet by ONE factor so the character cannot
 *                change size between animations — but that only holds if the sources
 *                agree on how big the animal is to begin with. A GIF from another tool
 *                does not know about the PNG sheets, so the character here is measured
 *                against them and PRE-SCALED to match. Without this, the run would be
 *                a different-sized mammoth from the skid.
 *
 * Measured on the sqrt of the opaque area, which tracks how big the animal is and
 * barely moves with pose — the same measure the size test uses.
 *
 *     node tools/gif-to-grid.mjs
 */
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
// delivered GIFs and the sheets sliced from them are both source art, so both sides
// of this tool now sit in art-source/ rather than inside the deployed folder
const CHAR = join(ROOT, 'art-source', 'char-sheets');
/* Which GIF, and where the grid goes. Both are arguments so the same conversion
   serves every animation delivered this way:
     node tools/gif-to-grid.mjs <gif under assets/GIF> <name under assets/char> */
const GIF = join(ROOT, 'art-source', 'gif',
  process.argv[2] || 'sprite-max-px-frames-36-rows-6-cols-6.gif');
const OUT = join(CHAR, process.argv[3] || 'run-gif.png');
const GUTTER = 48;
const ALPHA = 40;

/* ---- the reference: how big the character is, in the GIF's own pixels ----
 *
 * This used to be measured off the sheets already shipping — which was circular (the
 * sheets are built FROM these grids) and, worse, LOSSY: the first sheets were cut at a
 * character of ~173px (sqrt of opaque area), so every later GIF was pre-scaled DOWN to
 * match them, to about half its native size, and the slicer then had nothing more to
 * give a hi-DPI screen. The delivered GIFs carry 280..345px of character; the grids now
 * keep that. The reference is a CONSTANT chosen at the top of the delivered range so no
 * GIF is shrunk and none is stretched by more than ~1.2x; the slicer's single scale then
 * downsamples every grid into its cells, which is the one resampling that costs detail.
 *
 * Every grid MUST be built with the same reference, or the character changes size between
 * animations. Override with --ref N only to rebuild the whole set at once. */
const refArg = process.argv.find(a => a.startsWith('--ref='));
const refSize = refArg ? Number(refArg.slice(6)) : 340;
if (!(refSize > 50)) { console.error('bad --ref'); process.exit(1); }
console.log('reference character size (sqrt of opaque area): ' + refSize);

/* ---- the GIF ---- */
const meta = await sharp(GIF).metadata();
const pages = meta.pages || 1;

const { data, info } = await sharp(GIF, { animated: true }).ensureAlpha().raw()
  .toBuffer({ resolveWithObject: true });
const W = info.width, C = info.channels;
/* metadata().height is the PAGE height for an animated GIF, not the total, so dividing
   it by the page count gave 11.8 and every extract was fractional. The raw buffer is
   the whole strip, so the page height comes from there. */
const pw = W, ph = info.height / pages;

const boxes = [], areas = [];
for (let p = 0; p < pages; p++) {
  let x0 = pw, x1 = -1, y0 = ph, y1 = -1, n = 0;
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      if (data[(((p * ph + y) * W) + x) * C + 3] <= ALPHA) continue;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  boxes.push({ p, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n });
  if (n) areas.push(Math.sqrt(n));
}
areas.sort((a, b) => a - b);
const gifSize = areas[areas.length >> 1];
const k = refSize / gifSize;
console.log(`gif: ${pages} frames of ${pw}x${ph}, sqrt(area) median ${gifSize.toFixed(0)}`);
console.log(`pre-scale ${k.toFixed(4)} so the character is ${refSize}px like every other grid`);

/* ---- lay the frames out with gutters, at the matched size ---- */
const cols = 6, rows = Math.ceil(pages / cols);
const cw = Math.round(Math.max(...boxes.map(b => b.w)) * k) + GUTTER;
// tall enough for the whole PAGE, since frames keep their own y within it
const ch = Math.round(ph * k) + GUTTER;
const tiles = [];
for (const b of boxes) {
  if (!b.n) continue;
  const dw = Math.max(1, Math.round(b.w * k)), dh = Math.max(1, Math.round(b.h * k));
  const cut = await sharp(data, { raw: { width: W, height: info.height, channels: C } })
    .extract({ left: b.x0, top: b.p * ph + b.y0, width: b.w, height: b.h })
    .resize(dw, dh, { kernel: 'lanczos3' })
    .png().toBuffer();
  const col = b.p % cols, row = (b.p - col) / cols;
  /* KEEP EACH FRAME'S OWN HEIGHT IN ITS PAGE. That vertical offset is the run's bob —
     the rise and fall that stops the cycle reading as a skate — and sitting every frame
     on the cell's lower edge, which is the tidy-looking thing to do, deletes it. The
     slicer then measures the bob back off these positions. */
  tiles.push({
    input: cut,
    left: col * cw + Math.round((cw - dw) / 2),
    top: row * ch + Math.round(GUTTER / 2 + b.y0 * k)
  });
}
await sharp({ create: { width: cols * cw, height: rows * ch, channels: 4,
                        background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(tiles)
  .png().toFile(OUT);
console.log(`wrote ${OUT.replace(ROOT + '\\', '')}  ${cols * cw}x${rows * ch}  ` +
            `${cols}x${rows} cells of ${cw}x${ch} (gutter ${GUTTER})`);
