/* THE BUTTON ART, from the supplied normal/pressed pairs.
 *
 * Both of this game's picture buttons work the same way, because that is how the art
 * is drawn: THE PRESS IS ALREADY IN THE PICTURE. The pressed take has the coloured cap
 * pushed down into its rim, so swapping the image IS the press, and a transform on top
 * of it would double the travel into a lurch.
 *
 * THE ONE THING THAT HAS TO BE GOT RIGHT IS REGISTRATION. Trimming each file to its
 * own opaque bounds makes the button change SIZE when you press it, because the two
 * takes are never exactly the same size — the play pair is 1866x711 and 1880x707. So
 * each take is trimmed and then padded onto ONE common box:
 *
 *   centred horizontally, aligned along the BOTTOM
 *
 * A button rests on a baseline and a press moves the cap down inside a rim that stays
 * where it is, so the bottom is the edge that must not move. Whatever height the
 * pressed take is short by then reads as the button sinking, which is what it is.
 *
 * The common box's aspect ratio is printed, because the stylesheet has to declare it
 * (`aspect-ratio`) or the art gets letterboxed inside its own element.
 *
 *   node tools/make-buttons.mjs          # every pair
 *   node tools/make-buttons.mjs jump     # just one
 */
import sharp from 'sharp';
import { writeFileSync, existsSync } from 'node:fs';

/* One entry per button. `outW` is about twice the widest the control is ever drawn on
   a 1920 stage, which is as much resolution as a 2x display can show. */
const BUTTONS = {
  /* PLAY came as a SINGLE take this time — a nearly square amber-to-red button with the
     word painted into it — so, like TRY AGAIN below, it has no `pressed` entry and the
     press is done in CSS (a darkening plus a compression). The previous delivery was a
     two-take pair and its pressed file went with it.
     outW 900: the button is drawn up to about 460px on a 4K stage, and twice that is as
     much resolution as a 2x display can show. */
  play: {
    normal: 'art-source/btn-play-raw.png',
    outNormal: 'game/assets/ui/btn-play.webp',
    outW: 900
  },
  /* TRY AGAIN came as a SINGLE take — there is no pressed version of it. So it has
     no `pressed` entry, the builder just trims and scales the one image, and the press
     is done in CSS as a darkening plus a squash. That is the same call the round jump
     button makes for the same reason, and it is why the family's rule is "the press is
     in the art WHERE THERE IS pressed art". */
  tryagain: {
    normal: 'art-source/btn-tryagain-raw.png',
    outNormal: 'game/assets/ui/btn-tryagain.webp',
    outW: 760
  },
  /* THE JUMP PAIR IS NO LONGER SHIPPED. The button was removed on request — a tap
     anywhere jumps, so the stage is the control — and nothing in the game fetches
     btn-normal/btn-pressed any more. The entry stays because the delivered art stays: if
     a control ever comes back this is how it is built, and deleting the recipe would
     leave two raw PNGs in art-source with nothing that knows what they are for. Running
     this writes files the site does not use; that is the cost of keeping the recipe. */
  jump: {
    normal: 'art-source/btn-jump-normal-raw.png',
    pressed: 'art-source/btn-jump-pressed-raw.png',
    outNormal: 'game/assets/ui/btn-normal.webp',
    outPressed: 'game/assets/ui/btn-pressed.webp',
    outW: 420
  }
};

/** Opaque bounds of an image, alpha > 8. */
async function bounds(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error(file + ' is fully transparent');
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

async function build(name, cfg) {
  // a single-state button (no pressed art) is fine — see the tryagain note above
  const states = cfg.pressed ? ['normal', 'pressed'] : ['normal'];
  for (const st of states) {
    if (!existsSync(cfg[st])) {
      console.log(`SKIP ${name}: ${cfg[st]} is not there yet`);
      return;
    }
  }
  const b = { normal: await bounds(cfg.normal) };
  if (cfg.pressed) b.pressed = await bounds(cfg.pressed);
  const boxW = Math.max(...states.map(st => b[st].width));
  const boxH = Math.max(...states.map(st => b[st].height));

  for (const state of states) {
    const t = b[state];
    const trimmed = await sharp(state === 'normal' ? cfg.normal : cfg.pressed)
      .extract(t).png().toBuffer();
    /* Composited and resized in TWO passes on purpose. Sharp runs resize BEFORE
       composite whatever order the calls are written in, so asking for both at once
       shrinks the canvas first and then refuses the full-size overlay. */
    const placed = await sharp({
      create: { width: boxW, height: boxH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([{ input: trimmed, left: Math.round((boxW - t.width) / 2), top: boxH - t.height }])
      .png()
      .toBuffer();
    const buf = await sharp(placed).resize({ width: cfg.outW }).webp({ quality: 94, effort: 6 }).toBuffer();
    const dest = state === 'normal' ? cfg.outNormal : cfg.outPressed;
    writeFileSync(dest, buf);
    const m = await sharp(buf).metadata();
    console.log(`  ${dest}  ${m.width}x${m.height}  ${(buf.length / 1024).toFixed(1)}kB` +
                `  (source opaque ${t.width}x${t.height})`);
  }
  console.log(`  ${name}: common box ${boxW}x${boxH} -> aspect-ratio: ${boxW} / ${boxH}` +
              `  (${(boxW / boxH).toFixed(4)})`);
}

const only = process.argv[2];
for (const [name, cfg] of Object.entries(BUTTONS)) {
  if (only && only !== name) continue;
  console.log(name + ':');
  await build(name, cfg);
}
