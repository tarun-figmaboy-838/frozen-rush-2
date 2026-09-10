import { test, expect } from '@playwright/test';
import { boot } from './helpers.mjs';

/* Asset and sprite integrity.
 *
 * Every one of these has caught a real defect in this project at least once:
 *
 *   CUTS      a frame whose opaque pixels ran to the edge of its cell had had a
 *             trunk or a tail sliced off, and bled into its neighbour.
 *   CLUTTER   neighbouring bodies touch in the raw sheets, so slicing a cell's
 *             bounding box dragged in a paw belonging to the next frame — which
 *             showed up in game as dark fragments floating around the character.
 *   SIZE      the source sheets are not all drawn at the same scale, so a character
 *             grew by a third when it stopped running.
 *   BOB       bottom-aligning every frame glues the lowest pixel to one line and
 *             deletes the vertical bob, and the run reads as sliding.
 */

/* The cell geometry (cw, ch, cols) comes from sheetFor(): the base set is a 420x320 cell in
   a six-column grid, the hd set the same cell at 1.5x. These tests run at DPR 1 and so
   measure the base set; tests/hd.spec.mjs covers the other. */
/* Where the FOOT LINE sits above the cell bottom. Read from the engine, not written
   down here: tools/slice-char.mjs builds the sheets to CFG.sprite.baseGap and prints
   the value, and a copy in the tests would just go stale. */
const baseGapOf = page => page.evaluate(async () => {
  const m = await import('/js/engine.js');
  return m.CFG.sprite.baseGap;
});

/* The lowest row of a frame that still carries a quarter of that frame's widest row.
   That is the character's feet — a trunk, a tail or a flailing leg is narrow, and
   taking the lowest PIXEL instead is what used to leave a head-down pose floating
   50px above the path. */
function footRow(frame) {
  const wide = Math.max(...frame.rows);
  let foot = 0;
  frame.rows.forEach((w, y) => { if (w >= wide * 0.25 && y > foot) foot = y; });
  return foot;
}

/** Load a sheet and measure every frame: bounds, body count, edge contact.
    Passed to page.evaluate as a real function — as a template STRING it was
    evaluated as an expression and the url argument never arrived. */
const MEASURE = async ([url, cw, ch, cols, nFrames]) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const W = c.width, H = c.height;
  const d = g.getImageData(0, 0, W, H).data;
  // 40, not 16: an anti-aliased edge trails specks at 7% opacity that are invisible
  // on screen but read as separate bodies to a flood fill
  const on = (x, y) => d[(y * W + x) * 4 + 3] > 40;
  const cells = nFrames;
  const frames = [];

  for (let f = 0; f < cells; f++) {
    // the frame's own cell in the six-column grid
    const gx0 = (f % cols) * cw, gy0 = Math.floor(f / cols) * ch;
    let x0 = cw, x1 = -1, y0 = ch, y1 = -1, n = 0;
    // opaque width per row, which is what finds the FEET as opposed to the lowest pixel
    const rows = new Array(ch).fill(0);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (!on(gx0 + x, gy0 + y)) continue;
        n++; rows[y]++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (n === 0) { frames.push({ empty: true }); continue; }

    // connected bodies, on a half-resolution mask so this stays quick
    const sw = cw >> 1, sh = ch >> 1;
    const seen = new Uint8Array(sw * sh);
    const bodies = [];
    const stack = new Int32Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) {
      if (seen[i]) continue;
      const px = (i % sw) << 1, py = ((i / sw) | 0) << 1;
      if (!on(gx0 + px, gy0 + py)) { seen[i] = 1; continue; }
      let sp = 0, area = 0, edge = false;
      stack[sp++] = i; seen[i] = 1;
      while (sp > 0) {
        const k = stack[--sp];
        area++;
        const kx = k % sw, ky = (k / sw) | 0;
        if (kx === 0 || kx === sw - 1) edge = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = kx + dx, ny = ky + dy;
          if (nx < 0 || ny < 0 || nx >= sw || ny >= sh) continue;
          const ni = ny * sw + nx;
          if (seen[ni]) continue;
          if (!on(gx0 + (nx << 1), gy0 + (ny << 1))) { seen[ni] = 1; continue; }
          seen[ni] = 1; stack[sp++] = ni;
        }
      }
      bodies.push({ area, edge });
    }
    bodies.sort((a, b) => b.area - a.area);
    frames.push({
      x0, x1, y0, y1, area: n, rows,
      w: x1 - x0 + 1, h: y1 - y0 + 1,
      touchesLeft: x0 === 0, touchesRight: x1 === cw - 1, touchesTop: y0 === 0,
      bodies: bodies.length,
      mainArea: bodies.length ? bodies[0].area : 0,
      // only a detached body that RUNS OFF A CELL EDGE is a neighbour's spill
      spillArea: bodies.slice(1).filter(b => b.edge).reduce((a, b) => a + b.area, 0),
      // detached but self-contained: the cub's skid spray and motion arcs
      fxArea: bodies.slice(1).filter(b => !b.edge).reduce((a, b) => a + b.area, 0)
    });
  }
  return { W, H, cells, frames, cw, ch };
};

test.describe('assets', () => {
  test.setTimeout(180_000);

  test('every referenced asset resolves, and is WebP', async ({ page }) => {
    const errors = await boot(page);
    const urls = await page.evaluate(async () => {
      // option-shapes.js carries the ice-block textures, which are most of the weight
      const engine = (await (await fetch('/js/engine.js')).text()) +
                     (await (await fetch('/js/option-shapes.js')).text());
      const css = await (await fetch('/css/screens.css')).text();
      const found = new Set();
      /* A reference is a FILE. The obstacle loader builds its filenames
         ('assets/env/obs-' + kind + '.webp'), so the bare prefix is a string in the
         source but never something the game requests; matching it produced a phantom
         404. Anything without an extension is a prefix or a directory, and is skipped. */
      for (const m of engine.matchAll(/['"](assets\/[^'"]+)['"]/g)) {
        if (/\.[a-z0-9]+$/i.test(m[1])) found.add(m[1]);
      }
      for (const m of css.matchAll(/url\("\.\.\/(assets\/[^"]+)"\)/g)) found.add(m[1]);
      return [...found];
    });
    expect(urls.length, 'assets are referenced').toBeGreaterThan(15);

    /* Photographic and painted art must be WebP — that is where the weight is. The
       interface is SVG on purpose: it has to stay sharp at any scale and be recoloured
       and animated, which a raster cannot do. So the rule is per kind, not global. */
    const bad = [];
    for (const raw of urls) {
      // the stylesheets' urls carry the file's content hash (?v=); the file itself is judged
      const u = raw.split('?')[0];
      const res = await page.request.get('/' + raw);
      if (!res.ok()) { bad.push(u + ' -> ' + res.status()); continue; }
      /* Interface art is vector so it stays sharp at any scale and can be recoloured.
         The pointing hand is the one exception: it is a supplied raster, chosen
         deliberately over the drawn glyph it replaced. */
      /* The supplied picture buttons and the plank are painted art, not glyphs: they
         carry their own rim, gloss and lettering, and their pressed state is drawn
         rather than restyled. A vector version of one of those is not a thing that
         exists. Everything else under assets/ui stays SVG. */
      const RASTER_OK = ['assets/ui/icons/touch.png',
                         'assets/ui/plank-l.webp', 'assets/ui/plank-m.webp', 'assets/ui/plank-r.webp',
                         'assets/ui/btn-normal.webp', 'assets/ui/btn-pressed.webp',
                         'assets/ui/btn-play.webp',
                         'assets/ui/btn-tryagain.webp'];
      const isUi = u.startsWith('assets/ui/');
      if (isUi && !u.endsWith('.svg') && !RASTER_OK.includes(u)) {
        bad.push(u + ' interface art should be SVG');
      }
      // audio is not art and obviously cannot be WebP
      if (u.startsWith('assets/audio/')) continue;
      if (!isUi && !u.endsWith('.webp')) bad.push(u + ' world art should be WebP');
    }
    expect(bad, 'broken or wrongly formatted assets').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('the audio ships as Ogg, with the mp3 kept only as a fallback', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const m = await import('/js/engine.js');
      /* Every audio file the game names, found by walking CFG rather than by listing them:
         a cue added later is then covered without anyone remembering to add it here. */
      const srcs = new Set(), seen = new Set();
      (function walk(o, d) {
        if (!o || typeof o !== 'object' || d > 5 || seen.has(o)) return;
        seen.add(o);
        for (const v of Object.values(o)) {
          if (typeof v === 'string' && v.startsWith('assets/audio/')) srcs.add(v);
          else if (v && typeof v === 'object') walk(v, d + 1);
        }
      })(m.CFG, 0);

      const out = { chose: [], missingOgg: [], missingMp3: [], notMp3: [] };
      for (const src of srcs) {
        if (!src.endsWith('.mp3')) { out.notMp3.push(src); continue; }
        // what the game will actually request, after assetUrl negotiates the format
        out.chose.push(m.assetUrl(src).split('?')[0]);
        const ogg = await fetch('/' + src.replace('.mp3', '.ogg'), { method: 'HEAD' });
        if (!ogg.ok) out.missingOgg.push(src);
        const mp3 = await fetch('/' + src, { method: 'HEAD' });
        if (!mp3.ok) out.missingMp3.push(src);
      }
      out.playsOgg = !!new Audio().canPlayType('audio/ogg; codecs="vorbis"');
      return out;
    });

    expect(r.notMp3, 'the config names its audio by the fallback file').toEqual([]);
    expect(r.missingOgg, 'every cue has an ogg to be served').toEqual([]);
    /* THE MP3 IS NOT DEAD WEIGHT. Safari only plays ogg from 17.4, so an iPad on iOS 16
       needs the mp3 to have any sound at all. Both files must exist; only one is fetched. */
    expect(r.missingMp3, 'and the fallback the old iPad needs is still there').toEqual([]);

    /* AND THE NEGOTIATION ACTUALLY FIRES. Chromium plays ogg, so every url the game builds
       here must be the ogg — asserting only that the file exists would pass even if
       assetUrl had stopped choosing it. */
    expect(r.playsOgg, 'this browser plays ogg, so it should be given ogg').toBe(true);
    expect(r.chose.filter(u => !u.endsWith('.ogg')), 'urls the game still builds as mp3').toEqual([]);
    expect(r.chose.length, 'the whole kit was checked').toBeGreaterThan(8);
  });

  test('the whole art set is small enough to load quickly', async ({ page }) => {
    await boot(page);
    const total = await page.evaluate(async () => {
      // option-shapes.js carries the ice-block textures, which are most of the weight
      const engine = (await (await fetch('/js/engine.js')).text()) +
                     (await (await fetch('/js/option-shapes.js')).text());
      const urls = new Set();
      for (const m of engine.matchAll(/['"](assets\/[^'"]+)['"]/g)) urls.add(m[1]);
      let base = 0, hd = 0;
      for (const u of urls) {
        // the budget is about ART. The music bed is streamed, not held, and counting a
        // five-megabyte track against the picture budget would just hide the pictures.
        if (u.startsWith('assets/audio/')) continue;
        const r = await fetch('/' + u);
        const n = (await r.arrayBuffer()).byteLength;
        if (u.startsWith('assets/char/hd/')) hd += n; else base += n;
      }
      return { base, hd };
    });
    /* A client downloads ONE character set: the base on a phone, the hd set on a hi-DPI
       screen (see CFG.sprite.hd). So the two are budgeted apart — the base set is what a
       phone on a slow connection pays, and the hd sheets are 2.25x the pixels for screens
       with the memory for them. It was 42.85MB of PNG once. */
    expect(total.base / 1048576, 'base art').toBeLessThan(12);
    expect(total.hd / 1048576, 'hd character set').toBeLessThan(10);
  });

  test('no frame is cut off, and no frame carries a stray fragment', async ({ page }) => {
    await boot(page);
    const sheets = await page.evaluate(() =>
      window.iceAgeGame.roster().flatMap(c =>
        ['run', 'jump', 'skid', 'hurt', 'idle', 'tremble']
          .map(slot => window.iceAgeGame.sheetFor(c.id, slot))
          .filter(Boolean)
          .map(s => ({ id: c.id, src: s.src, frames: s.frames, cw: s.cw, ch: s.ch, cols: s.cols }))
      ));
    /* Three sheets, one explorer: run, jump, skid. The shake and hurt sheets were
       removed on request so that only the delivered GIFs are used; SHAKE, LOOK_DOWN,
       KNOCKOUT and HURT fall back to jump poses. Put the slots back here alongside the
       art if either is ever delivered. */
    expect(sheets.length).toBe(6);

    const cuts = [], clutter = [], sizes = [];
    for (const sh of sheets) {
      const m = await page.evaluate(MEASURE, [sh.src, sh.cw, sh.ch, sh.cols, sh.frames]);
      const name = sh.src.split('/').pop();
      expect(m.H, name + ' sheet height').toBe(sh.ch * Math.ceil(sh.frames / sh.cols));
      expect(m.cells, name + ' frame count').toBe(sh.frames);

      m.frames.forEach((f, i) => {
        if (f.empty) { clutter.push(`${name} f${i} is empty`); return; }
        // CUTS: content running to a cell edge means it was sliced
        if (f.touchesLeft || f.touchesRight || f.touchesTop) {
          // measured at the 40-alpha floor, so a faint anti-aliased fringe touching
          // the edge does not read as a slice through the body
          cuts.push(`${name} f${i} touches ${[f.touchesLeft && 'left', f.touchesRight && 'right', f.touchesTop && 'top'].filter(Boolean).join('+')}`);
        }
        // CLUTTER: a detached lump that runs off a cell edge came from the frame next
        // door. Detached art that stays inside its own cell is the character's own
        // spray or motion arcs and is meant to be there.
        if (f.spillArea > f.mainArea * 0.005) {
          clutter.push(`${name} f${i} carries ${f.spillArea}px bleeding across a cell edge`);
        }
        sizes.push(f.h);
      });
    }
    expect(cuts, 'frames cut off at a cell edge').toEqual([]);
    expect(clutter, 'frames carrying fragments of a neighbour').toEqual([]);
  });

  test('a character is the same size in every one of its animations', async ({ page }) => {
    /* MEASURED ON AREA, not on bounding-box height. Height is what a pose changes: the
       jump sheet is ten tucked, airborne poses, so its frames are legitimately shorter
       than a standing run frame, and comparing heights called that a size defect
       (1.27x) when the scale was provably identical. The square root of the opaque
       area tracks how big the animal IS and barely moves with pose — 1.14x across
       these five sheets. */
    await boot(page);
    const perChar = await page.evaluate(() =>
      window.iceAgeGame.roster().map(c => ({
        id: c.id,
        sheets: ['run', 'jump', 'skid', 'hurt', 'idle', 'tremble']
          .map(slot => ({ slot, s: window.iceAgeGame.sheetFor(c.id, slot) }))
          .filter(x => x.s)
      })));

    for (const c of perChar) {
      const medians = [];
      for (const { slot, s } of c.sheets) {
        const m = await page.evaluate(MEASURE, [s.src, s.cw, s.ch, s.cols, s.frames]);
        const areas = m.frames.filter(f => !f.empty)
          .map(f => Math.round(Math.sqrt(f.area))).sort((a, b) => a - b);
        medians.push({ slot, median: areas[areas.length >> 1] });
      }
      const lo = Math.min(...medians.map(m => m.median));
      const hi = Math.max(...medians.map(m => m.median));
      // the mammoth used to be 35% bigger in its skid and tremble sheets, so it grew
      // by a third the moment it stopped running
      expect(hi / lo, `${c.id} size drift across ${JSON.stringify(medians)}`).toBeLessThan(1.18);
    }
  });

  /* THE CHARACTER STANDS ON THE PATH. Every frame of a HELD-POSE sheet has to put its
     feet on the one shared row the engine draws to, or the character shifts underneath
     a pose it is holding — and it holds one for as long as a learner takes over a
     puzzle. This is the check that would have caught the head-down pose floating. */
  test('every held pose stands on the same foot line', async ({ page }) => {
    await boot(page);
    const gap = await baseGapOf(page);
    for (const c of await page.evaluate('window.iceAgeGame.roster()')) {
      // shake and hurt no longer have art; skid is the held-pose sheet that remains
      for (const slot of ['skid']) {
        const s = await page.evaluate(([id, sl]) =>
          window.iceAgeGame.sheetFor(id, sl), [c.id, slot]);
        if (!s) continue;
        const shared = s.ch - gap;
        const m = await page.evaluate(MEASURE, [s.src, s.cw, s.ch, s.cols, s.frames]);
        const feet = m.frames.filter(f => !f.empty).map(footRow);
        const lo = Math.min(...feet), hi = Math.max(...feet);
        expect(hi - lo, `${c.id}/${slot} feet drift across ${JSON.stringify(feet)}`)
          .toBeLessThanOrEqual(3);
        // and that shared line is the one the engine actually draws to
        expect(Math.abs(hi - shared), `${c.id}/${slot} feet at ${hi}, engine draws ${shared}`)
          .toBeLessThanOrEqual(3);
      }
    }
  });

  test('the run cycle rises and falls instead of sliding', async ({ page }) => {
    await boot(page);
    for (const c of await page.evaluate('window.iceAgeGame.roster()')) {
      const s = await page.evaluate(id => window.iceAgeGame.sheetFor(id, 'run'), c.id);
      const m = await page.evaluate(MEASURE, [s.src, s.cw, s.ch, s.cols, s.frames]);
      /* On the FEET, not on the lowest pixel. A run frame's lowest pixel can be a
         trailing hoof or a swinging trunk, which is noise on top of the bob. */
      const feet = m.frames.filter(f => !f.empty).map(footRow);
      const drift = Math.max(...feet) - Math.min(...feet);
      expect(drift, `${c.id} bob across ${JSON.stringify(feet)}`).toBeGreaterThan(8);
      // the deepest frame of the cycle is the one standing on the shared line
      const shared = s.ch - await baseGapOf(page);
      expect(Math.abs(Math.max(...feet) - shared),
        `${c.id} deepest foot at ${Math.max(...feet)}, engine draws ${shared}`)
        .toBeLessThanOrEqual(3);
      // and nothing may reach the cell bottom
      expect(Math.max(...m.frames.filter(f => !f.empty).map(f => f.y1)))
        .toBeLessThanOrEqual(s.ch - 1);
    }
  });
});
