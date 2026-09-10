/* A DELIVERED SPRITE SHEET -> A GRID THE SLICER CAN READ.
 *
 * The companion to tools/gif-to-grid.mjs, for art delivered as a still PNG sheet rather
 * than as an animated GIF. Everything about WHY is the same and is written up there; what
 * this one adds:
 *
 *   POSES ARE FOUND, NOT CUT ON THE GRID. The first version cut the sheet on its nominal
 *   rows x cols boundaries, and the tremble delivery does not respect its own grid: the
 *   second pose's tusk reaches 17px into the third pose's cell. Cutting there sliced the
 *   tusk off one frame and pasted its tip into the next (seen in play as a floating tusk
 *   fragment). So poses are connected components on the alpha mask — every region at least
 *   a third the size of the biggest — read row by row, left to right, and each is cut on
 *   ITS OWN outline however far it strays from the grid. The rows/cols arguments are now
 *   only a check: the count found must match, or the tool refuses.
 *
 *   IT RE-GUTTERS. Each pose is composited into a cell with 48px of clear space around it,
 *   so the slicer downstream, which also uses blob detection, cannot merge two of them.
 *
 * The pre-scale is the same constant and the same metric as gif-to-grid: the character is
 * brought to a sqrt(opaque area) of --ref px so it comes out the same size as every other
 * animation. The slicer applies ONE scale to the whole set, so a sheet delivered at half
 * the size of the others would otherwise put a half-size character on the ice.
 *
 *     node tools/sheet-to-grid.mjs <sheet.png> <out-name.png> --rows=3 --cols=4 [--ref=340]
 *
 * Reads from and writes to art-source/char-sheets unless the path has a separator in it.
 */
import sharp from 'sharp';
import { resolve, join, isAbsolute } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'art-source', 'char-sheets');
const arg = (name, dflt) => {
  const a = process.argv.find(s => s.startsWith('--' + name + '='));
  return a ? Number(a.slice(name.length + 3)) : dflt;
};
const where = p => (isAbsolute(p) || p.includes('/') || p.includes('\\')) ? p : join(SRC, p);
const IN = where(process.argv[2] || 'tremble-src.png');
const OUT = where(process.argv[3] || 'tremble-new.png');
const ROWS = arg('rows', 3), COLS_IN = arg('cols', 4);
const REF = arg('ref', 340);
const GUTTER = 48;               // the same clear margin gif-to-grid leaves
const ALPHA = 40;                // a pixel counts as content above this
const MIN_AREA_FRAC = 0.30;      // a region smaller than this share of the biggest is a speck
const OUT_COLS = 6;              // the slicer reads six-column grids

const { data, info } = await sharp(IN).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
console.log(`sheet ${W}x${H}, nominally ${COLS_IN}x${ROWS}, reference character ${REF}px (sqrt of opaque area)`);

/* Connected components on the alpha mask, 8-connected, iterative. */
const seen = new Uint8Array(W * H), stack = new Int32Array(W * H), regions = [];
for (let p = 0; p < W * H; p++) {
  if (seen[p] || data[p * C + 3] <= ALPHA) continue;
  let sp = 0; stack[sp++] = p; seen[p] = 1;
  let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0;
  while (sp) {
    const q = stack[--sp]; const qx = q % W, qy = (q - qx) / W; n++;
    if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = qx + dx, ny = qy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const r = ny * W + nx;
      if (!seen[r] && data[r * C + 3] > ALPHA) { seen[r] = 1; stack[sp++] = r; }
    }
  }
  regions.push({ x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n });
}
const biggest = Math.max(...regions.map(r => r.n));
const poses = regions.filter(r => r.n >= biggest * MIN_AREA_FRAC);
/* Reading order: rows by the nominal row height (a pose belongs to the row its centre
   falls in), then left to right. */
const rowOf = r => Math.min(ROWS - 1, Math.floor((r.y0 + r.h / 2) / (H / ROWS)));
poses.sort((a, b) => (rowOf(a) - rowOf(b)) || (a.x0 - b.x0));
poses.forEach((p, i) => { p.i = i; });
if (poses.length !== ROWS * COLS_IN) {
  console.error(`found ${poses.length} poses, expected ${ROWS * COLS_IN} — check the sheet (specks: ${regions.length - poses.length})`);
  process.exit(1);
}
/* Detached marks that belong to a pose — a "!" over the head, shake lines beside the
   body — are small regions near a pose. They are folded into the nearest pose's box when
   they sit inside that pose's nominal cell, so the slicer sees them as one frame. */
for (const r of regions) {
  if (poses.includes(r) || r.n < 60) continue;
  const cx = r.x0 + r.w / 2, cy = r.y0 + r.h / 2;
  const owner = poses.find(p => cx >= p.x0 - 60 && cx <= p.x0 + p.w + 60 && cy >= p.y0 - 80 && cy <= p.y0 + p.h + 20);
  if (!owner) continue;
  const nx1 = Math.max(owner.x0 + owner.w, r.x0 + r.w), ny1 = Math.max(owner.y0 + owner.h, r.y0 + r.h);
  owner.x0 = Math.min(owner.x0, r.x0); owner.y0 = Math.min(owner.y0, r.y0);
  owner.w = nx1 - owner.x0; owner.h = ny1 - owner.y0; owner.marks = (owner.marks || 0) + 1;
}
const areas = poses.map(p => Math.sqrt(p.n)).sort((a, b) => a - b);
const size = areas[areas.length >> 1];
const k = REF / size;
console.log(`${poses.length} poses (${regions.length - poses.length} small regions), sqrt(area) median ${size.toFixed(0)}  ->  pre-scale ${k.toFixed(4)}`);
console.log('pose boxes: ' + poses.map(p => `${p.w}x${p.h}${p.marks ? '+' + p.marks + 'mk' : ''}`).join('  '));
const strays = poses.filter(p => Math.floor(p.x0 / (W / COLS_IN)) !== Math.floor((p.x0 + p.w - 1) / (W / COLS_IN)));
if (strays.length) console.log(`${strays.length} pose(s) cross a nominal cell edge (cut on their own outline): ` + strays.map(p => '#' + p.i).join(' '));

/* One cell for the widest and tallest pose in the sheet, plus the gutter. The poses share
   a bottom edge in their cells: a delivered sheet floats its poses at whatever height it
   likes (this one puts its last row 45px higher than its first), and that is not a bob to
   preserve — the slicer flattens held-pose sheets onto one foot line anyway. */
const cw = Math.round(Math.max(...poses.map(p => p.w)) * k) + GUTTER;
const ch = Math.round(Math.max(...poses.map(p => p.h)) * k) + GUTTER;
const rowsOut = Math.ceil(poses.length / OUT_COLS);
const tiles = [];
for (const p of poses) {
  const dw = Math.max(1, Math.round(p.w * k)), dh = Math.max(1, Math.round(p.h * k));
  /* The cut is the pose's OWN box, so a neighbour whose tusk reaches into it is masked
     out: only pixels of this pose's region (or its folded-in marks) are kept. */
  const own = Buffer.alloc(p.w * p.h * 4);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const si = ((p.y0 + y) * W + (p.x0 + x)) * C, di = (y * p.w + x) * 4;
    own[di] = data[si]; own[di + 1] = data[si + 1]; own[di + 2] = data[si + 2]; own[di + 3] = data[si + 3];
  }
  // mask: drop pixels that belong to another pose's region (a neighbour's tusk tip)
  for (const q of poses) {
    if (q === p) continue;
    const ox0 = Math.max(p.x0, q.x0), ox1 = Math.min(p.x0 + p.w, q.x0 + q.w);
    const oy0 = Math.max(p.y0, q.y0), oy1 = Math.min(p.y0 + p.h, q.y0 + q.h);
    if (ox0 >= ox1 || oy0 >= oy1) continue;
    // in the overlap, keep a pixel only if it is nearer this pose's centre than the other's
    const pcx = p.x0 + p.w / 2, qcx = q.x0 + q.w / 2;
    for (let y = oy0; y < oy1; y++) for (let x = ox0; x < ox1; x++) {
      if (Math.abs(x - pcx) > Math.abs(x - qcx)) own[((y - p.y0) * p.w + (x - p.x0)) * 4 + 3] = 0;
    }
  }
  const cut = await sharp(own, { raw: { width: p.w, height: p.h, channels: 4 } })
    .resize(dw, dh, { kernel: 'lanczos3' }).png().toBuffer();
  const col = p.i % OUT_COLS, row = (p.i - col) / OUT_COLS;
  tiles.push({ input: cut, left: col * cw + Math.round((cw - dw) / 2),
               top: row * ch + (ch - Math.round(GUTTER / 2) - dh) });
}
await sharp({ create: { width: OUT_COLS * cw, height: rowsOut * ch, channels: 4,
                        background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(tiles).png().toFile(OUT);
console.log(`wrote ${OUT.replace(ROOT, '').replace(/^[\\/]/, '')}  ${OUT_COLS * cw}x${rowsOut * ch}  ` +
            `${OUT_COLS}x${rowsOut} cells of ${cw}x${ch} (gutter ${GUTTER})`);
