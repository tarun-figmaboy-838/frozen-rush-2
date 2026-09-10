/* CHARACTER SHEET SLICER — raw generated grids in, engine-ready strips out.
 *
 * The generator delivers each animation as a GRID of frames at whatever size and
 * layout it felt like: run is 5x4 in 1536x1024, jump is 7x2 in 2172x724, and the
 * frames float at different heights inside their cells. The engine wants something
 * much stricter (see docs/ANIMATION.md): one horizontal strip, N cells of exactly
 * 420x320, the character centred in its cell with its lowest pixel a shared 6px
 * above the cell bottom, and the SAME character size across every animation.
 *
 * This bridges the two, and it is layout-agnostic on purpose:
 *
 *   FINDING FRAMES.  Connected components on the alpha mask, not a grid guess. A
 *                    sheet whose rows are uneven, or whose frame count is not the
 *                    product of two neat numbers, still comes out right — and a
 *                    speck of stray matte becomes its own tiny blob and is dropped
 *                    on area rather than being cropped into a frame. That last part
 *                    is not hypothetical: one of these sheets carries 147 specks.
 *
 *   READING ORDER.   Blobs are clustered into rows by vertical overlap, then sorted
 *                    left to right within each row. A grid read column-first would
 *                    scramble a run cycle.
 *
 *   ONE SCALE FOR EVERYTHING.  The scale is computed ONCE across every sheet, from
 *                    the largest frame in the whole set, so the character cannot
 *                    change size between animations. Scaling each sheet to fit its
 *                    own cell is the obvious thing to do and it is wrong: the
 *                    knockout's frames are shorter than the run's, so it would come
 *                    out a bigger animal sitting down.
 *
 *   BASELINE.        A locomotion sheet KEEPS its vertical bob — that is the
 *                    animation, and without it the run reads as skating. So run and
 *                    jump preserve each frame's height above the row's own lowest
 *                    point, and the deepest frame in the sheet lands on the shared
 *                    footline. A held-pose sheet (skid, shake, hurt) is flattened:
 *                    every frame goes on the footline, because a pose the character
 *                    holds while standing still has no business floating, and the
 *                    learner can sit on one for minutes.
 *
 *     node tools/slice-char.mjs            slice and write
 *     node tools/slice-char.mjs --report   measure and report, write nothing
 *     node tools/slice-char.mjs --contact  also write a contact sheet to inspect
 */
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
/* Reads the un-sliced sheets from art-source/ and writes the sliced .webp the game
   loads into game/assets/char. They used to share one folder inside the deploy root,
   which is how 10MB of source sheets ended up next to the art that ships. */
const SRC = join(ROOT, 'art-source', 'char-sheets');
const OUT = join(ROOT, 'game', 'assets', 'char');
const REPORT = process.argv.includes('--report');
const CONTACT = process.argv.includes('--contact');

/* Cell geometry, from CFG.sprite. Changing these means changing the engine too. */
const CW = 420, CH = 320, BASE_GAP = 6;
/* How much of the cell the tallest frame fills. Under 1 leaves the crop safety the
   delivery checklist asks for — nothing may touch a cell edge. */
const FILL = 0.94;

/* Which raw grid feeds which animation slot, and whether the sheet is locomotion
   (keeps its bob) or held poses (flattened onto the footline). */
/* Which raw grid feeds which slot, whether it keeps its bob, and WHICH of its frames
   are wanted. The generator delivered more than the engine uses, and where it did the
   extra frames are not padding — they are the wrong thing to end on:

     shake    24 delivered. The engine HOLDS the last frame of this sheet for as long
              as the learner takes over a puzzle, and it has to be the look into the
              crevasse. Frames 0-11 are the shiver settling into head-down; 12-23 go
              back to standing and shivering again, so ending there would hold a
              trembling pose with motion lines on it for minutes.
     hurt     18 delivered. Frames 16-17 are the character back on its feet, which is
              the opposite of what the Try Again card needs behind it. 0-15 ends on
              sat down and dazed.
     jump     14 delivered, and the engine addresses this sheet BY NAME. Picking the
              ten that form the arc — measured off each frame's own footline, so the
              highest really is the apex — keeps the existing jumpMap correct.

   run and skid are used whole: the run is distance-driven so more frames is simply a
   smoother cycle, and the skid is mapped across a 0-1 progress so any count works. */
const SHEETS = [
  /* The 36-frame run cycle delivered as an animated GIF, laid out as a padded grid
     by tools/gif-to-grid.mjs and PRE-SCALED there to match the other sheets' character
     size. run.png (the earlier 20-frame grid) is kept as the previous take. */
  { src: 'run-gif.png',    slot: 'run',   bob: true },
  // idle crouch launch rise apex fall preLand land absorb alert
  /* The 36-frame jump delivered as an animated GIF. All 36 are sliced so the arc can
     be MEASURED rather than guessed at; the ten the engine addresses by name are then
     picked from it — see the pick list below, which is derived from each frame's own
     foot height. */
  /* PICKED OFF THE MEASURED ARC, not guessed. Every frame's own foot line was read
     out of the sliced sheet, which showed the delivered animation is two hops: a small
     one around frames 7-15 and the real one at 16-23, then nineteen grounded frames.
     The apex is frames 19-20 at foot line 192, the deepest compression is frame 25 at
     174px tall, and the tallest grounded pose is 14.

       idle 32   a settled grounded frame
       crouch 25 the most compressed grounded frame
       launch 16 the foot leaving the ground, 252
       rise 17   climbing, 211
       apex 19   the highest frame in the sheet, 192
       fall 21   past the top, 208
       preLand 22 coming down, 236
       land 24   grounded and compressed, 183 tall
       absorb 27 rising out of the compression
       alert 14  the tallest grounded pose, for SURPRISED */
  { src: 'jump-gif.png',   slot: 'jump',  bob: true,
    pick: [32, 25, 16, 17, 19, 21, 22, 24, 27, 14] },
  /* THE SKID, redelivered. The engine maps this sheet across a 0-1 deceleration
     PROGRESS rather than a clock, so any frame count works and all 36 are used: the
     last frame is what the character holds as it comes to rest, which is exactly where
     the fright takes over.

     This replaces the earlier skid-gif.png take. The previous one is kept in
     art-source/char-sheets so the swap can be undone without regenerating anything. */
  /* NO OLD GRID IS LEFT IN THIS FOLDER. The superseded skid-gif.png was deleted
     rather than kept as a previous take: two grids for one slot, differing only by a
     suffix, is exactly how frames from two different deliveries end up merged into
     one sheet. The GIFs in art-source/gif are the archive; the grids are build
     intermediates and there is now exactly one per slot. */
  { src: 'skid-new-gif.png',  slot: 'skid',  bob: false },
  /* THE TRAMPLE AT THE EDGE — the delivered 36-frame loop the brief called
     'Tribbling/Trampling' (art-source/gif/trample-new.gif): the character rears up and
     stamps a front foot down, then settles and shifts his weight. LOOK_DOWN plays it for
     as long as the learner thinks. bob is KEPT: the rear-up lifts the whole body off the
     ice, and flattening every frame onto the footline would delete the stamp. The stomp
     lands on frame 12, which the engine reads to fire a puff, a jolt and a thud. */
  /* SHELVED in turn: the arrival at the edge is now the delivered 12-frame tremble
     (tremble-new.png, below), which ends on a settle, and the wait is the idle loop — so
     the trample has no moment left. Still measured, so the shared scale does not move. */
  { src: 'trample-gif.png', slot: 'trample', bob: true, shelved: true },
  /* THE TREMBLE AT THE EDGE — the owner's 12-frame sheet (4x3, art-source/char-sheets/
     tremble-src.png, re-guttered and pre-scaled by tools/sheet-to-grid.mjs). Notices the
     drop, looks down, trembles, looks to the player, settles. bob is OFF: every pose stands
     on four feet, and the delivery floats its rows at three different heights inside their
     cells (45px apart) — that is not a bob, it is the generator's layout, and flattening
     onto the shared foot line is what keeps him planted while the frames change. The
     engine plays it by a per-frame timing table (CFG.sprite.tremble), not at one rate. */
  { src: 'tremble-new.png', slot: 'tremble', bob: false },
  /* THE FRIGHT AT THE EDGE — the sheet SHAKE and LOOK_DOWN have been missing.
     Both states existed and had no art of their own: they fell back to a pose out of
     the jump sheet, so the one beat the whole puzzle hangs on — the character arriving
     at a hole in the world and reacting to it — was a still frame with a procedural
     tremor on top.

     All 36 frames are used. SHAKE walks the sheet at CFG.sprite.tremorFps and LOOK_DOWN
     then HOLDS the final frame, so the sheet has to END on the pose the character keeps
     while the learner works: this delivery does, settling to a standing alert stance.

     No hurt sheet yet. KNOCKOUT and HURT still fall back through here — see
     PlayerController — which is why the entry below is the shake and not a third slot. */
  /* SHELVED, on request: the arrival at the edge is the trample now. Still measured, so
     the shared scale does not move, and still built — into art-source/shelved/ rather than
     the deployed folder — so listing it again in CFG is all it takes to bring it back. */
  { src: 'ditch-new-gif.png', slot: 'shake', bob: false, shelved: true },
  /* THE KNOCKOUT, delivered. KNOCKOUT and HURT read the `hurt` slot, and with no
     sheet there they read the SHAKE frames BACKWARDS as an improvised recoil — which
     is a reasonable trick and nothing like a crash.

     This delivery is a whole performance: it runs, hits, tumbles through the air and
     ends sat down dazed with stars circling. The stars and the spiral eyes are DRAWN
     IN, so CFG.characters.koStars stays false — the engine adding its own ring on top
     would be the exact double-up docs/ANIMATION.md warns about. */
  { src: 'ko-new-gif.png',    slot: 'hurt',  bob: false, near: 200 },
  /* STANDING STILL, delivered — and this is the longest-lived pose in the game.

     LOOK_DOWN is what the character holds for the whole of a puzzle, and it held ONE
     frozen frame: its own comment in PlayerController says "the learner may sit on
     this pose for minutes". So for most of the runtime the character was a still
     image. 36 frames of breathing and a slight sway fix that with no gameplay
     change at all. */
  /* THE IDLE, redelivered as a 12-pose sheet (idle-src.png, 2026-09-07): blink, trunk sway,
     weight shift. Built like the tremble, through tools/sheet-to-grid.mjs. The engine
     crossfades consecutive frames at CFG.sprite.idleFps so twelve poses read as one
     smooth breath. The 36-frame GIF take (idle-new-gif.png) is superseded. */
  { src: 'idle-sheet.png', slot: 'idle', bob: false },
];

const ALPHA = 40;          // a pixel counts as content above this
/* A blob smaller than this share of the biggest is not a frame. It was 0.12, and a
   hair tuft that had bled in from the neighbouring grid cell cleared that bar and got
   composited into a frame as a clump of fur lying on the snow beside the character.
   A third of the body is well above any stray and well below any real pose. */
const MIN_AREA_FRAC = 0.30;

/** Every separate opaque region in an image, with its bounds. */
function blobs(data, W, H, C) {
  const seen = new Int32Array(W * H);
  const stack = new Int32Array(W * H);
  const out = [];
  for (let p = 0; p < W * H; p++) {
    if (seen[p] || data[p * C + 3] <= ALPHA) continue;
    let sp = 0; stack[sp++] = p; seen[p] = 1;
    let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0;
    const rowW = new Map();
    while (sp) {
      const q = stack[--sp];
      const qx = q % W, qy = (q - qx) / W;
      n++;
      rowW.set(qy, (rowW.get(qy) || 0) + 1);
      if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
      if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const r = ny * W + nx;
          if (seen[r] || data[r * C + 3] <= ALPHA) continue;
          seen[r] = 1; stack[sp++] = r;
        }
      }
    }
    /* THE FOOT LINE, which is not the same thing as the lowest pixel.

       Aligning frames on their lowest pixel is the obvious thing to do and it is why
       the character floated: in a head-down pose the lowest pixel is the tip of the
       trunk, up to 52px below the feet in this art, so that frame was hoisted 52px
       into the air and the animal visibly changed height and apparent size between
       poses. A trunk, a tail and a flailing leg are all narrow; the feet are several
       contact patches spread across the body. So the foot line is the LOWEST ROW that
       still carries a quarter of the frame's widest row, and everything below it is
       overhang that is allowed to hang past the ground. */
    let widest = 0;
    for (const w of rowW.values()) if (w > widest) widest = w;
    let contact = y0;
    for (const [ry, w] of rowW) if (w >= widest * 0.25 && ry > contact) contact = ry;
    out.push({ x0, x1, y0, y1, n, w: x1 - x0 + 1, h: y1 - y0 + 1,
               contact, above: contact - y0 + 1, below: y1 - contact });
  }
  return out;
}

/* ISOLATE THE CHARACTER inside one frame's crop.

   Area filtering catches a stray that is its own blob. It cannot catch one that is
   JOINED to the character by a thread of half-transparent matte, and the source sheets
   have those: a hair tuft from the cell next door came through as a clump of fur lying
   on the snow beside the animal, and because the thread made it one connected region
   there was nothing to filter.

   So the crop is labelled again at a HIGHER alpha threshold, which breaks those
   threads — they are exactly the faint pixels.

   WHAT IS ERASED IS DECIDED BY DISTANCE, NOT BY SIZE. Keeping only the biggest region
   was the obvious rule and it was wrong: sweat drops, motion lines and the little
   surprise marks are all separate regions too, and it deleted 60 of them from a single
   sheet — which is the character arriving with bits of its own performance missing. A
   fragment that bled in from the cell next door is FAR from the body; a sweat drop is
   right beside the head. So a region survives unless it sits clear of the body's own
   bounding box by more than a small margin. */
/* THE SLACK IS PER SHEET, because "decoration" is not one size.
 *
 * 14px is right for a sweat bead beside the head. It is completely wrong for the
 * knockout, whose stars ORBIT the character several body-widths out — every one of them
 * sits clear of the body's box, so all of them were erased: 485 dropped by the area
 * filter and 160 more by this function, which is the whole point of the animation
 * deleted. The frames came out as a mammoth sitting down with nothing to explain why.
 *
 * So a sheet can widen the slack, and can grow the crop box it is measured in — the
 * box comes from the BODY blob, so stars outside it are cropped away before this
 * function ever sees them. Both default to the old behaviour. */
async function isolate(sharpImg, box, slack) {
  const CUT = 150;            // a real edge is well above this; a matte thread is not
  const NEAR = slack === undefined ? 14 : slack;
  const { data, info } = await sharpImg
    .extract({ left: box.x0, top: box.y0, width: box.w, height: box.h })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  const seen = new Int32Array(W * H);
  const stack = new Int32Array(W * H);
  const regions = [];
  for (let p = 0; p < W * H; p++) {
    if (seen[p] || data[p * C + 3] < CUT) continue;
    const id = regions.length + 1;
    let sp = 0; stack[sp++] = p; seen[p] = id;
    let n = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
    while (sp) {
      const q = stack[--sp];
      const qx = q % W, qy = (q - qx) / W;
      n++;
      if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
      if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const r = ny * W + nx;
          if (seen[r] || data[r * C + 3] < CUT) continue;
          seen[r] = id; stack[sp++] = r;
        }
      }
    }
    regions.push({ id, n, x0, x1, y0, y1 });
  }
  if (regions.length <= 1) return { data, W, H, C, erased: 0, total: regions.length };

  const body = regions.reduce((a, b) => (b.n > a.n ? b : a));

  /* Distance to the body's PIXELS, not to its bounding box. The box of a head-down
     pose is a wide rectangle covering the whole animal, so a tuft lying under the chin
     was inside it and survived — which is precisely the fragment this exists to remove.
     The body mask is grown NEAR times instead, and anything the grown mask does not
     touch is a fragment from the cell next door. */
  let near = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) if (seen[p] === body.id) near[p] = 1;
  for (let pass = 0; pass < NEAR; pass++) {
    const grown = new Uint8Array(near);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (near[p]) continue;
        if (near[p - 1] || near[p + 1] || near[p - W] || near[p + W]) grown[p] = 1;
      }
    }
    near = grown;
  }
  const touching = new Set([body.id]);
  for (let p = 0; p < W * H; p++) {
    const id = seen[p];
    if (id && near[p]) touching.add(id);
  }
  const drop = new Set(regions.filter(r => !touching.has(r.id)).map(r => r.id));
  if (!drop.size) return { data, W, H, C, erased: 0, total: regions.length };

  /* Erase the far regions and the soft pixels hanging off them, so no half-transparent
     ghost of a deleted tuft is left behind. */
  for (let pass = 0; pass < 3; pass++) {
    const add = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (seen[p] || data[p * C + 3] === 0) continue;
        for (const q of [p - 1, p + 1, p - W, p + W]) {
          if (seen[q] && drop.has(seen[q])) { add.push(p); break; }
        }
      }
    }
    for (const p of add) { seen[p] = body.id + 1000; drop.add(body.id + 1000); }
  }
  let n = 0;
  for (let p = 0; p < W * H; p++) {
    if (seen[p] && drop.has(seen[p])) { data[p * C + 3] = 0; n++; }
  }
  return { data, W, H, C, erased: drop.size, total: regions.length, px: n };
}

/** Cluster blobs into rows by vertical overlap, then left-to-right in each row. */
function readingOrder(list) {
  const rows = [];
  for (const b of [...list].sort((p, q) => p.y0 - q.y0)) {
    const mid = (b.y0 + b.y1) / 2;
    const row = rows.find(r => mid >= r.top && mid <= r.bot);
    if (row) { row.items.push(b); row.top = Math.min(row.top, b.y0); row.bot = Math.max(row.bot, b.y1); }
    else rows.push({ top: b.y0, bot: b.y1, items: [b] });
  }
  rows.forEach(r => r.items.sort((p, q) => p.x0 - q.x0));
  return { frames: rows.flatMap(r => r.items), rows };
}

/* ---- pass one: measure every sheet, so one scale can serve them all ---- */
const measured = [];
for (const s of SHEETS) {
  const file = join(SRC, s.src);
  const { data, info } = await sharp(file).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const all = blobs(data, W, H, C);
  const biggest = Math.max(...all.map(b => b.n));
  const kept = all.filter(b => b.n >= biggest * MIN_AREA_FRAC);
  let { frames, rows } = readingOrder(kept);

  // only the frames this slot wants, in the order it wants them
  if (s.pick) {
    const src = frames;
    frames = s.pick.map(i => src[i]);
    rows = rows.map(r => ({ ...r, items: r.items.filter(q => frames.includes(q)) }))
               .filter(r => r.items.length);
  } else if (s.take) {
    frames = frames.slice(0, s.take);
    rows = rows.map(r => ({ ...r, items: r.items.filter(q => frames.includes(q)) }))
               .filter(r => r.items.length);
  }
  /* HOW FAR EACH FRAME IS LIFTED off its row's foot line. On a locomotion sheet this
     is the bob, and it is added to the frame's position — so the cell has to be able
     to hold `above + lift`, not just `above`. Leaving it out of the scale is what let
     the jump sheet's `rise` pose, which is both tall AND high, run off the top of its
     cell. */
  for (const f of frames) {
    if (!s.bob) { f.lift = 0; continue; }
    const row = rows.find(r => r.items.includes(f));
    f.lift = row ? Math.max(...row.items.map(q => q.contact)) - f.contact : 0;
  }
  /* NO BOX GROWING, and it is worth saying why rather than leaving it looking like
     an oversight.

     A frame box comes from the BODY blob, so the knockout art has decoration that
     falls outside it: a ring of stars orbiting several body-widths out. Widening the
     box does capture them, and it was tried — but every extent below is taken across
     ALL sheets to pick ONE scale, precisely so the character cannot change size
     between animations. A padded box immediately becomes the largest frame in the
     set, so K collapses and the character comes out visibly smaller in the run, the
     jump and the skid too. Measured: the body went from 74..303px wide to 107..250,
     and baseGap from 25 to 76.

     Keeping the outer ring therefore costs either a smaller character everywhere or
     a larger cell for everyone. Neither is worth it: the pose already reads as a
     knockout without them — it lands sitting down, dazed, with spiral eyes and the
     inner stars, which sit close enough to survive the crop. `near` below is what
     keeps those, and the far ring clips at the cell edge, which is where the sprite
     ends anyway. */
  measured.push({ ...s, file, data, W, H, C, frames, rows,
                  found: readingOrder(kept).frames.length, dropped: all.length - kept.length });
}

const maxW = Math.max(...measured.flatMap(m => m.frames.map(f => f.w)));
const maxH = Math.max(...measured.flatMap(m => m.frames.map(f => f.h)));
/* The tallest anything reaches ABOVE its feet — INCLUDING the bob that lifts it
   further — and the furthest anything hangs BELOW them, taken across every sheet,
   because one cell has to hold all of it at once. */
const maxAbove = Math.max(...measured.flatMap(m => m.frames.map(f => f.above + f.lift)));
const maxBelow = Math.max(...measured.flatMap(m => m.frames.map(f => f.below)));

/* ONE scale for the whole set, so the character cannot change size between
   animations, chosen so the tallest pose AND the longest overhang both fit inside a
   single cell with the crop safety the checklist asks for. */
const K = Math.min((CH - BASE_GAP) * FILL / (maxAbove + maxBelow), CW * FILL / maxW);

/* Where the feet go, measured from the TOP of the cell. Everything below it is the
   room reserved for a trunk or a tail hanging past the ground. */
const FOOT_ROW = Math.round(CH - BASE_GAP - maxBelow * K);
/* What the engine has to be told: how far the FOOT LINE sits above the cell bottom.
   CFG.sprite.baseGap must equal this, or the character walks above or below the snow. */
const ENGINE_BASE_GAP = CH - FOOT_ROW;

console.log(`largest frame ${maxW}x${maxH};  above the feet ${maxAbove}, below ${maxBelow}`);
console.log(`scale ${K.toFixed(4)}  ->  foot line at cell row ${FOOT_ROW}`);
console.log(`cell ${CW}x${CH}, fill ${FILL}`);
console.log(`ENGINE: CFG.sprite.baseGap must be ${ENGINE_BASE_GAP}\n`);

/* ---- pass two: build each sheet, in two sizes ----
 *
 * TWO SETS, ONE GEOMETRY. The base set is the 420x320 cell the engine has always drawn;
 * the hd set is the same cell at 1.5x (630x480), cut from the same grids with the same
 * foot line, so a hi-DPI screen gets a character with 2.25x the pixels and nothing else
 * changes: CFG.sprite.cellK is the only number the engine multiplies by. The grids are
 * built at native GIF size (see gif-to-grid.mjs), so both sets are DOWNSAMPLED from the
 * delivered pixels — the base at ~0.5x, the hd at ~0.77x — and neither is stretched.
 *
 * A GRID, NOT A STRIP. A 36-frame strip at 630px a cell is 22680px wide, past WebP's
 * 16383px limit and past every mobile GPU's texture size; the old 15120px strips were
 * already past the GPU (Chrome fell back to software tiling for them). Six columns keeps
 * every sheet under 4096px on both sides. The engine reads (f % cols, f / cols). */
const COLS = 6;
const SETS = [
  { name: 'base', dir: OUT,             k: 1,   quality: 82 },
  { name: 'hd',   dir: join(OUT, 'hd'), k: 1.5, quality: 80 }
];
const summary = [];
for (const set of SETS) {
  await mkdir(set.dir, { recursive: true });
  const cw = Math.round(CW * set.k), ch = Math.round(CH * set.k);
  const Ks = K * set.k, footRow = Math.round(FOOT_ROW * set.k);
  console.log(`\n== ${set.name} set: cell ${cw}x${ch}, scale ${Ks.toFixed(4)}, foot line at row ${footRow}, baseGap ${ch - footRow}`);

  for (const m of measured) {
    const n = m.frames.length;
    const cells = [];
    let strays = 0;
    // a shelved sheet is built and kept, but not where the game would fetch it
    const outDir = m.shelved ? join(ROOT, 'art-source', 'shelved', set.name) : set.dir;
    if (m.shelved) await mkdir(outDir, { recursive: true });

    for (const f of m.frames) {
      // measured in pass one off the row's own FOOT lines, so the bob is real movement
      const lift = f.lift || 0;
      const dw = Math.max(1, Math.round(f.w * Ks));
      const dh = Math.max(1, Math.round(f.h * Ks));
      const dx = Math.round((cw - dw) / 2);
      /* Positioned by the FOOT LINE. dy is the top of the crop, so it is the contact row
         less however much of this frame sits above its own feet. */
      const dy = Math.round(footRow - f.above * Ks - lift * Ks);

      const iso = await isolate(sharp(m.file), f, m.near);
      strays += iso.erased || 0;
      /* .png() matters: a resize on a RAW input hands back raw pixels, and composite()
         cannot parse those - it needs an encoded image. */
      const cut = await sharp(iso.data, { raw: { width: iso.W, height: iso.H, channels: iso.C } })
        .resize(dw, dh, { fit: 'fill', kernel: 'lanczos3' })
        .png().toBuffer();

      cells.push(await sharp({
        create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
      }).composite([{ input: cut, left: dx, top: Math.max(0, dy) }]).png().toBuffer());
    }

    const cols = Math.min(n, COLS), rows = Math.ceil(n / COLS);
    const sheet = sharp({
      create: { width: cw * cols, height: ch * rows, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    }).composite(cells.map((b, i) => ({ input: b, left: (i % COLS) * cw, top: Math.floor(i / COLS) * ch })));

    const outName = `mammoth-${m.slot}.webp`;
    if (!REPORT) {
      /* LOSSY, NOT NEAR-LOSSLESS. Near-lossless made every 36-frame sheet about 1.4MB, and
         a phone on a slow connection was paying for a difference no eye can see on painted
         cartoon sprites. alphaQuality stays at 100 so the edges, which ARE visible, keep
         their exact silhouettes. */
      await sheet.webp({ quality: set.quality, effort: 5, alphaQuality: 100 })
        .toFile(join(outDir, outName));
    }

    // where each frame's lowest and highest pixel ended up, within its own cell
    const bottoms = [];
    let top = ch;
    {
      const { data: d, info: inf } = await sheet.clone().raw().toBuffer({ resolveWithObject: true });
      const on = (x, y) => d[(y * inf.width + x) * inf.channels + 3] > 12;
      for (let i = 0; i < n; i++) {
        const cx = (i % COLS) * cw, cy = Math.floor(i / COLS) * ch;
        let low = -1;
        for (let y = cy + ch - 1; y >= cy && low < 0; y--) {
          for (let x = cx; x < cx + cw; x++) if (on(x, y)) { low = y - cy; break; }
        }
        bottoms.push(low);
        for (let y = cy; y < cy + ch && y - cy < top; y++) {
          let hit = false;
          for (let x = cx; x < cx + cw; x++) if (on(x, y)) { hit = true; break; }
          if (hit) { top = y - cy; break; }
        }
      }
    }
    const hi = Math.max(...bottoms);
    /* The number that matters: where each frame's FEET ended up. On a held-pose sheet
       these must all be identical, or the character shifts under a pose it is holding. */
    const feet = m.frames.map(f => Math.round(footRow - (f.lift || 0) * Ks));
    const fLo = Math.min(...feet), fHi = Math.max(...feet);

    if (set.name === 'base') {
      summary.push({ slot: m.slot, n, drift: fHi - fLo, lowest: hi, highest: top });
    }
    console.log(`${m.slot.padEnd(7)} ${n} of ${m.found} frames  ${m.rows.length} row(s)  ` +
                `${m.dropped} speck(s), ${strays} joined stray(s) erased  ` +
                `feet ${fLo}..${fHi} (bob ${fHi - fLo})  px ${top}..${hi}  ` +
                `${cw * cols}x${ch * rows}  -> ${m.shelved ? 'SHELVED ' : ''}${set.name}/${REPORT ? '(not written)' : outName}`);

    if (CONTACT && !REPORT && set.name === 'base') {
      await sharp(join(outDir, outName))
        .flatten({ background: { r: 168, g: 214, b: 240 } })
        .resize({ width: Math.min(cw * cols, 3600) })
        .png().toFile(join(ROOT, 'test-results', `contact-${m.slot}.png`));
    }
  }
}

console.log('\nframes: { ' + summary.map(s => `${s.slot}: ${s.n}`).join(', ') + ' }');
const warn = summary.filter(s => !s.slot.match(/run|jump/) && s.drift > 2);
if (warn.length) console.log('WARNING held-pose sheets that still drift: ' +
  warn.map(s => `${s.slot} ${s.drift}px`).join(', '));
for (const s of summary) {
  if (s.lowest > CH - 1) console.log(`WARNING ${s.slot}: content reaches the cell bottom`);
  if (s.highest < 1) console.log(`WARNING ${s.slot}: content reaches the cell top`);
}
console.log('\nSet CFG.sprite.baseGap = ' + ENGINE_BASE_GAP +
            ' and leave the per-frame footline correction OFF: every frame in every ' +
            'sheet is already standing on the same line.');
if (!REPORT) await writeFile(join(ROOT, 'test-results', 'slice-char.json'),
  JSON.stringify({ scale: K, maxW, maxH, maxAbove, maxBelow,
                   contactRow: FOOT_ROW, engineBaseGap: ENGINE_BASE_GAP, summary }, null, 2));
