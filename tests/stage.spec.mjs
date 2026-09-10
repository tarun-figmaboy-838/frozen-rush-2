/* THE DITCH STAGE ARRIVES IN BEATS, THE SIGN SITS IN THE LEFT BAND, AND EVERY WORD IS IN THE
   VO SCRIPT. The owner's four points: sequence the arrival instead of showing everything at
   once, put the sign where it cannot cover the ropes, use the game's palette on the dialogue,
   and keep a script of every spoken line. */
import { test, expect } from '@playwright/test';
import { boot, force, waitState } from './helpers.mjs';
import { readFileSync } from 'node:fs';

const HEX = s => s.trim().toLowerCase();

test.describe('the staged intro, the sign and the script', () => {
  test.setTimeout(180_000);

  test('the hole comes first, then the sign, then the options one after another', async ({ page }) => {
    await boot(page, { fast: 1 });
    await force(page, 'GLACIER_BREAK_1');
    await waitState(page, 'PHASE_INTRO', 60_000);
    const trail = await page.evaluate(async () => {
      const g = window.iceAgeGame; const seen = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 60000) {
        const G = g.debug(), L = G.l1, el = document.getElementById('instruction');
        seen.push({ beat: G.stageBeat, introT: G.introT, anim: g.mammothState(),
                    sign: !!(el && !el.hidden && !el.classList.contains('leaving')),
                    ys: L ? L.shapes.map(s => Math.round(s.y)) : [], state: G.state });
        if (G.state !== 'PHASE_INTRO') break;
        await new Promise(r => requestAnimationFrame(r));
      }
      return seen;
    });
    /* THE PIECES COME DOWN BEFORE THE QUESTION (the owner's order): the hole alone, then the ice
       arriving one piece at a time, and only then the plank asking which to cut. */
    // beat 0: no sign, nothing on a rope — the hole has the stage
    const beat0 = trail.filter(s => s.beat === 0);
    expect(beat0.length, 'the hole owns a beat of its own').toBeGreaterThan(0);
    expect(beat0.every(s => !s.sign), 'no sign during the first beat').toBe(true);
    expect(beat0.every(s => s.ys.every(y => y < 0)), 'no option has started down yet').toBe(true);
    // the clock does not run while the tremble is still playing
    expect(trail.filter(s => s.anim === 'SHAKE').every(s => s.introT === 0), 'the beats wait for the tremble').toBe(true);
    // beat 1: they come down ONE AT A TIME — at some frame the first is well below the last
    const beat1 = trail.filter(s => s.beat === 1);
    expect(beat1.length, 'the drop gets a beat of its own').toBeGreaterThan(0);
    const staggered = beat1.some(s => s.ys.length >= 2 && s.ys[0] - s.ys[s.ys.length - 1] > 120);
    expect(staggered, 'the row arrives one after another, not as a block').toBe(true);
    expect(beat1.every(s => !s.sign), 'and no question is asked while they are still falling').toBe(true);
    // beat 2: every piece is hanging, and NOW the question
    const beat2 = trail.filter(s => s.beat === 2);
    expect(beat2.length, 'the question gets a beat of its own').toBeGreaterThan(0);
    expect(beat2.some(s => s.sign), 'the question is up on its beat').toBe(true);
    expect(beat2[0].ys.every(y => y > 300), 'and it waited for the last piece to land').toBe(true);
    expect(trail[trail.length - 1].state).toBe('PHASE_ACTIVE');
  });

  test('the puzzle framing keeps Momo whole and the pieces off the corner', async ({ page }) => {
    await boot(page, { fast: 1 });
    await force(page, 'GLACIER_BREAK_1');
    await waitState(page, 'PHASE_ACTIVE', 120_000);
    await page.waitForFunction(() => Math.abs(window.iceAgeGame.debug().zoom - window.iceAgeGame.debug().zoomWant) < 0.002, null, { timeout: 20_000 });
    const m = await page.evaluate(() => {
      const G = window.iceAgeGame.debug(), z = G.zoom, fx = G.zoomVX, fy = G.zoomVY;
      const sx = w => fx + (w - fx) * z, sy = w => fy + (w - fy) * z;
      const L = G.l1, first = L.shapes[0], last = L.shapes[L.shapes.length - 1];
      return { zoom: z, back: sx(230), front: sx(629),                 // his measured drawn extent
               rowLeft: sx(first.anchorX - first.w / 2), rowRight: sx(last.anchorX + last.w / 2),
               pieceTop: sy(first.y - first.h / 2), lip: sy(840) };
    });
    expect(m.zoom, 'a real push-in').toBeGreaterThan(1.15);
    expect(m.back, 'his back is in frame, not cropped').toBeGreaterThan(0);
    expect(m.back, 'with very little space behind him').toBeLessThan(90);
    expect(m.rowLeft, 'no piece hangs over him').toBeGreaterThan(m.front);
    expect(1920 - m.rowRight, 'sky beyond the last piece, so the row is not in the corner').toBeGreaterThan(90);
    expect(m.lip, 'the crossing is in frame').toBeLessThan(1040);
    expect(m.pieceTop, 'and so are the pieces').toBeGreaterThan(0);
  });

  test('the sign sits in the empty left band, clear of every rope, for every question', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const m = await import('/js/engine.js');
      const el = document.getElementById('instruction'), pill = document.getElementById('instruction-pill');
      const txt = document.getElementById('instruction-text');
      el.hidden = false; el.classList.remove('leaving');
      const st = document.getElementById('stage').getBoundingClientRect(), k = 1920 / st.width;
      // the leftmost rope of a three-option row, from the engine's own layout
      const L1 = m.CFG.levelOne;
      const safeL = m.CFG.mammothX + L1.clearOfPlayer, safeR = 1920 - 60 - (L1.rowInset || 0);
      const mid = (safeL + safeR) / 2, half = Math.min(mid - safeL, safeR - mid);
      const leftRope = mid - half + (half * 2 / 3) / 2;
      let worst = { right: 0 };
      for (const p of L1.phases) {
        const mm = /^(.*?\bthe\s+)([a-z]+?)(s?)([.!]?)$/i.exec(p.instruction.trim());
        txt.textContent = ''; let n = 0;
        const word = (t, cls, sp) => { if (!t) return; if (sp && txt.childNodes.length) txt.appendChild(document.createTextNode(' ')); const s = document.createElement('span'); s.className = cls; s.style.setProperty('--i', n++); s.textContent = t; txt.appendChild(s); };
        for (const w of mm[1].trim().split(/\s+/)) word(w, 'iw', true);
        word((mm[2] + mm[3]).toUpperCase(), 'iw key', true); word(mm[4], 'iw', false);
        await new Promise(res => requestAnimationFrame(res));
        const b = pill.getBoundingClientRect();
        const right = (b.right - st.left) * k;
        if (right > worst.right) worst = { right, left: (b.left - st.left) * k, text: p.instruction };
      }
      return { ...worst, leftRope, lines: new Set([...txt.querySelectorAll('.iw')].map(s => s.offsetTop)).size };
    });
    expect(r.left, 'the sign starts at the left edge, not the middle').toBeLessThan(120);
    expect(r.right, `the widest sign (${r.text}) reaches the ropes`).toBeLessThan(r.leftRope - 20);
    expect(r.lines, 'the sentence stays on one line').toBe(1);
  });

  test('the dialogue box is drawn in the game palette, and its words ease in', async ({ page }) => {
    await boot(page, { tutorial: true, skipScreens: true });
    await page.waitForFunction(() => /This is Momo/.test(document.getElementById('tut-text').textContent), null, { timeout: 120_000 });
    const r = await page.evaluate(async () => {
      const m = await import('/js/bubble.js');
      const face = document.querySelector('#tut-shape .tut-face') || document.querySelector('#tut-shape path');
      const cs = getComputedStyle(face), tx = getComputedStyle(document.getElementById('tut-text'));
      const w = document.querySelector('#tut-text .w');
      const pow = document.querySelector('#tut-text .pow');
      return { fill: cs.fill, stroke: cs.stroke, ink: tx.color, BUBBLE: { fill: m.BUBBLE.fill, ink: m.BUBBLE.ink },
               wordAnim: w ? getComputedStyle(w).animationName : null,
               powColor: pow ? getComputedStyle(pow).color : null,
               powBg: pow ? getComputedStyle(pow).backgroundImage : null };
    });
    // white inside with a bright icy-blue keyline, the owner's call after frost-and-navy
    expect(HEX(r.BUBBLE.fill)).toBe('#ffffff');
    expect(HEX(r.BUBBLE.ink)).toBe('#3fb3e8');
    expect(r.fill, 'the drawn shape matches BUBBLE').toBe('rgb(255, 255, 255)');
    expect(r.stroke).toBe('rgb(63, 179, 232)');
    expect(r.ink, 'navy ink').toBe('rgb(12, 51, 82)');
    // the key word is picked out by colour alone: bright orange, no highlighter card behind it
    expect(r.powColor, 'the key word is bright orange').toBe('rgb(242, 97, 0)');
    expect(r.powBg, 'no card behind the key word').toBe('none');
    expect(r.wordAnim, 'the words ease in').toBe('tutWordIn');
  });

  test('the sign drops straight, rebounds upward, and never shows a cut rope end', async ({ page }) => {
    /* The panel is the plank AND the two ropes above it, resting with its top edge on the top
       of the stage so the ropes run off the frame. Two things follow, and both are held here:

       IT MAY NEVER GO BELOW ITS REST LINE. Overshoot downward — which is what a falling weight
       really does, and what the first cut of this animation did by 5% — and the top of the
       element comes into the picture, so the ropes' cut ends hang in the sky as two stubs.
       The rebound is upward instead: every frame is at or above the rest line.

       AND IT MOVES ON ONE AXIS. No sideways travel, no rotation (a board on two ropes cannot
       tilt: the ropes hold it level), no scaling — so there is nothing to jitter or snap. */
    await boot(page, { fast: 2 });
    await force(page, 'GLACIER_BREAK_1');
    await waitState(page, 'PHASE_ACTIVE', 60_000);
    /* SCRUBBED, NOT WATCHED. This used to sample once per animation frame for 1.4s and
       require more than twelve samples. That is a frame-rate assertion wearing a
       correctness costume: on a loaded machine the headless runner delivered exactly
       twelve frames in that window — 8.6fps — and the test failed while the animation was
       perfectly correct. Worse, at that rate the rebound can fall between two samples, so
       the check that matters becomes a coin toss.

       So the animation is paused and scrubbed through its own timeline instead. Sixty
       evenly spaced positions across the active period, read back as computed style, which
       is the same interpolation the browser paints — deterministic, frame-rate independent,
       and it cannot miss a rebound that is really there. */
    const t = await page.evaluate(async () => {
      const p = document.getElementById('instruction-pill');
      p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';   // replay the arrival
      const anim = p.getAnimations().find(a => /sign/i.test(a.animationName || '')) || p.getAnimations()[0];
      if (!anim) return [];
      anim.pause();
      const ct = anim.effect.getComputedTiming();
      const delay = ct.delay || 0;
      const span = ct.activeDuration || ct.duration || 0;
      const rows = [];
      for (let i = 0; i <= 60; i++) {
        anim.currentTime = delay + (span * i) / 60;
        const m = new DOMMatrixReadOnly(getComputedStyle(p).transform);
        rows.push({ dy: m.f, dx: m.e, rot: Math.atan2(m.b, m.a) * 180 / Math.PI, scale: Math.hypot(m.a, m.b) });
      }
      anim.play();
      return rows;
    });
    expect(t.length, 'the arrival was sampled').toBeGreaterThan(12);
    // 0.6px of slack for sub-pixel rounding; anything more is rope end on screen
    expect(Math.max(...t.map(r => r.dy)), 'never below its rest line').toBeLessThan(0.6);
    expect(Math.min(...t.map(r => r.dy)), 'and it really does fall from above').toBeLessThan(-40);
    expect(Math.max(...t.map(r => Math.abs(r.dx))), 'no sideways travel').toBeLessThan(0.6);
    expect(Math.max(...t.map(r => Math.abs(r.rot))), 'no rotation').toBeLessThan(0.05);
    expect(Math.max(...t.map(r => r.scale)) - Math.min(...t.map(r => r.scale)), 'no scaling').toBeLessThan(0.01);
    // a rebound: the direction of travel reverses at least twice on the way to rest
    let turns = 0;
    for (let i = 2; i < t.length; i++) {
      const a = t[i - 1].dy - t[i - 2].dy, b = t[i].dy - t[i - 1].dy;
      if (a * b < -1e-6) turns++;
    }
    expect(turns, 'it rebounds rather than stopping dead').toBeGreaterThanOrEqual(2);
  });

  test('the VO script holds every line the learner is shown', async () => {
    const doc = readFileSync('docs/VO-SCRIPT.md', 'utf8');
    const engine = readFileSync('game/js/engine.js', 'utf8');
    const tut = readFileSync('game/js/tutorial.js', 'utf8');
    const instructions = [...engine.matchAll(/^\s*instruction: '([^']+)' \}/gm)].map(m => m[1]);
    expect(instructions.length, 'the seven crossings').toBe(7);
    for (const line of instructions) expect(doc, `the script is missing: ${line}`).toContain(line);
    // the tutorial's own seven lines, as written in its step list
    const spoken = [...tut.matchAll(/^\s*text: '([^']+)',$/gm)].map(m => m[1]);
    expect(spoken.length).toBeGreaterThanOrEqual(7);
    for (const line of spoken) expect(doc, `the script is missing: ${line}`).toContain(line);
  });
});
