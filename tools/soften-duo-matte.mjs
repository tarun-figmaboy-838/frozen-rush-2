/* Give the dance sheet a real anti-aliased edge.
 *
 * WHY THIS EXISTS. The ending now pushes the camera in on Momo and his friend dancing
 * (CFG.ending.zoomK), and at that size both of them grew a dotted black outline. It is not
 * a bug in the zoom: the sheet is cut from art-source/gif/celebrate-duo.gif, and a GIF has
 * no alpha channel at all — only one palette index marked transparent. So every pixel is
 * either fully opaque or fully gone, the silhouette is a 1-bit stencil, and it was measured
 * that way: 3,347,789 opaque, 6,357,523 clear, and not one semi-transparent pixel in
 * 4302 x 2256. Drawn at 1.22 that reads as a slightly crunchy edge and nobody minded. Drawn
 * at 1.73 the browser resamples a hard stencil sitting on BLACK — the RGB under a
 * transparent pixel is black in the decoded GIF — and every step in the stencil blends a
 * dark speck into the outline.
 *
 * TWO FIXES, IN THIS ORDER, AND THE ORDER MATTERS.
 *
 *   1. Bleed the subject's colour outward into the transparent pixels around it. The pixels
 *      stay fully transparent; what changes is the colour hiding under them, so when the
 *      browser interpolates across the boundary it mixes fur with fur instead of fur with
 *      black. This alone removes the dark specks.
 *   2. Then feather the alpha by a sub-pixel blur, which is the anti-aliasing the GIF could
 *      never carry. Done after the bleed, so the newly-visible fringe is subject colour.
 *
 * WHAT IT DOES NOT DO: change the size of anything. The sheet keeps its exact dimensions and
 * every cell keeps its exact position, because engine.js measures the art — DUO.cw 717,
 * DUO.ch 376, mammothCx 148, bearCx 574, feet 373 — and a sheet that moved by a pixel would
 * move the dancers and the puffs under their feet. Run it, and those numbers still hold.
 *
 * Idempotent-ish but not meant to be run twice: a second pass feathers an already-feathered
 * edge. The original is kept beside it as duo-celebrate.orig.webp the first time through.
 */
import sharp from 'sharp';
import fs from 'fs';

const SRC = 'game/assets/char/duo-celebrate.webp';
const KEEP = 'art-source/duo-celebrate.orig.webp';
const BLEED = 3;      // rings of colour pushed outward; 3 is more than any resample reaches
const FEATHER = 0.6;  // sigma, in pixels — sub-pixel, so the silhouette does not move

if (!fs.existsSync(KEEP)) { fs.copyFileSync(SRC, KEEP); console.log('kept the delivered sheet at ' + KEEP); }

const { data, info } = await sharp(KEEP).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const px = Buffer.from(data);

// filled[i] is true where a pixel already carries the subject's colour
const filled = new Uint8Array(W * H);
let opaque = 0;
for (let i = 0; i < W * H; i++) { if (px[i * 4 + 3] > 0) { filled[i] = 1; opaque++; } }

/* STEP 0: DE-MATTE THE OUTERMOST OPAQUE RING, before anything else touches it.
 *
 * Bleeding colour outward and feathering the alpha both assume the pixels at the edge of
 * the subject are the subject. On this sheet they are not. It was keyed out of a dark
 * background, and the ring that survived carries that background mixed in: measured over
 * 86,703 edge pixels, mean luminance 112.7 against 131.9 one pixel further in — the rim of
 * both characters is 14.6% darker than the fur behind it. That dark rim IS the outline that
 * appears when the ending zooms, and it is baked into the opaque pixels, so no amount of
 * work on the transparent side removes it.
 *
 * Each edge pixel takes the average of the opaque pixels behind it instead. Sub-pixel work:
 * the silhouette does not move, one ring of colour is corrected. */
{
  const edge = new Uint8Array(W * H);
  const o = i => px[i * 4 + 3] > 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!o(i)) continue;
      if (!o(i - 1) || !o(i + 1) || !o(i - W) || !o(i + W)) edge[i] = 1;
    }
  }
  const fix = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!edge[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = (y + dy) * W + (x + dx);
          if (j === i || edge[j] || !o(j)) continue;      // clean subject only
          r += px[j * 4]; g += px[j * 4 + 1]; b += px[j * 4 + 2]; n++;
        }
      }
      if (n) fix.push([i, (r / n) | 0, (g / n) | 0, (b / n) | 0]);
    }
  }
  for (const [i, r, g, b] of fix) { px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; }
  console.log('de-matted ' + fix.length + ' contaminated edge pixels');
}

let painted = 0;
for (let ring = 0; ring < BLEED; ring++) {
  const next = new Uint8Array(filled);          // this ring reads the previous one only
  const todo = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (filled[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= W) continue;
          const j = yy * W + xx;
          if (!filled[j]) continue;
          r += px[j * 4]; g += px[j * 4 + 1]; b += px[j * 4 + 2]; n++;
        }
      }
      if (n) todo.push([i, (r / n) | 0, (g / n) | 0, (b / n) | 0]);
    }
  }
  for (const [i, r, g, b] of todo) {
    px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b;   // alpha untouched: still invisible
    next[i] = 1; painted++;
  }
  filled.set(next);
}
console.log('opaque ' + opaque + ', bled colour into ' + painted + ' transparent pixels');

const raw = { raw: { width: W, height: H, channels: 4 } };
const alpha = await sharp(px, raw).extractChannel(3).blur(FEATHER).toBuffer();
const rgb = await sharp(px, raw).removeAlpha().raw().toBuffer();
const out = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
  .joinChannel(alpha, { raw: { width: W, height: H, channels: 1 } })
    /* 82, not the 90 this started at. The feathered edge is 241k newly-detailed pixels and at
     90 the sheet went 484kB -> 805kB; at 82 it is 630kB, which is +146kB on a 12MB base-art
     budget for a sheet that is now the most magnified thing in the game. Below about 75 the
     fur starts to mush at the zoom this is drawn at. */
  .webp({ quality: 82, alphaQuality: 100, effort: 6 })
  .toBuffer();

fs.writeFileSync(SRC, out);

// and prove the edge is really soft now
const chk = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let semi = 0;
for (let i = 0; i < chk.data.length; i += 4) { const a = chk.data[i + 3]; if (a > 0 && a < 255) semi++; }
const before = fs.statSync(KEEP).size, after = out.length;
console.log('wrote ' + SRC + '  ' + (after / 1024).toFixed(0) + 'kB (was ' + (before / 1024).toFixed(0) + 'kB)');
console.log('semi-transparent edge pixels: ' + semi + ' (was 0)');
if (!semi) throw new Error('the edge is still hard — the feather did not take');
if (chk.info.width !== W || chk.info.height !== H) throw new Error('the sheet changed size; every DUO constant would move');
console.log('sheet still ' + chk.info.width + 'x' + chk.info.height + ' — every DUO constant still holds');
