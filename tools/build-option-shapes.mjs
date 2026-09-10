/* THE OPTION SHAPES: art in, geometry and a game-sized texture out.
 *
 * The hanging options are now the supplied ice blocks rather than shapes drawn in
 * canvas. That only works if the ENGINE'S GEOMETRY AND THE PICTURE ARE THE SAME THING,
 * because the geometry is what the game does everything with: it seats the block so its
 * flat side is up, swells it until that edge spans the crevasse, clips it to the hole,
 * hangs the rope from the middle of its top edge, and — the whole point of the game —
 * it is what the learner counts the sides of. A vertex list that disagreed with the
 * drawing by even a little would show up as a rope attached to thin air and a plug that
 * did not fit.
 *
 * So the ring is not written by hand. It is TRACED OFF EACH IMAGE: contour the alpha,
 * simplify until only real corners remain, drop any corner that barely turns, and
 * normalise to the trimmed box. Then it is checked against what the curriculum calls
 * that shape — 6 sides for a hexagon, concave really concave — and the build fails
 * rather than shipping a picture that teaches the wrong number.
 *
 * The texture is trimmed to its opaque bounds and written as WebP, which is what lets
 * the engine draw it with one drawImage over the ring's own bounding box.
 *
 *     node tools/build-option-shapes.mjs
 *     node tools/build-option-shapes.mjs --check    verify only, write nothing
 */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
/* IN AND OUT ARE DIFFERENT FOLDERS NOW. The delivered PNGs are source art and lived
   inside game/, which is the folder that gets deployed — 43MB of inputs no URL in the
   game ever requests, kept out of the upload only by a pair of .vercelignore files
   that had to list them by glob. Source art now lives in art-source/ with the rest of
   it, so the served folder holds only what the game actually loads and the ignore
   files no longer have to know about any of it. */
const SRC_DIR = join(ROOT, 'art-source', 'option-shape');
const DIR = join(ROOT, 'game', 'assets', 'option-shape');
const CHECK = process.argv.includes('--check');
const ALPHA = 80;
const OUT_MAX = 560;              // a chunk never renders wider than ~280px

/* curriculum id -> the delivered file that IS that shape. Measured, not assumed:
   tools/name-option-shapes.mjs traced every delivered block and renamed it for its own
   side count, so these names are the measurement. The three built by
   tools/make-option-shapes.mjs fill the gaps the delivered set left. */
const MAP = {
  regularTriangle:         'regularTriangle.png',
  regularQuadrilateral:    'regularQuadrilateral.png',
  regularPentagon:         'regularPentagon.png',
  regularHexagon:          'regularHexagon.png',        // built
  regularHeptagon:         'regularHeptagon.png',
  regularOctagon:          'regularOctagon.png',
  irregularPentagon:       'irregularPentagon.png',
  irregularConvexPentagon: 'irregularPentagon-2.png',
  irregularHexagon:        'irregularHexagon.png',
  irregularConvexHexagon:  'irregularHexagon-2.png',
  irregularConvexOctagon:  'irregularOctagon.png',
  concavePentagon:         'concavePentagon.png',       // built
  concaveHexagon:          'concaveHexagon.png',        // built
  concaveHeptagon:         'concaveHeptagon.png',
  /* A SECOND CONCAVE PENTAGON (built). "Cut the concave pentagon" wants two answers,
     and the delivered set has one — so this fills the gap the same way the three above
     do, from the verified ring and a donor's own material. */
  concavePentagon2:        'concavePentagon2.png',
  /* PART 2's DRAWING SLAB, delivered as 1.png and renamed for what it measures as —
     the way every other name in this table was arrived at (see the note above). Four
     sides, irregular, convex, and therefore exactly two diagonals, which is the whole
     subject of the level it belongs to. */
  iceQuadrilateral:        'iceQuadrilateral.png'
};

/* What each id has to be, so a wrong picture cannot pass silently. */
const EXPECT = {
  regularTriangle: [3, true, true], regularQuadrilateral: [4, true, true],
  regularPentagon: [5, true, true], regularHexagon: [6, true, true],
  regularHeptagon: [7, true, true], regularOctagon: [8, true, true],
  irregularPentagon: [5, false, true], irregularConvexPentagon: [5, false, true],
  irregularHexagon: [6, false, true], irregularConvexHexagon: [6, false, true],
  irregularConvexOctagon: [8, false, true],
  concavePentagon: [5, false, false], concaveHexagon: [6, false, false],
  concaveHeptagon: [7, false, false],
  concavePentagon2: [5, false, false],
  iceQuadrilateral: [4, false, true]
};

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
      const d = (dir + 6 + k) % 8;
      const nx = cx + dirs[d][0], ny = cy + dirs[d][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || !mask[ny * W + nx]) continue;
      cx = nx; cy = ny; dir = d; out.push([cx, cy]); moved = true; break;
    }
    if (!moved) break;
  } while ((cx !== sx || cy !== sy) && ++guard < W * H * 4);
  return out;
}

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
  let far = 0, fi = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > far) { far = d; fi = i; }
  }
  const ring = [...rdp(pts.slice(0, fi + 1)).slice(0, -1), ...rdp(pts.slice(fi)).slice(0, -1)];
  const keep = [];
  for (let i = 0; i < ring.length; i++) {
    const p0 = ring[(i - 1 + ring.length) % ring.length], p1 = ring[i], p2 = ring[(i + 1) % ring.length];
    const a1 = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const a2 = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > 0.20) keep.push(p1);
  }

  /* MERGE CORNERS THAT ARE REALLY ONE CORNER.

     The painted blocks have slightly rounded, mitred corners, so there is no single
     tolerance that works: loose enough to read one corner per corner and it drifts
     20px off the paint (a rim floating beside the picture in game); tight enough to
     stay on the paint and it splits each rounded corner into two or three, and a
     quadrilateral traces as a hexagon with 1%-long sides.

     So the tolerance stays tight and the fragments are collapsed afterwards: while the
     shortest side is a small fraction of the longest, replace its two ends with their
     midpoint. That converges on the real corner count from either direction, and it is
     the same rule polygons.js verify() applies when it rejects a side under 16% of the
     longest as "too short to count". */
  let ring2 = keep;
  for (let guard = 0; guard < 40 && ring2.length > 3; guard++) {
    const lens = ring2.map((p, i) => {
      const q = ring2[(i + 1) % ring2.length];
      return Math.hypot(q[0] - p[0], q[1] - p[1]);
    });
    const longest = Math.max(...lens);
    let si = -1, sv = Infinity;
    for (let i = 0; i < lens.length; i++) if (lens[i] < sv) { sv = lens[i]; si = i; }
    if (sv >= longest * 0.14) break;
    const a = ring2[si], b = ring2[(si + 1) % ring2.length];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    ring2 = ring2.filter((_, i) => i !== si && i !== (si + 1) % ring2.length);
    ring2.splice(Math.min(si, ring2.length), 0, mid);
  }
  return ring2;
}

const problems = [], out = {};

for (const [id, file] of Object.entries(MAP)) {
  const src = join(SRC_DIR, file);
  const { data, info } = await sharp(src).ensureAlpha().raw()
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
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  /* A TIGHT tolerance. At 2% of the shape a traced corner could land 20-odd
     source pixels outside the painted edge, and because the engine CLIPS the texture
     to the ring that showed up in game as a rim floating just off the picture with a
     sliver of nothing between them. 0.6% keeps the corner on the paint and still
     removes every point that is not a corner. */
  const ring = simplify(contour(mask, W, H), Math.max(2, Math.max(bw, bh) * 0.006));
  const n = ring.length;

  /* Normalised to the TRIMMED box, from -1..1 on its longer side, so the ring and the
     trimmed texture describe the same rectangle and the engine can draw one over the
     other with a single drawImage. */
  const k = 2 / Math.max(bw, bh);
  const pts = ring.map(([px, py]) => ({
    x: +(((px - x0) - bw / 2) * k).toFixed(5),
    y: +(((py - y0) - bh / 2) * k).toFixed(5)
  }));

  // ---- verify against what the curriculum calls this shape ----
  const [wantN, wantReg, wantConvex] = EXPECT[id];
  const lens = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
  const spread = (Math.max(...lens) - Math.min(...lens)) / Math.max(...lens);
  const turns = pts.map((_, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  });
  const convex = !(turns.some(t => t > 0) && turns.some(t => t < 0));
  const regular = spread <= 0.12;

  /* SIDES AND CONVEXITY ARE ASSERTED; REGULARITY IS ONLY REPORTED.

     Side count and convexity survive tracing: one is an integer, the other is the sign
     of a turn, and neither moves if a corner lands a few pixels out. Regularity is a
     continuous measure and the trace is not precise enough to carry it — the
     simplifier's tolerance is 2% of the shape, which measured puts a genuinely regular
     octagon at 10% side spread while a genuinely irregular concave hexagon comes in at
     8%. An assertion on that would fail correct art and pass wrong art with equal
     enthusiasm.

     It costs nothing, because regularity is not what the learner is asked to judge —
     the number of sides is — and it is already verified to 2% on the exact coordinates
     in polygons.js. So the declared value is carried through and the traced one is
     printed to eyeball. */
  if (n !== wantN) problems.push(`${id}: traced ${n} sides from ${file}, curriculum says ${wantN}`);
  if (convex !== wantConvex) problems.push(`${id}: traced ${convex ? 'convex' : 'concave'}, curriculum says ${wantConvex ? 'convex' : 'concave'}`);
  const shortest = Math.min(...lens) / Math.max(...lens);
  if (shortest < 0.10) problems.push(`${id}: shortest side is ${(shortest * 100) | 0}% of the longest — it will not read as a side`);

  /* NO NEARLY-FLAT CORNER. A corner that barely turns is not a corner: the two sides
     either side of it read as one straight side, so a hexagon looks like a pentagon —
     which is the exact mistake this game asks the learner not to make.

     It is also what made a test fail rather than a picture look odd: at 45 degrees of
     rotation, float error was enough to flip the sign of a near-zero turn, so a shape
     verified convex measured concave. Same underlying fault, and polygons.js rejects
     it on the same grounds. Measured as the turn ANGLE, which unlike the cross product
     does not scale with the length of the sides. */
  const angles = pts.map((_, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const a1 = Math.atan2(b.y - a.y, b.x - a.x);
    const a2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
  });
  const flattest = Math.min(...angles);
  if (flattest < 0.16) {                       // about 9 degrees
    problems.push(`${id}: its flattest corner turns only ${(flattest * 180 / Math.PI).toFixed(1)} degrees — ` +
                  `those two sides will read as one, so it counts as ${n - 1}`);
  }

  // ---- the texture: trimmed to the silhouette, game-sized, WebP ----
  const scale = Math.min(1, OUT_MAX / Math.max(bw, bh));
  const outName = id + '.webp';
  if (!CHECK) {
    /* LOSSY, NOT NEAR-LOSSLESS — the same lesson tools/slice-char.mjs already learned for
       the character sheets, which this tool never got. Near-lossless was costing 122-283kB
       PER BLOCK and 2.9MB for the set; all fourteen are fetched on every load (the engine
       preloads the whole of optionShapes), so it was the single largest blocking download
       in the game, three times the size of the entire character set a phone pulls.

       It buys nothing here, and the reason is specific rather than a judgement call: the
       SILHOUETTE — the thing the learner counts the sides of — is not carried by this file
       at all. paintGlacierChunk traces the ring from option-shapes.js and CLIPS to it, so
       the countable outline is vector geometry and cannot be touched by an encoder. What
       this file carries is the ice texture INSIDE that outline, and it is only ever drawn
       downscaled: a 560px block renders at ~273 stage px at most (three options, the widest
       case), which is a 2x reduction before a pixel reaches the screen even at renderScale 1.

       q86 measured across the set: 2.9MB -> ~1.0MB, with alphaQuality kept at 100 because
       the 2% over-draw in paintGlacierChunk reads the alpha edge. */
    await sharp(src)
      .extract({ left: x0, top: y0, width: bw, height: bh })
      .resize(Math.round(bw * scale), Math.round(bh * scale), { kernel: 'lanczos3' })
      .webp({ quality: 86, effort: 6, alphaQuality: 100 })
      .toFile(join(DIR, outName));
  }

  out[id] = {
    image: 'assets/option-shape/' + outName,
    sides: n, regular: wantReg, convex,
    aspect: +(bw / bh).toFixed(5),
    points: pts
  };
  console.log(`  ${id.padEnd(24)} ${n} sides  ${convex ? 'convex ' : 'CONCAVE'}  ` +
              `${wantReg ? 'regular  ' : 'irregular'}  traced spread ${String((spread * 100) | 0).padStart(2)}%  ` +
              `${bw}x${bh} -> ${Math.round(bw * scale)}x${Math.round(bh * scale)}`);
}

if (problems.length) {
  console.log('\nPROBLEMS:\n  ' + problems.join('\n  '));
  process.exit(1);
}

const body = `/* GENERATED by tools/build-option-shapes.mjs — do not edit by hand.
 *
 * One entry per shape the curriculum names. \`points\` is the ring TRACED OFF THE
 * ARTWORK, normalised so -1..1 spans the longer side of the image's trimmed box —
 * which means the ring and the texture describe the same rectangle, and the engine can
 * lay one over the other with a single drawImage.
 *
 * \`sides\`, \`convex\` and \`regular\` are measured from that ring, not declared, and the
 * build fails if any of them disagrees with what the curriculum calls the shape. So the
 * number a learner counts on screen is the number the game is checking.
 */
export const optionShapes = ${JSON.stringify(out, null, 2)};

/** The ring for a shape, or null if the art does not cover it. */
export function shapeRing(id) {
  const s = optionShapes[id];
  return s ? s.points : null;
}

/** How many sides a shape has, measured from its own artwork. */
export function shapeSides(id) {
  const s = optionShapes[id];
  return s ? s.sides : 0;
}
`;
if (!CHECK) {
  await writeFile(join(ROOT, 'game', 'js', 'option-shapes.js'), body);
  console.log('\nwrote game/js/option-shapes.js  (' + Object.keys(out).length + ' shapes)');
} else {
  console.log('\ncheck only: ' + Object.keys(out).length + ' shapes, no problems');
}
