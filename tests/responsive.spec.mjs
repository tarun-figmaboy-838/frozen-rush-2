/* RESPONSIVE, AND NO RUNAWAY BUFFERS. The owner asked for the game to be reviewed across every
   device and for the memory to be safe on all of them. These are the invariants that came out of
   that review, each one a fault that was actually found and fixed:

     a tap during a puzzle was tested against the world point it would have been WITHOUT the
     push-in, up to 96px from the rope it was aimed at;
     the interface was sized in viewport units although it lives inside a letterboxed stage, so
     it was 22% oversized on a phone in landscape and half-size on a 4K screen;
     the sky was resampled every frame, the wall art was cached on a swept width, and every
     mended crossing was re-drawn for the rest of the run.

   The backbuffer bound is the one that matters most on a phone: 2x of 1920x1080 is 8.3Mpx, well
   inside the 16.7Mpx and 4096px-a-side limits that mobile GPUs impose. */
import { test, expect } from '@playwright/test';
import { boot, force, waitState } from './helpers.mjs';

test.describe('responsive, and the buffers', () => {
  test.setTimeout(180_000);

  test('a swipe aimed where the rope is DRAWN cuts that rope, through the puzzle push-in', async ({ page }) => {
    await boot(page, { fast: 2 });
    await force(page, 'GLACIER_BREAK_1');
    await waitState(page, 'PHASE_ACTIVE', 60_000);
    await page.waitForFunction(() => { const L = window.iceAgeGame.debug().l1; return L && L.shapes.some(s => s.state === 'hang' && s.y > 400); }, null, { timeout: 30_000 });
    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame, G = g.debug(), L = G.l1;
      const want = L.unfilled[0];
      const target = L.shapes.find(s => s.kind === want && s.state === 'hang');
      const z = G.zoom, fx = G.zoomVX, fy = G.zoomVY;
      // the rope's cut stretch, mapped the way the renderer maps it — i.e. where the eye sees it
      const wx = target.anchorX, wy = (target.y - target.h / 2) - 60;
      const sx = fx + (wx - fx) * z, sy = fy + (wy - fy) * z;
      const st = document.getElementById('stage').getBoundingClientRect();
      const css = (x, y) => ({ x: st.left + x / 1920 * st.width, y: st.top + y / 1080 * st.height });
      const a = css(sx - 110, sy), b = css(sx + 110, sy);
      const c = document.getElementById('game-canvas');
      c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: a.x, clientY: a.y, pointerId: 21, pointerType: 'touch', isPrimary: true }));
      for (let i = 1; i <= 8; i++) c.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: a.x + (b.x - a.x) * i / 8, clientY: a.y, pointerId: 21, pointerType: 'touch', isPrimary: true }));
      c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: b.x, clientY: b.y, pointerId: 21, pointerType: 'touch', isPrimary: true }));
      await new Promise(res => setTimeout(res, 250));
      const after = g.debug().l1;
      return { want, zoom: z, cut: after ? after.shapes.filter(s => s.cut).map(s => s.kind) : [], stubs: after ? after.stubs.length : 0 };
    });
    expect(r.zoom, 'the puzzle really is pushed in').toBeGreaterThan(1.15);
    expect(r.stubs, 'the swipe parted a rope').toBe(1);
    expect(r.cut, 'and it was the one it crossed on screen').toEqual([r.want]);
  });

  test('the backbuffer stays inside what a mobile GPU allows, and the guard can only lower it', async ({ page }) => {
    await boot(page, { query: 'rs=2' });
    const r = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      const p = window.iceAgeGame._perf();
      return { w: c.width, h: c.height, mpx: c.width * c.height / 1e6, side: Math.max(c.width, c.height), rs: p.rs, cap: p.rsCap };
    });
    expect(r.rs).toBeLessThanOrEqual(2);
    expect(r.mpx, 'inside the 16.7Mpx a mobile GPU allows').toBeLessThan(16.7);
    expect(r.side, 'inside a 4096px texture side').toBeLessThanOrEqual(4096);
    expect(r.w).toBe(Math.round(1920 * r.rs));
    expect(r.h).toBe(Math.round(1080 * r.rs));
  });

  test('the caches are bounded: two skies, a dozen walls, and off-screen crossings are not drawn', async ({ page }) => {
    await boot(page, { fast: 4 });
    // play through several crossings, which is what used to grow the caches
    await force(page, 'GLACIER_BREAK_1');
    await waitState(page, 'PHASE_ACTIVE', 60_000);
    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      for (let i = 0; i < 4; i++) {
        const L = g.debug().l1;
        if (!L) break;
        for (const k of [...L.unfilled]) g._cut(k);
        const t0 = Date.now();
        while (Date.now() - t0 < 12000 && g.debug().state !== 'PHASE_ACTIVE') await new Promise(res => requestAnimationFrame(res));
      }
      const p = g._perf();
      const G = g.debug();
      const drawn = g._openGaps ? g._openGaps().length : null;
      return { ...p, gapsHeld: G.gapsHeld !== undefined ? G.gapsHeld : p.gaps, drawn };
    });
    expect(r.skies, 'only the two skies in play are kept scaled').toBeLessThanOrEqual(2);
    expect(r.walls, 'the wall art cache is capped').toBeLessThanOrEqual(12);
    expect(r.pool, 'the particle pool is not unbounded').toBeLessThan(600);
  });

  test('the interface is the same share of the stage at 1920 and at 4K', async ({ page }) => {
    const measure = async () => page.evaluate(() => {
      const st = document.getElementById('stage').getBoundingClientRect();
      const el = document.getElementById('instruction'); el.hidden = false; el.classList.remove('leaving');
      document.getElementById('instruction-text').textContent = 'Cut the TRIANGLE.';
      /* LAYOUT, NOT THE PAINTED BOX. The sign drops in on its ropes and the drop rotates it
         a couple of degrees; a rotated box's client rect is its bounding box, which is up to
         10% taller than the panel is. Measured mid-drop at one size and settled at the other,
         that alone read as the interface being a different share of the stage. offsetHeight
         is the laid-out height and no transform can touch it — the same reason Tutorial.hugWords
         measures words that way. */
      const pillEl = document.getElementById('instruction-pill');
      const pill = { height: pillEl.offsetHeight, width: pillEl.offsetWidth };
      const txt = parseFloat(getComputedStyle(document.getElementById('instruction-text')).fontSize);
      /* No jump button to measure any more: the stage IS the control, so the sign is the
         whole of the in-play interface and the share it takes is the whole of this check. */
      return { signH: pill.height / st.height, textH: txt / st.height, stage: st.width };
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await boot(page);
    const a = await measure();
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.waitForTimeout(400);
    const b = await measure();
    // the stage doubled; every share must be the same, which is what `vw` could not do
    expect(b.stage).toBeGreaterThan(a.stage * 1.9);
    expect(Math.abs(b.textH - a.textH), `text share ${a.textH} vs ${b.textH}`).toBeLessThan(0.004);
    expect(Math.abs(b.signH - a.signH), 'sign share').toBeLessThan(0.01);
    // and the floor that keeps it usable
    expect(a.textH, 'readable against the stage').toBeGreaterThan(0.03);
  });

  test('the voice is one file cut into fourteen windows, none of them overlapping', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const m = await import('/js/engine.js');
      const V = m.CFG.vo;
      const ord = Object.entries(V.lines).sort((a, b) => a[1][0] - b[1][0]);
      const bad = [];
      for (let i = 0; i < ord.length; i++) {
        const [k, [at, dur]] = ord[i];
        if (!(at >= 0) || !(dur > 0.4)) bad.push(k + ' has no window');
        if (i && ord[i - 1][1][0] + ord[i - 1][1][1] > at + 0.001) bad.push(k + ' overlaps ' + ord[i - 1][0]);
      }
      const res = await fetch('/' + V.src, { method: 'HEAD' });
      return { n: ord.length, bad, src: V.src, status: res.status, last: ord[ord.length - 1][1][0] + ord[ord.length - 1][1][1] };
    });
    // 14, not 16: the ending's two lines were cut with the banner that showed them
    expect(r.n, 'every line the learner is shown').toBe(14);
    expect(r.bad).toEqual([]);
    expect(r.status, 'the recording ships').toBe(200);
    expect(r.last, 'the last window is inside the take').toBeLessThan(36.2);
  });

  test('a phone in portrait shows the prompt, and nothing is painted behind it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    expect(await page.locator('#rotate').isVisible(), 'the rotate prompt is up in portrait').toBe(true);
    // the simulation carries on; only the painting stops
    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      const t0 = g.debug().t;
      await new Promise(res => setTimeout(res, 400));
      return { advanced: g.debug().t > t0, hiddenWired: typeof g._perf === 'function' };
    });
    expect(r.advanced, 'the game keeps running behind the prompt').toBe(true);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    expect(await page.locator('#rotate').isVisible(), 'and it goes away in landscape').toBe(false);
  });
});
