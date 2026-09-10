/* THE TREMBLE AT THE EDGE, THE STOP, THE COMEDY CRASH, THE TIED ROPE — the owner's brief:
   the 12-frame tremble replaces the trample and is played by a timing plan; once he has
   stopped the feet stop (the wait is the idle loop); a crash throws stars at the impact with
   its own sound; the rope carries a knot at the block. */
import { test, expect } from '@playwright/test';
import { boot, force, waitState } from './helpers.mjs';

test.describe('the tremble, the stop and the crash', () => {
  test.setTimeout(120_000);

  test('the tremble sheet is listed, 12 frames, and the plan is the acted sequence', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const m = await import('/js/engine.js');
      const c = m.CFG.characters[0], TP = m.CFG.sprite.tremble;
      const total = TP.plan.reduce((a, s) => a + s[1], 0);
      const strong = TP.plan.slice(TP.strong[0], TP.strong[1] + 1).map(s => s[0]);
      return { sheet: c.sheets.tremble, hd: c.hd.tremble, frames: c.frames.tremble, trample: c.sheets.trample || null,
               steps: TP.plan.length, total, strong, maxFrame: Math.max(...TP.plan.map(s => s[0])), first: TP.plan[0][0], last: TP.plan[TP.plan.length - 1][0] };
    });
    expect(r.sheet).toBe('assets/char/mammoth-tremble.webp');
    expect(r.hd).toBe('assets/char/hd/mammoth-tremble.webp');
    expect(r.frames).toBe(12);
    expect(r.trample, 'the trample is shelved, not fetched').toBeNull();
    // about 3.3 s in all (retuned from 1.9 s: "not evident, looks fast"), frames 0..11, notice to settle
    expect(r.total).toBeGreaterThanOrEqual(2800); expect(r.total).toBeLessThanOrEqual(3800);
    expect(r.maxFrame).toBe(11); expect(r.first).toBe(0); expect(r.last).toBe(11);
    // the strong tremble is the 4-5-6-5 oscillation, three times, at a readable 90 ms
    expect(r.strong).toEqual([4, 5, 6, 5, 4, 5, 6, 5, 4, 5, 6, 5]);
  });

  test('at the edge he trembles once, by the plan, then waits on one still pose', async ({ page }) => {
    await boot(page, { fast: 1 });
    await force(page, 'GLACIER_BREAK_1');
    await page.waitForFunction(() => window.iceAgeGame.mammothState() === 'SHAKE', null, { timeout: 20_000 });
    const r = await page.evaluate(async () => {
      const p = window.iceAgeGame._player(); const seen = new Set(); let shook = false, fired = false, marks = false;
      const t0 = Date.now();
      while (Date.now() - t0 < 60000 && p.state === 'SHAKE') {      // 3.3 s of game time; a loaded runner plays it at a third of wall speed or slower
        seen.add(p.lastSheet + ':' + p.lastFrame);
        if (Math.abs(p.wobX) > 0.5) shook = true;
        if (p.marksDrawn === 2) marks = true;
        if (p.trembleFired) fired = true;
        await new Promise(res => requestAnimationFrame(res));
      }
      const after = p.state, sheet0 = p.lastSheet;
      await new Promise(res => setTimeout(res, 700));
      return { frames: [...seen].filter(k => k.startsWith('tremble')).length, shook, fired, after, sheet0, sheet1: p.lastSheet, wobAfter: Math.abs(p.wobX), marks };
    });
    // sampled once per animation frame under a loaded runner, so 62 ms steps are missed: many, not all
    expect(r.frames, 'the tremble sheet is what plays').toBeGreaterThanOrEqual(6);
    expect(r.shook, 'the secondary shake ran during the strong tremble').toBe(true);
    expect(r.fired, 'the sound fired').toBe(true);
    expect(r.after).toBe('LOOK_DOWN');
    // the wait is the tremble's own settle, held: no second sheet, so no cut between the two
    expect(r.sheet0, 'the wait is the settle the tremble ends on').toBe('tremble');
    expect(r.sheet1, 'and it is still that, not an idle pass').toBe('tremble');
    expect(r.marks, 'the tremble marks were drawn on the strong beat').toBe(true);
    expect(r.wobAfter, 'and nothing shakes him while he waits').toBeLessThan(0.01);
  });

  test('the crash throws stars at the impact and has its own sound', async ({ page }) => {
    await boot(page, { fast: 1 });
    await force(page, 'JUMP_CHALLENGE_1');
    await page.waitForFunction(() => window.iceAgeGame.debug().state === 'OBSTACLE_HIT', null, { timeout: 15_000 });
    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame; const m = await import('/js/engine.js');
      /* The stars live under a second of game time; sample for a moment and keep the fullest
         burst seen, so a slow poll on a loaded runner does not read an empty list. */
      let best = []; const t0 = Date.now();
      while (Date.now() - t0 < 2500) {
        const now = g._particles().list.filter(p => p.kind === 'star' && !p.dead);
        if (now.length > best.length) best = now.map(s => ({ y: s.y }));
        if (best.length >= 5) break;
        await new Promise(res => requestAnimationFrame(res));
      }
      const stars = best; const p = g._player();
      return { stars: stars.length, state: p.state, koCue: m.CFG.sfx.knockout && m.CFG.sfx.knockout.src, trembleCue: m.CFG.sfx.tremble && m.CFG.sfx.tremble.src,
               hits: m.SFX_HITS.knockout, minY: Math.min(...stars.map(s => s.y)), maxY: Math.max(...stars.map(s => s.y)) };
    });
    expect(r.state).toBe('KNOCKOUT');
    expect(r.stars, 'stars at the point of impact').toBeGreaterThanOrEqual(5);
    expect(r.maxY, 'around his head, not on the ground').toBeLessThan(900);
    expect(r.koCue).toContain('sad-trumpet');
    expect(r.trembleCue).toContain('cartoon-blinking');
    expect(r.hits, 'the cue is baked for the file:// build').toEqual([0.12]);
  });

  test('the rope art is one strip with a cord, a knot and a fray inside its bounds', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const m = await import('/js/engine.js'); const R = m.CFG.rope;
      const img = new Image(); img.src = '/' + R.src; await img.decode();
      return { w: img.naturalWidth, h: img.naturalHeight, R };
    });
    expect(r.w).toBe(r.R.artW);
    expect(r.R.cord[1]).toBeLessThanOrEqual(r.R.knot[0]);
    expect(r.R.knot[1]).toBeLessThanOrEqual(r.h);
    expect(r.R.fray[0]).toBeGreaterThan(r.R.knot[0]);
    expect((r.R.cord[1] - r.R.cord[0]) % r.R.seg, 'the slices tile the twist exactly').toBe(0);
  });

  test('the last tutorial line speaks over the running game without the veil; the frozen lines keep it', async ({ page }) => {
    test.setTimeout(300_000);     // the whole tutorial in real time, on a runner that may be at a third of speed
    await boot(page, { tutorial: true, skipScreens: true });
    const veilOn = () => page.evaluate(() => { const v = document.getElementById('tut-veil'); return v ? !v.hidden : null; });
    await page.waitForFunction(() => /This is Momo/.test(document.getElementById('tut-text').textContent), null, { timeout: 40_000 });
    expect(await veilOn(), 'a frozen describing line is veiled').toBe(true);
    await page.waitForFunction(() => /Tap to jump/.test(document.getElementById('tut-text').textContent), null, { timeout: 90_000 });
    /* Jump whenever a rock is in range until the ice breaks — a missed jump under a loaded
       test runner crashes, retries and comes round again, so one shot is not enough. */
    await page.evaluate(async () => {
      const g = window.iceAgeGame; const t0 = Date.now();
      while (Date.now() - t0 < 60000 && !/GLACIER_BREAK_1|PHASE_/.test(g.debug().state)) {
        const G = g.debug(); const L = g._obstacles().list.filter(o => !o.passed);
        if (L.length && L[0].x - G.worldX < 640 && L[0].x - G.worldX > 380 && g.mammothState() === 'RUN') g.jump();
        await new Promise(res => setTimeout(res, 40));
      }
    });
    // the owner's sequence: the whole tremble plays first, THEN the "Oh no" line comes
    await page.waitForFunction(() => /path is broken/.test(document.getElementById('tut-text').textContent), null, { timeout: 150_000 });
    const atOhNo = await page.evaluate(async () => {
      const m = await import('/js/engine.js'); const p = window.iceAgeGame._player();
      return { state: window.iceAgeGame.debug().state, anim: p.state, step: p.trembleStep, plan: m.CFG.sprite.tremble.plan.length, veil: !document.getElementById('tut-veil').hidden };
    });
    expect(atOhNo.state, 'he has stopped when the line comes').not.toBe('GLACIER_BREAK_1');
    expect(atOhNo.anim, 'the tremble has finished: he is on the idle wait').toBe('LOOK_DOWN');
    expect(atOhNo.step, 'every step of the plan was spent before the line').toBe(atOhNo.plan);
    expect(atOhNo.veil).toBe(true);
    /* THE TAIL POINTS AT THE DITCH (asked for): the shape's tip lands within a hand's width above
       the ice surface, horizontally inside the gap — not beside it, not floating over it.
       Measured once the pop-in (380 ms) and the first re-measure have settled. */
    await page.waitForTimeout(800);
    const aim = await page.evaluate(() => {
      const st = document.getElementById('stage').getBoundingClientRect(), k = 1920 / st.width;
      const sh = document.getElementById('tut-shape').getBoundingClientRect(), bb = document.getElementById('tut-bubble').getBoundingClientRect();
      const G = window.iceAgeGame.debug(), gp = G.gapsThisPhase[0], z = G.zoom || 1, fx = G.zoomVX, fy = G.zoomVY;
      const zx = x => fx + (x - fx) * z, zy = y => fy + (y - fy) * z;
      return { tipY: (sh.bottom - st.top) * k, surfaceY: zy(850), cx: ((bb.left + bb.right) / 2 - st.left) * k, gx0: zx(gp.x0 - G.worldX), gx1: zx(gp.x1 - G.worldX) };
    });
    expect(aim.tipY, 'the tip reaches the ice edge').toBeGreaterThan(aim.surfaceY - 40);
    expect(aim.tipY).toBeLessThan(aim.surfaceY + 40);
    expect(aim.cx, 'over the hole').toBeGreaterThan(aim.gx0); expect(aim.cx).toBeLessThan(aim.gx1);
    /* THE TEACHING LINE IS ON THE PLANK, not in the bubble (moved there on request), so it is
       the instruction panel that is waited for and measured here. */
    await page.waitForFunction(() => /right ice piece/i.test(document.getElementById('instruction-text').textContent), null, { timeout: 150_000 });
    await page.waitForTimeout(900);
    const box = await page.evaluate(() => { const st = document.getElementById('stage').getBoundingClientRect(), k = 1920 / st.width; const bb = document.getElementById('instruction-pill').getBoundingClientRect(); return { x0: (bb.left - st.left) * k, x1: (bb.right - st.left) * k }; });
    expect(box.x0, 'the teaching line, on the plank, stays on the stage').toBeGreaterThanOrEqual(0);
    expect(box.x1).toBeLessThanOrEqual(1920);
    await page.waitForFunction(() => { const L = window.iceAgeGame.debug().l1; return L && L.shapes.some(s => s.state === 'hang' && s.y > 400); }, null, { timeout: 20_000 });
    await page.evaluate(() => { const g = window.iceAgeGame; g._cut(g.debug().l1.unfilled[0]); });
    await page.waitForFunction(() => /Perfect fit/.test(document.getElementById('tut-text').textContent), null, { timeout: 30_000 });
    expect(await veilOn(), 'the reward line runs over a clear, moving scene').toBe(false);
  });

  test('a cut still parts the rope it crosses and leaves a stub (the bend never moves the hit line)', async ({ page }) => {
    await boot(page, { fast: 2 });
    await force(page, 'GLACIER_BREAK_1');
    await waitState(page, 'PHASE_ACTIVE', 40_000);
    await page.waitForFunction(() => { const L = window.iceAgeGame.debug().l1; return L && L.shapes.some(s => s.state === 'hang' && s.y > 400); }, null, { timeout: 20_000 });
    const r = await page.evaluate(() => {
      const g = window.iceAgeGame, L = g.debug().l1; const s = L.shapes.find(q => q.state === 'hang' && q.kind !== L.unfilled[0]);
      const span = g._ropeSpan ? g._ropeSpan(s) : null;
      const x = s.anchorX, y = (s.y + s.pivot.y - 120) / 2 + 60;
      const c = document.getElementById('game-canvas'); const st = document.getElementById('stage').getBoundingClientRect();
      const toCss = (sx, sy) => ({ x: st.left + sx / 1920 * st.width, y: st.top + sy / 1080 * st.height });
      const a = toCss(x - 90, y), b = toCss(x + 90, y);
      c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: a.x, clientY: a.y, pointerId: 7, pointerType: 'touch', isPrimary: true }));
      for (let i = 1; i <= 6; i++) c.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: a.x + (b.x - a.x) * i / 6, clientY: a.y, pointerId: 7, pointerType: 'touch', isPrimary: true }));
      c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: b.x, clientY: b.y, pointerId: 7, pointerType: 'touch', isPrimary: true }));
      return { cut: s.cut, stubs: L.stubs.length, span: !!span };
    });
    expect(r.cut).toBe(true);
    expect(r.stubs).toBe(1);
  });

  /* THE HAND-OVERS, on a hand-driven clock so a loaded runner cannot blur them. The owner's three
     points: the wait is one still pose and a wrong drop replays nothing; changes between sheets
     dissolve instead of cutting; the celebration is two real arcs and then the idle. */
  test('the wait is one still pose, a wrong drop dissolves in and out of it, and nothing replays', async ({ page }) => {
    await boot(page, { fast: 1 });
    const r = await page.evaluate(async () => {
      window.__SP = (await import('/js/engine.js')).CFG.sprite;
      const g = window.iceAgeGame, p = g._player(); g.setPaused(true);
      const at = (state, t) => { p.setState(state); p.t = t; g._renderOnce(); return { frame: p.lastSheet + ':' + p.lastFrame, under: +(p.lastUnder || 0).toFixed(2), blend: +(p.lastBlend || 0).toFixed(2) }; };
      p.setState('RUN'); p.t = 0; g._renderOnce();
      const wait = [0.3, 1, 5, 30].map(t => at('LOOK_DOWN', t).frame);
      // a wrong drop: the startle comes in over the wait, passes, and the wait comes back
      const S = window.__SP.startle, H = window.__SP.handover;
      const startIn = at('SURPRISED', 0.01), midIn = at('SURPRISED', H * 0.5), doneIn = at('SURPRISED', H + 0.02),
            alert = at('SURPRISED', S * 0.5),
            recover = at('SURPRISED', S + H * 0.2), recovered = at('SURPRISED', S + H + 0.05);
      p.setState('LOOK_DOWN'); p.t = 0.02; g._renderOnce();
      const back = { frame: p.lastSheet + ':' + p.lastFrame, under: +(p.lastUnder || 0).toFixed(2) };
      return { wait, startIn, midIn, doneIn, alert, recover, recovered, back };
    });
    expect(new Set(r.wait).size, 'one pose for the whole wait: ' + r.wait.join(' ')).toBe(1);
    expect(r.wait[0], 'and it is the settle the tremble ends on').toBe('tremble:11');
    /* The shape of the dissolve, not one opacity on it: present as the change starts, lower
       part-way through, gone by the end of the span. */
    expect(r.startIn.under, 'the startle dissolves in over the wait').toBeGreaterThan(0.25);
    expect(r.midIn.under, 'and it is falling').toBeLessThan(r.startIn.under);
    expect(r.doneIn.under, 'and finished by the end of its span').toBe(0);
    expect(r.alert.frame, 'the alert pose').toBe('jump:9');
    expect(r.recover.frame, 'then he comes back down to the settle').toBe('tremble:11');
    expect(r.recover.blend, 'by a dissolve').toBeGreaterThan(0.25);
    expect(r.recovered.blend, 'which finishes').toBe(0);
    expect(r.back.frame, 'the wait re-enters on the same frame').toBe('tremble:11');
    expect(r.back.under, 'so there is nothing to dissolve and nothing to replay').toBe(0);
  });

  test('the celebration is two arcs with the frames in flight order, a settle, then the idle by a dissolve', async ({ page }) => {
    await boot(page, { fast: 1 });
    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame, p = g._player(); const m = await import('/js/engine.js');
      g.setPaused(true); g._force('COMPLETE'); p.setState('CELEBRATE');
      const rows = [];
      for (let t = 0; t <= 2.2; t += 1 / 60) { p.t = t; p.hop = p.hopPhase(t).hop; g._renderOnce(); rows.push({ t, hop: p.hop, seg: p.hopPhase(t).seg, sheet: p.lastSheet, f: p.lastFrame, blend: p.lastBlend || 0, cross: p.lastCross || 0 }); }
      return { rows, J: p.J, H: m.CFG.sprite.hop };
    });
    const peaks = r.rows.filter((x, i) => i > 0 && i < r.rows.length - 1 && x.hop > r.rows[i - 1].hop && x.hop >= r.rows[i + 1].hop && x.hop > 5);
    expect(peaks.length, 'two hops').toBe(2);
    expect(peaks[1].hop, 'the second smaller').toBeLessThan(peaks[0].hop);
    const ORDER = [r.J.launch, r.J.rise, r.J.apex, r.J.fall, r.J.preLand];
    let prev = -1, prevSeg = '', back = 0;
    for (const x of r.rows) { if (x.seg === 'arc') { const o = ORDER.indexOf(x.f); expect(o, 'an in-flight frame').toBeGreaterThanOrEqual(0); if (prevSeg === 'arc' && o < prev) back++; prev = o; } else prev = -1; prevSeg = x.seg; }
    expect(back, 'the frames never step back inside an arc').toBe(0);
    const segs = r.rows.map(x => x.seg).filter((s, i, a) => i === 0 || a[i - 1] !== s);
    expect(segs).toEqual(['crouch', 'arc', 'land', 'arc', 'land', 'absorb', 'idle']);
    const idle = r.rows.filter(x => x.seg === 'idle');
    expect(idle[0].sheet, 'the ending breathes on the idle sheet').toBe('idle');
    /* The dissolve to watch here is the CROSS-SHEET one — the settle fading over the idle. The
       idle's own crossfade (blend) runs for ever by design, so asserting on it measured the
       wrong thing entirely. */
    expect(idle[0].cross, 'entered through a dissolve from the settle').toBeGreaterThan(0.25);
    expect(idle.find(x => x.t > idle[0].t + r.H.toIdle + 0.02 && x.cross > 0.01), 'which finishes').toBeUndefined();
    // and the idle is moving from its first frame, not waiting out the dissolve
    expect(new Set(idle.filter(x => x.t < idle[0].t + 0.5).map(x => x.f)).size, 'the idle steps straight away').toBeGreaterThan(2);
  });

  test('the rope moves with the block it carries: in phase, never against it, and visibly', async ({ page }) => {
    /* The history of this one property, because each fix was reviewed and sent back:
         - the cord's bend had its own clock (a random phase per rope): opposite directions
         - the bend followed the swing's VELOCITY: honest physics, 90 degrees out of phase,
           reviewed as "waving differently"
         - proved rigid, and still read as detached, because a solid block moving 12px is
           visible and a thin cord moving 12px is not
         - switched off: reviewed as dead, "add minor evident motion but keep it in sync"
       What ships: the cord's bend is locked to the swing's POSITION (ropeBow), so the rope is
       at its most curved on the very frame the block is at its furthest. Both extremes land
       together, which is what "moving together" looks like on a thin line. This holds it as
       a number: over six seconds, every rope's bend rises and falls WITH the swing — a
       correlation near +1 — and the swing itself is alive. */
    await boot(page, { fast: 2 });
    await force(page, 'GLACIER_BREAK_1');
    await waitState(page, 'PHASE_ACTIVE', 40_000);
    /* SAMPLED ON A BUDGET, and the budget is reported rather than assumed. A rAF loop with
       a fixed frame count is at the mercy of a throttled or occluded tab: it simply never
       returns, the evaluate hangs, and what the runner reports is the test's own timeout
       with no clue which line was waiting. This stops on the wall clock whatever the frames
       do, and says whether it got what it came for. */
    const r = await page.evaluate(async (budgetMs) => {
      const g = window.iceAgeGame, rows = [];
      const t0 = performance.now();
      while (performance.now() - t0 < budgetMs && rows.length < 240) {
        await new Promise(res => setTimeout(res, 16));
        const rig = g._rig();
        rig.t = g.debug().t;
        rows.push(rig);
      }
      const L = g.debug().l1;
      const moved = new Set(rows.map(x => x.t)).size;
      return { rows, moved, phases: L.shapes.map(s => s.phase), swayRad: rows[0].swayRad };
    }, 6000);
    // the clock really advanced, so what follows is a waveform and not one frame repeated
    expect(r.moved, 'the game clock advanced across the samples').toBeGreaterThan(30);
    const swings = r.rows.map(x => x.swing);
    // ALIVE: the motion was asked back after a still rig read as dead
    expect(Math.max(...swings) - Math.min(...swings), 'the rig swings').toBeGreaterThan(r.swayRad * 0.5);
    // IN PHASE: every cord's bend tracks the swing's position, never its velocity, never against it
    const bows = r.rows.map(x => x.bows);
    expect(bows[0].length, 'the row is hanging').toBeGreaterThan(2);
    const corr = (a, b) => {
      const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
      let sab = 0, saa = 0, sbb = 0;
      for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
      return sab / Math.sqrt(saa * sbb || 1);
    };
    for (let i = 0; i < bows[0].length; i++) {
      const series = bows.map(b => b[i]);
      expect(Math.max(...series) - Math.min(...series), `rope ${i}: its bend visibly moves`).toBeGreaterThan(4);
      expect(corr(series, swings), `rope ${i}: and moves WITH the swing, on the same frames`).toBeGreaterThan(0.95);
    }
    // nothing per-rope is left that could give one its own timing
    expect(r.phases.every(p => p === undefined), 'no per-rope phase survives').toBe(true);
  });

  test('where the rope is cut is where it parts, and both halves show it', async ({ page }) => {
    /* Both lengths used to be constants — a 34px snippet went down with the block and 72% of
       the rope stayed on the rig — so a swipe under the fog and a swipe just above the block
       produced the same picture. They are measured from the crossing point now. */
    await boot(page, { fast: 2 });
    await force(page, 'GLACIER_BREAK_1');
    await waitState(page, 'PHASE_ACTIVE', 40_000);
    await page.waitForFunction(() => {
      const L = window.iceAgeGame.debug().l1;
      return L && L.shapes.filter(s => s.state === 'hang' && s.y > 400).length >= 3;
    }, null, { timeout: 20_000 });
    await page.waitForTimeout(300);

    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      /* The swipe is aimed through the puzzle's own view transform, so it crosses the rope
         where it is DRAWN rather than where it would be unzoomed. */
      const swipe = (worldX, worldY, id) => {
        const G = g.debug(), k = G.zoom || 1;
        const vx = w => (k > 1.0005 ? G.zoomVX + (w - G.zoomVX) * k : w);
        const vy = w => (k > 1.0005 ? G.zoomVY + (w - G.zoomVY) * k : w);
        const st = document.getElementById('stage').getBoundingClientRect();
        const css = (x, y) => ({ x: st.left + vx(x) / 1920 * st.width, y: st.top + vy(y) / 1080 * st.height });
        const c = document.getElementById('game-canvas');
        const a = css(worldX - 100, worldY), b = css(worldX + 100, worldY);
        c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: a.x, clientY: a.y, pointerId: id, pointerType: 'touch', isPrimary: true }));
        for (let i = 1; i <= 8; i++) c.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: a.x + (b.x - a.x) * i / 8, clientY: a.y, pointerId: id, pointerType: 'touch', isPrimary: true }));
        c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: b.x, clientY: b.y, pointerId: id, pointerType: 'touch', isPrimary: true }));
      };
      const L = () => g.debug().l1;
      const wrongOne = () => L().shapes.find(s => s.state === 'hang' && !L().unfilled.includes(s.kind));
      const wait = async n => { for (let i = 0; i < n; i++) await new Promise(res => requestAnimationFrame(res)); };
      const active = async () => { for (let i = 0; i < 400 && g.state() !== 'PHASE_ACTIVE'; i++) await new Promise(res => setTimeout(res, 25)); };

      // 1. cut HIGH, just under the fog
      const hi = wrongOne();
      swipe(hi.anchorX, 150, 21);
      await wait(6);
      const hiStub = L().stubs[L().stubs.length - 1];
      const high = { cut: !!hi.cut, tail: hi.tail, stub: hiStub ? hiStub.len : -1 };

      /* A wrong cut opens PHASE_WRONG for a beat, and the hit test only runs in PHASE_ACTIVE —
         swiping through the feedback is how this test silently cut nothing the first time. */
      await active();

      // 2. cut LOW, just above the block
      const lo = wrongOne();
      const loTop = lo.y - lo.h / 2;
      swipe(lo.anchorX, loTop - 40, 22);
      await wait(6);
      const loStub = L().stubs[L().stubs.length - 1];
      const low = { cut: !!lo.cut, tail: lo.tail, stub: loStub ? loStub.len : -1, aimedAt: loTop - 40 };
      return { high, low, stubs: L().stubs.length };
    });

    expect(r.high.cut, 'the high swipe cut its rope').toBe(true);
    expect(r.low.cut, 'and so did the low one').toBe(true);
    expect(r.stubs, 'two ropes are parted').toBe(2);
    // cut high: most of the rope goes down with the block, almost nothing is left hanging
    expect(r.high.tail, 'a high cut sends a long tail down with the ice').toBeGreaterThan(120);
    // cut low: the block keeps a short tail and a long stub is left swinging from the fog
    expect(r.low.tail, 'a low cut sends a short one').toBeLessThan(r.high.tail * 0.5);
    expect(r.low.stub, 'and leaves the rest hanging on the rig').toBeGreaterThan(r.high.stub + 80);
  });
});
