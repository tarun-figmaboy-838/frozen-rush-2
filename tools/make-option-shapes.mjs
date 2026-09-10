/* THE THREE SHAPES THE SUPPLIED SET DOES NOT COVER.
 *
 * The delivered ice blocks cover 11 of the 14 geometries the curriculum names. Three
 * are missing — regularHexagon, concavePentagon, concaveHexagon — and two of those are
 * ANSWERS in phases 6 and 7, so the game cannot ship without them.
 *
 * They are not drawn from scratch. Each is built from the delivered art's own material
 * so it cannot look like a different set:
 *
 *   INTERIOR   real pixels, lifted from a donor block and masked to the new outline,
 *              inset so none of the donor's own bevel comes with it. So the frost
 *              mottling, the cracks and the air bubbles are the supplied ones.
 *   FRAME      rebuilt to the construction measured off the delivered art at
 *              1254x1254: a 4px saturated outline (11,148,247), a bright cyan bevel
 *              band about 40px wide (111..123, 212..226, 251), and an inner shadow
 *              step (42,170,246) where the bevel meets the face.
 *   GEOMETRY   the verified ring from polygons.js, so the side count, the convexity
 *              and the concavity are the checked ones rather than whatever a hand
 *              drawing happened to produce.
 *
 *     node tools/make-option-shapes.mjs
 */
import sharp from 'sharp';
import { join, resolve } from 'node:path';
import { pointsOf } from '../game/js/polygons.js';

const ROOT = resolve(import.meta.dirname, '..');
// the delivered PNGs are source art and live outside the deploy root
const SRC_DIR = join(ROOT, 'art-source', 'option-shape');
const DIR = join(ROOT, 'game', 'assets', 'option-shape');

const S = 1254;                    // same canvas as the delivered art
const PAD = 0.955;                 // the delivered blocks nearly fill their canvas
const OUTLINE = 4;
const BEVEL = 40;
const INNER = 6;

/* Which donor supplies the interior. Chosen for a big uninterrupted face, so the crop
   is all interior and none of it is the donor's own frame. */
const WANT = [
  { id: 'regularHexagon',  donor: 'regularOctagon.png' },
  { id: 'concavePentagon', donor: 'regularPentagon.png' },
  { id: 'concaveHexagon',  donor: 'regularHeptagon.png' }
];

/** The verified ring, fitted into an S x S canvas with a little padding. */
function ring(id) {
  const pts = pointsOf(id);
  if (!pts.length) throw new Error('no verified geometry for ' + id);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const k = Math.min(S * PAD / (x1 - x0), S * PAD / (y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return pts.map(p => [S / 2 + (p.x - cx) * k, S / 2 + (p.y - cy) * k]);
}

/** The same ring shrunk about its centre, for insetting the bevel and the texture. */
function shrink(pts, f) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(p => [cx + (p[0] - cx) * f, cy + (p[1] - cy) * f]);
}
const poly = pts => pts.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');

const svg = body =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${body}</svg>`);

for (const { id, donor } of WANT) {
  const outer = ring(id);
  // how much of the half-width the frame eats, so the inset is proportional
  const frameIn = 1 - (OUTLINE + BEVEL + INNER) / (S * 0.5);
  const face = shrink(outer, frameIn);

  /* 1. the face: a vertical ramp taken from the delivered art's own readings —
        light at the top, deep blue at the bottom. This shows through wherever the
        borrowed texture is thin. */
  const base = await sharp(svg(`
    <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#CCF4FD"/>
      <stop offset="0.45" stop-color="#A6EEFE"/>
      <stop offset="1" stop-color="#1DA3F2"/>
    </linearGradient></defs>
    <polygon points="${poly(outer)}" fill="url(#f)"/>`)).png().toBuffer();

  /* 2. real ice, lifted from a donor and masked to the new face. */
  const texMask = await sharp(svg(`<polygon points="${poly(face)}" fill="#fff"/>`))
    .png().toBuffer();
  const donorFace = await sharp(join(DIR, donor))
    // pull from the middle of the donor, well inside its own frame
    .extract({ left: 210, top: 210, width: S - 420, height: S - 420 })
    .resize(S, S, { fit: 'fill' })
    .png().toBuffer();
  const texture = await sharp(donorFace)
    .composite([{ input: texMask, blend: 'dest-in' }])
    .png().toBuffer();

  /* 3. the frame, to the measured construction: bright bevel, inner shadow step,
        saturated outline. Stroked on inset rings so every band sits inside the
        silhouette and the outline stays the true edge. */
  const bevelRing = shrink(outer, 1 - (OUTLINE + BEVEL / 2) / (S * 0.5));
  const innerRing = shrink(outer, 1 - (OUTLINE + BEVEL + INNER / 2) / (S * 0.5));
  const frame = await sharp(svg(`
    <defs><linearGradient id="b" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#7BE2FC"/>
      <stop offset="0.5" stop-color="#6FD4FB"/>
      <stop offset="1" stop-color="#2FB0F8"/>
    </linearGradient></defs>
    <polygon points="${poly(bevelRing)}" fill="none" stroke="url(#b)"
             stroke-width="${BEVEL}" stroke-linejoin="miter"/>
    <polygon points="${poly(innerRing)}" fill="none" stroke="#2AAAF6"
             stroke-width="${INNER}" stroke-linejoin="miter" opacity="0.75"/>
    <polygon points="${poly(outer)}" fill="none" stroke="#0B94F7"
             stroke-width="${OUTLINE}" stroke-linejoin="miter"/>`)).png().toBuffer();

  const out = join(DIR, id + '.png');
  await sharp({ create: { width: S, height: S, channels: 4,
                          background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: base }, { input: texture }, { input: frame }])
    .png().toFile(out);
  console.log(`built ${id}.png  (${pointsOf(id).length} sides, interior from ${donor})`);
}
