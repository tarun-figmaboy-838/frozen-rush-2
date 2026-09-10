/* WHAT ARE THESE SHAPES, and what should they be called?
 *
 * The supplied ice-block art arrives with generator filenames. For a game whose whole
 * lesson is "count the sides", a filename is not good enough — the side count has to
 * be measured off the artwork, because a file called "pentagon" that is really a
 * hexagon would teach the wrong thing and nothing would catch it.
 *
 * So: trace the alpha silhouette, simplify the outline until only real corners are
 * left, count them, and work out whether the sides are equal (regular) and whether any
 * corner turns inward (concave). Then name each file for what it measurably IS.
 *
 *   node tools/name-option-shapes.mjs           report only
 *   node tools/name-option-shapes.mjs --rename  also rename the files
 */
import sharp from 'sharp';
import { readdir, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
// the delivered PNGs it renames are source art, outside the deploy root
const DIR = join(ROOT, 'art-source', 'option-shape');
const DO_RENAME = process.argv.includes('--rename');
const ALPHA = 80;

const NAMES = { 3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon',
                7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon' };

/** Moore-neighbour contour trace of the largest opaque region. */
function contour(mask, W, H) {
  let start = -1;
  for (let p = 0; p < W * H && start < 0; p++) if (mask[p]) start = p;
  if (start < 0) return [];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const sx = start % W, sy = (start - (start % W)) / W;
  const out = [[sx, sy]];
  let cx = sx, cy = sy, dir = 0, guard = 0;
  do {
    let moved = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8;            // start looking back-left, turn right
      const nx = cx + dirs[d][0], ny = cy + dirs[d][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || !mask[ny * W + nx]) continue;
      cx = nx; cy = ny; dir = d; out.push([cx, cy]); moved = true; break;
    }
    if (!moved) break;
  } while ((cx !== sx || cy !== sy) && ++guard < W * H * 4);
  return out;
}

/** Ramer-Douglas-Peucker on a closed ring. */
function simplify(pts, eps) {
  const seg = (a, b, p) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
  };
  const rdp = list => {
    if (list.length < 3) return list;
    let worst = 0, wi = 0;
    for (let i = 1; i < list.length - 1; i++) {
      const d = seg(list[0], list[list.length - 1], list[i]);
      if (d > worst) { worst = d; wi = i; }
    }
    if (worst <= eps) return [list[0], list[list.length - 1]];
    return [...rdp(list.slice(0, wi + 1)).slice(0, -1), ...rdp(list.slice(wi))];
  };
  // split the ring at its two extremes so RDP sees two open chains
  let far = 0, fi = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > far) { far = d; fi = i; }
  }
  const a = rdp(pts.slice(0, fi + 1)), b = rdp(pts.slice(fi));
  const ring = [...a.slice(0, -1), ...b.slice(0, -1)];
  // drop any corner that barely turns: two sides that read as one
  const keep = [];
  for (let i = 0; i < ring.length; i++) {
    const p0 = ring[(i - 1 + ring.length) % ring.length], p1 = ring[i], p2 = ring[(i + 1) % ring.length];
    const a1 = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const a2 = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > 0.20) keep.push(p1);              // ~11 degrees
  }
  return keep;
}

const files = (await readdir(DIR)).filter(f => /\.(png|webp)$/i.test(f)).sort();
const rows = [];

for (const f of files) {
  const { data, info } = await sharp(join(DIR, f)).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const mask = new Uint8Array(W * H);
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let p = 0; p < W * H; p++) {
    if (data[p * C + 3] <= ALPHA) continue;
    mask[p] = 1;
    const x = p % W, y = (p - x) / W;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const span = Math.max(x1 - x0, y1 - y0);
  // tolerance proportional to the shape, so a big render is not over-simplified
  let ring = simplify(contour(mask, W, H), Math.max(3, span * 0.02));

  const n = ring.length;
  const lens = ring.map((p, i) => {
    const q = ring[(i + 1) % n];
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
  const spread = n ? (Math.max(...lens) - Math.min(...lens)) / Math.max(...lens) : 1;
  const turns = ring.map((_, i) => {
    const a = ring[(i - 1 + n) % n], b = ring[i], c = ring[(i + 1) % n];
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  });
  const convex = !(turns.some(t => t > 0) && turns.some(t => t < 0));
  const regular = spread <= 0.12;

  const base = NAMES[n] || (n + 'gon');
  const kind = !convex ? 'concave' : regular ? 'regular' : 'irregular';
  const id = kind + base[0].toUpperCase() + base.slice(1);
  rows.push({ f, n, spread: +(spread * 100).toFixed(0), convex, regular, id,
              w: x1 - x0 + 1, h: y1 - y0 + 1 });
}

console.log('\n  sides  sides-spread  shape        suggested id                 file');
for (const r of rows) {
  console.log(`  ${String(r.n).padStart(5)}  ${String(r.spread + '%').padStart(12)}  ` +
              `${(r.convex ? 'convex ' : 'CONCAVE').padEnd(11)}  ${r.id.padEnd(26)}  ${r.f}`);
}

// how many of each id, so duplicates are obvious
const byId = {};
for (const r of rows) byId[r.id] = (byId[r.id] || 0) + 1;
console.log('\n  counts: ' + Object.entries(byId).map(([k, v]) => k + ' x' + v).join(', '));

const NEED = ['regularTriangle', 'regularQuadrilateral', 'regularPentagon', 'regularHexagon',
              'regularHeptagon', 'regularOctagon', 'irregularPentagon',
              'irregularConvexPentagon', 'irregularHexagon', 'irregularConvexHexagon',
              'irregularConvexOctagon', 'concavePentagon', 'concaveHexagon', 'concaveHeptagon'];
const have = new Set(rows.map(r => r.id));
const missing = NEED.filter(k => !have.has(k) &&
  !(k.startsWith('irregularConvex') && have.has('irregular' + k.slice(15))));
console.log('\n  the curriculum needs 14 geometries; these cover: ' +
            NEED.filter(k => have.has(k)).join(', '));
console.log('  NOT covered: ' + (missing.join(', ') || 'none'));

if (DO_RENAME) {
  const used = {};
  for (const r of rows) {
    used[r.id] = (used[r.id] || 0) + 1;
    const suffix = used[r.id] > 1 ? '-' + used[r.id] : '';
    const to = r.id + suffix + '.png';
    if (r.f !== to) { await rename(join(DIR, r.f), join(DIR, to)); console.log(`  ${r.f}  ->  ${to}`); }
  }
}
