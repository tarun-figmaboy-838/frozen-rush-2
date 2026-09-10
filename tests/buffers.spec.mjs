/* WHAT THE RESPONSIVE REVIEW FIXED, held by test. tests/responsive.spec.mjs checks that the game
   FITS every device shape; this checks the behaviour behind that:

     a tap during a puzzle is tested against the rope the player can SEE, not the world point it
     would have been without the push-in (the error reached 96px against a 30px tolerance);
     the interface is sized from the stage, not the window, so its share is the same on a 4K
     screen as at 1920 (in viewport units it came out half-size);
     the backbuffer stays inside what a mobile GPU allocates, and the quality guard can only
     lower it;
     the sky, wall-art and particle pools are bounded, so a long session cannot grow without end;
     the voice is one recording cut into fourteen windows that do not overlap. */
import { test, expect } from '@playwright/test';
import { boot, force, waitState } from './helpers.mjs';

test.describe('the pointer, the buffers and the voice', () => {
  test.setTimeout(180_000);

  test('a swipe aimed where the rope is DRAWN cuts that rope, through the puzzle push-in', async ({ page }) => {
    await boot(page, { fast: 2 });
    await force(page, 'GLACIER_BREAK_1');
    await waitState(page, 'PHASE_ACTIVE', 90_000);
    await page.waitForFunction(() => { const L = window.iceAgeGame.debug().l1; return L && L.shapes.some(s => s.state === 'hang' && s.y > 400); }, null, { timeout: 40_000 });
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

  test('the backbuffer stays inside what a mobile GPU allows, and the guard only lowers it', async ({ page }) => {
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

  test('the pools are bounded across several crossings', async ({ page }) => {
    await boot(page, { fast: 4 });
    await force(page, 'GLACIER_BREAK_1');
    await waitState(page, 'PHASE_ACTIVE', 90_000);
    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      for (let i = 0; i < 4; i++) {
        const L = g.debug().l1;
        if (!L) break;
        for (const k of [...L.unfilled]) g._cut(k);
        const t0 = Date.now();
        while (Date.now() - t0 < 14000 && g.debug().state !== 'PHASE_ACTIVE') await new Promise(res => requestAnimationFrame(res));
      }
      return g._perf();
    });
    expect(r.skies, 'only the two skies in play are kept scaled').toBeLessThanOrEqual(2);
    expect(r.walls, 'the wall-art cache is capped').toBeLessThanOrEqual(12);
    expect(r.pool, 'the particle pool is not unbounded').toBeLessThan(600);
  });

  test('the interface is the same share of the stage at 1920 and at 4K', async ({ page }) => {
    const measure = () => page.evaluate(() => {
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
    await page.waitForTimeout(500);
    const b = await measure();
    expect(b.stage, 'the stage really doubled').toBeGreaterThan(a.stage * 1.9);
    expect(Math.abs(b.textH - a.textH), `text share ${a.textH.toFixed(4)} vs ${b.textH.toFixed(4)}`).toBeLessThan(0.004);
    expect(Math.abs(b.signH - a.signH), 'sign share').toBeLessThan(0.01);
    expect(a.textH, 'readable against the stage').toBeGreaterThan(0.03);
  });

  test('the voice is one recording cut into fourteen windows, none overlapping', async ({ page }) => {
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
      /* AND THE OGG TWIN, which is what nearly every browser actually downloads: the mp3 is
         only the fallback for Safari before 17.4 (see assetUrl in engine.js). If the ogg were
         missing, every one of those browsers would fall back silently and nothing else here
         would notice. */
      const ogg = await fetch('/' + V.src.replace('.mp3', '.ogg'), { method: 'HEAD' });
      // every question's sentence must resolve to a line that exists
      const missing = m.CFG.levelOne.phases
        .map(p => window.iceAgeGame.signVoId(p.instruction))
        .filter(id => !V.lines[id]);
      return { n: ord.length, bad, missing, status: res.status, oggStatus: ogg.status, last: ord[ord.length - 1][1][0] + ord[ord.length - 1][1][1] };
    });
    // 14, not 16: the ending's two lines were cut with the banner that showed them
    expect(r.n, 'every line the learner is shown').toBe(14);
    expect(r.bad).toEqual([]);
    expect(r.missing, 'every question has a recorded line').toEqual([]);
    expect(r.status, 'the recording ships').toBe(200);
    expect(r.oggStatus, 'and so does the ogg the browser prefers').toBe(200);
    /* 36.2, the length of the take that ships. It was 39.1 — the take before it — which
       is a bound no window could have crossed and so was not checking anything. */
    expect(r.last, 'the last window is inside the take').toBeLessThan(36.2);
  });
});
