/* SLICE THE DELIVERED OBSTACLE SHEETS — BY CONNECTED COMPONENT, NOT BY GRID.
 *
 * Both sheets look like a tidy 2x2 of four obstacles, and cutting them on the midlines is
 * the obvious thing to do. It is also wrong: the art OVERLAPS the quadrant boundaries.
 * The tusk on the top-left fossil curves right, past the vertical midline, into the
 * top-right quadrant — so a grid cut severed it, leaving a thin crescent orphaned in one
 * file and a truncated curve in another. Neither looked like an obstacle.
 *
 * So the sheet is treated as what it actually is: a few islands of opaque pixels on
 * transparency. Each island is found by flood fill and cropped to its own bounds, which
 * cannot cut through anything — a shape is either wholly in one component or it is
 * touching its neighbour, in which case they genuinely are one object (the crossed logs)
 * and belong in one file.
 *
 * Pieces that touch only at a snow drift merge, which is correct: that drift is drawn as
 * shared ground and splitting it would leave both halves with a sheared edge.
 *
 *     node tools/slice-obstacles.mjs
 */
import sharp from 'sharp';

const SHEETS = ['obsticals.png', 'obstical1.png'];
const SRC = 'art-source/sheets/';   // the delivered sheets live with the other source art
const DIR = 'game/assets/env/';    // the sliced pieces the game loads
const ALPHA = 40;          // a pixel counts as content above this
const MIN_AREA = 4000;     // below this it is a stray speck, not an obstacle

/* Names are assigned by reading order — left to right, top to bottom — so the output is
   stable across runs and a re-slice does not silently reshuffle which art is which. */
const NAMES = {
  'obsticals.png': ['log-fallen', 'log-arch', 'log-crossed', 'log-stump'],
  'obstical1.png': ['bone-ribs', 'bone-cage', 'bone-tusk', 'bone-arch']
};

for (const file of SHEETS) {
  const src = SRC + file;
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const at = (x, y) => data[(y * W + x) * C + 3];

  /* Flood fill each island. An explicit stack rather than recursion: a full-width island
     is hundreds of thousands of pixels and would blow the call stack. */
  const seen = new Uint8Array(W * H);
  const comps = [];
  for (let y0 = 0; y0 < H; y0++) {
    for (let x0 = 0; x0 < W; x0++) {
      const i0 = y0 * W + x0;
      if (seen[i0] || at(x0, y0) <= ALPHA) continue;
      let minX = x0, maxX = x0, minY = y0, maxY = y0, area = 0;
      const stack = [i0];
      seen[i0] = 1;
      while (stack.length) {
        const i = stack.pop();
        const x = i % W, y = (i - x) / W;
        area++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        // 8-connected, so a diagonal hairline of snow still holds a piece together
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (seen[ni] || at(nx, ny) <= ALPHA) continue;
            seen[ni] = 1;
            stack.push(ni);
          }
        }
      }
      if (area >= MIN_AREA) comps.push({ minX, minY, maxX, maxY, area });
    }
  }

  // reading order: rows first (banded by vertical overlap), then left to right
  comps.sort((a, b) => (Math.abs(a.minY - b.minY) > H * 0.2 ? a.minY - b.minY : a.minX - b.minX));

  console.log(file + '  ' + W + 'x' + H + '  -> ' + comps.length + ' islands');
  const names = NAMES[file] || [];
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    const name = names[i] || ('extra-' + (i + 1));
    const w = c.maxX - c.minX + 1, h = c.maxY - c.minY + 1;
    const out = DIR + 'obs-' + name + '.webp';
    await sharp(src)
      .extract({ left: c.minX, top: c.minY, width: w, height: h })
      .webp({ quality: 90 })
      .toFile(out);
    console.log('  ' + name.padEnd(13) + w + 'x' + h + '  ' + Math.round(c.area / 1000) + 'k px  -> ' + out);
  }
  if (comps.length !== names.length) {
    console.log('  NOTE: ' + comps.length + ' islands but ' + names.length +
      ' names — check the roster in engine.js (OBSTACLE_ART) matches what was written.');
  }
}
