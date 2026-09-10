/* THE INSTRUCTION PLANK, from the delivered board.
 *
 *   consumes  art-source/sign-plank-src.png    (2172x724, the owner's delivery)
 *   writes    game/assets/ui/plank-l.webp
 *             game/assets/ui/plank-m.webp
 *             game/assets/ui/plank-r.webp
 *   prints    the art-pixel geometry the stylesheet is built from
 *
 * WHY THREE SLICES AND NOT ONE PICTURE. The panel grows with its sentence — "Cut the
 * triangle." and "Use the right ice piece to fix the path." are very different widths —
 * and the board has a rope lashing and its steel eyelets at each end. Scale the whole
 * picture to fit a sentence and those get squashed: a rope stretched to 1.6x reads as a
 * smear, and the two ends stop matching each other. So the ENDS are pinned at their
 * natural aspect and only the wood between them is allowed to stretch, where the grain
 * runs the way it is being stretched and nobody can tell.
 *
 * THE BOARD NO LONGER HANGS FROM ANYTHING, and the cap detector changed with it. The
 * delivery before this one was a sign on two ropes that ran up out of the frame, so the
 * ends were found by looking for THE ONLY THING DRAWN WELL ABOVE THE PLANK. This board has
 * no ropes going up — the rope is lashed around each end, in the plane of the wood — so
 * that scan finds the snow along the top and nothing else, and it found no ends at all.
 * The ends are now found where they actually are: the columns of the WOOD that are not
 * plain wood. Rope, eyelet and dark end grain all read as that; snow does not vote,
 * because it lies along the whole top edge and would swallow the board.
 *
 * NO ROPE IS DRAWN IN CSS, here or in the stylesheet. Whatever the board hangs by is in
 * the picture; the stylesheet only drops it in and lets it settle.
 *
 * EVERY NUMBER BELOW IS MEASURED, not chosen: the cuts are placed from the alpha and the
 * colour of the delivered file (see the report this prints), so a re-delivery at another
 * size still cuts in the right places.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'art-source/sign-plank-src.png';
const OUT = 'game/assets/ui/';

const src = sharp(SRC).ensureAlpha();
const { data, info } = await src.raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const A = (x, y) => data[(y * W + x) * C + 3];
const RGB = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };

/* ---- 1. trim to what is actually drawn ---- */
let x0 = W, y0 = H, x1 = -1, y1 = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y) > 8) {
  if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
}
const TW = x1 - x0 + 1, TH = y1 - y0 + 1;

/* ---- 2. the plank's own band: the rows where the art is wide ---- */
let plankTop = -1, plankBot = -1;
for (let y = 0; y < H; y++) {
  let n = 0;
  for (let x = 0; x < W; x++) if (A(x, y) > 8) n++;
  if (n > W * 0.5) { if (plankTop < 0) plankTop = y; plankBot = y; }
}

/* ---- 3. the ends: the columns of wood that are not plain wood ----
   Measured down the board's own rows, skipping the top edge where the snow sits and the
   bottom edge where the dark rim runs the whole length — neither says anything about where
   an END is. What is left that is neither pale wood nor bluish snow is the rope, its
   eyelets and the dark end grain, which is exactly the furniture that must not stretch. */
const woodTop = plankTop + 40, woodBot = plankBot - 10;
const rows = woodBot - woodTop;
const hardware = x => {
  let n = 0;
  for (let y = woodTop; y <= woodBot; y++) {
    if (A(x, y) < 60) continue;
    const [r, g, b] = RGB(x, y);
    if ((r > 215 && g > 180 && b > 130) || b > r) continue;      // pale wood, or snow
    n++;
  }
  return n / rows;
};
const dense = [];
for (let x = 0; x < W; x++) if (hardware(x) > 0.2) dense.push(x);
const runs = [];
for (const x of dense) {
  const last = runs[runs.length - 1];
  if (last && x === last[1] + 1) last[1] = x; else runs.push([x, x]);
}
/* Only runs near an end are furniture. A short run out in the middle of the board is a
   grain line — measured, there is one at x 703 — and a grain line is the one thing that
   stretches invisibly, so including it would pin most of the board for nothing. */
const real = runs.filter(r => r[1] - r[0] > 3);
const nearL = real.filter(r => r[1] < W * 0.2);
const nearR = real.filter(r => r[0] > W * 0.8);
if (!nearL.length || !nearR.length) {
  throw new Error(`no end furniture found: runs ${JSON.stringify(real)}`);
}
/* 40px clear past the last of it, so the cut never lands on the edge of a dark line and
   leaves half of it to be stretched. */
const MARGIN = 40;
/* THE TWO CAPS ARE THE SAME WIDTH, and that is what centres the sentence.

   Taken independently they came out 313 and 246: the left lashing has a dark grain band
   just inside it that the right one does not, so the cut had to clear it on one side only.
   The stylesheet pads by the cap, so the text then sat 67 art px — 6.4 screen px — right of
   the board's middle, and it read exactly as "the words are not centred".

   Both problems go away by cutting both caps at the WIDER of the two. Nothing is stretched
   that was not stretched before (the extra is plain wood), the board stays symmetric because
   the art's two lashings are symmetric — measured 196 and 198 px wide, 7 and 8 px in from
   their own edges — and the sentence can be centred on the box and on the two ends at once. */
const needL = nearL[nearL.length - 1][1] + MARGIN - x0;
const needR = x1 - (nearR[0][0] - MARGIN) + 1;
const capW = Math.max(needL, needR);
const capL = x0 + capW;
const capR = x1 - capW + 1;
if (capR - capL < W * 0.3) throw new Error(`the caps leave only ${capR - capL}px to stretch`);

/* ---- 3b. the PALE PANEL: the light timber the sentence sits on ----
   The plank band above is every row where the art is wide, which includes the snow lying
   along the top edge and the dark rim under the bottom. Centring a sentence on THAT puts it
   36 art px high on the wood it is actually printed on. Sampled between the two lashings,
   where the timber is plain. */
let paleTop = -1, paleBot = -1;
{
  const from = Math.round(W * 0.32), to = Math.round(W * 0.74), span = to - from;
  for (let y = 0; y < H; y++) {
    let pale = 0;
    for (let x = from; x < to; x++) {
      if (A(x, y) < 200) continue;
      const [r, g, b] = RGB(x, y);
      if (r > 215 && g > 180 && b > 120 && r - b > 25) pale++;
    }
    if (pale / span > 0.8) { if (paleTop < 0) paleTop = y; paleBot = y; }
  }
  if (paleTop < 0) throw new Error('no pale panel found');
}

/* ---- 4. the slice that stretches: EVERYTHING BETWEEN THE CAPS ----
   Not a narrow sample from the middle, and this is the whole difference between a board
   and three pieces of one. The plank is hand-drawn: its top edge, the pale inner panel and
   its bottom edge all wander by a few pixels along its length. Take the stretching slice
   from somewhere else on the board and the column that meets the cap is a column that was
   never next to it — measured on an earlier cut, the pale panel started 6px higher and
   ended 8px lower than in the cap it butted against, which at the size the sign is drawn
   is a two-pixel step in the board's own edge at each join. That is exactly what reads as
   "the crop is visible".
   Cutting the middle out of the span BETWEEN the caps makes both seams continuous by
   construction: the middle's first column is the cap's next column, and the same at the
   other end. Whatever the wood does along its length, it lines up. It also keeps the snow
   that lies along the middle of the board, which a narrow clean sample would throw away. */
const M0 = capL, M1 = capR;

/* ---- 5. cut ---- */
await mkdir(OUT, { recursive: true });
const cut = async (name, left, width) => {
  await sharp(SRC).ensureAlpha()
    .extract({ left, top: y0, width, height: TH })
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(OUT + name);
  return { name, left, width };
};
const L = await cut('plank-l.webp', x0, capL - x0);
const M = await cut('plank-m.webp', M0, M1 - M0);
const R = await cut('plank-r.webp', capR, x1 - capR + 1);

/* ---- 5b. prove the joins line up, rather than assuming they do ---- */
const profile = async (file, col) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const x = col < 0 ? width + col : col;
  let top = null, bot = null, paleTop = null, paleBot = null;
  for (let y = 0; y < height; y++) {
    const i = (y * width + x) * channels;
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a > 40) { if (top === null) top = y; bot = y; }
    if (a > 200 && r > 200 && g > 170 && b > 120) { if (paleTop === null) paleTop = y; paleBot = y; }
  }
  return { top, paleTop, paleBot, bot };
};
const seam = async (a, ac, b, bc, name) => {
  const p = await profile(OUT + a, ac), q = await profile(OUT + b, bc);
  const off = ['top', 'paleTop', 'paleBot', 'bot'].map(kk => Math.abs(q[kk] - p[kk]));
  const worst = Math.max(...off);
  console.log(`  ${name} seam: top/paleTop/paleBot/bot out by ${off.join('/')} art px`);
  if (worst > 1) throw new Error(`the ${name} seam is ${worst}px out — the slices would not read as one board`);
};
console.log('');
await seam('plank-l.webp', -2, 'plank-m.webp', 1, 'left');
await seam('plank-m.webp', -2, 'plank-r.webp', 1, 'right');

/* ---- 6. the numbers the stylesheet needs, in TRIMMED art pixels ---- */
const t = v => v - x0;
console.log(`
source            ${SRC}  ${W}x${H}
trimmed art       ${TW} x ${TH}   (opaque x ${x0}..${x1}, y ${y0}..${y1})
the plank's wood  y ${plankTop - y0}..${plankBot - y0}   (${plankBot - plankTop + 1} rows of ${TH})
end furniture     ${JSON.stringify(real.map(r => [t(r[0]), t(r[1])]))}

  slice        art x            width
  plank-l      0..${t(capL)}${' '.repeat(Math.max(1, 12 - String(t(capL)).length))}${L.width}
  plank-m      ${t(M0)}..${t(M1)}${' '.repeat(Math.max(1, 10 - String(t(M1)).length))}${M.width}
  plank-r      ${t(capR)}..${TW}${' '.repeat(Math.max(1, 8 - String(TW).length))}${R.width}

FOR css/style.css (.instruction-pill):
  --k            = --sign-h / ${TH}
  caps           left ${t(capL)}, right ${TW - t(capR)}  (art px, never stretched)
  middle width   calc(100% - ${t(capL) + (TW - t(capR))} * var(--k) + 24px)
  wood centre    art y ${Math.round((plankTop + plankBot) / 2 - y0)}
  PALE PANEL     y ${paleTop - y0}..${paleBot - y0}   centre ${((paleTop + paleBot) / 2 - y0).toFixed(1)}
                 (the light timber the words sit on — NOT the plank band, which counts the
                  snow-covered rows along the top and centres the sentence too high)
  text box       y ${paleTop - y0}..${paleBot - y0}   padding ${paleTop - y0} top, ${TH - (paleBot - y0) - 1} bottom
`);
