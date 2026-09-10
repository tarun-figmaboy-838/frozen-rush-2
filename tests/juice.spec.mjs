/* THE IMPACT LAYER — hit-stop, camera punch and the impact ring.

   This layer stops the simulation and scales the view, which is to say it is the one
   piece of polish that can genuinely break the game rather than merely look wrong. So
   what is asserted here is not "it feels punchy" — it is the three ways it could hurt:

     1. a hold that never ends, or that several events can stack into a stall
     2. a punch big enough to pull the world in from the letterboxed frame edge
     3. any of it still running when the player has asked for reduced motion

   Plus the one positive: a correct answer really does produce the beat.

   See RUNNER.md §9a. Note there are no pickup tokens and no pickup sound — both were
   removed on request, and §9a records why so they are not re-proposed. */
import { test, expect } from '@playwright/test';
import { boot, waitState, G, jsErrors } from './helpers.mjs';

/** Run to the first playable phase, jumping whatever is in the way. */
const toPhase = page => page.evaluate(async () => {
  const g = window.iceAgeGame;
  const t0 = Date.now();
  while (Date.now() - t0 < 180_000) {
    const S = g.debug();
    for (const o of g._obstacles().list) {
      const sx = o.x - S.worldX;
      if (sx > 380 && sx < 700 && !o.passed) g.jump();
    }
    if (S.state === 'OBSTACLE_HIT') g.retryObstacle();
    if (S.state === 'PHASE_ACTIVE' && S.l1 && S.l1.unfilled.length) return true;
    await new Promise(r => requestAnimationFrame(r));
  }
  return false;
});

test.describe('the impact layer', () => {
  test('a hold is bounded, and several events on one frame cannot stall the game',
    async ({ page }) => {
      const errors = await boot(page, { fast: 4 });
      await waitState(page, ['RUN_SEGMENT_1', 'JUMP_CHALLENGE_1'], 30_000);

      /* Fire every hold the game has, all on the same frame, several rounds over, and
         then one absurd request on top. The clamp is what has to hold: the longest
         possible freeze is stopMax no matter how many callers pile on at once. */
      const r = await page.evaluate(async () => {
        const g = window.iceAgeGame;
        const J = g._juice();
        let worst = 0;
        for (let round = 0; round < 6; round++) {
          g._hitStop(J.stopBreak);
          g._hitStop(J.stopHit);
          g._hitStop(J.stopWedge);
          g._hitStop(9999);                 // a caller asking for the world
          worst = Math.max(worst, g.debug().freeze * 1000);
          await new Promise(rr => requestAnimationFrame(rr));
        }
        return { worst, ceiling: J.stopMax };
      });
      expect(r.worst).toBeGreaterThan(0);                    // the holds really ran
      expect(r.worst).toBeLessThanOrEqual(r.ceiling + 1);    // and never past the cap

      // and it drains: the game is running again, and game time is advancing
      const before = (await G(page)).t;
      await page.waitForTimeout(700);
      const after = await G(page);
      expect(after.freeze).toBeLessThanOrEqual(0);
      expect(after.t).toBeGreaterThan(before);
      expect(jsErrors(errors)).toEqual([]);
    });

  test('the punch never scales far enough to show the frame edge', async ({ page }) => {
    await boot(page, { fast: 4 });
    await waitState(page, ['RUN_SEGMENT_1', 'JUMP_CHALLENGE_1'], 30_000);
    const peak = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      const J = g._juice();
      let peak = 0;
      // the biggest punch in the game, sampled right across its envelope
      g._punch(J.punchBreak, J.punchMs, 960, 840);
      const t0 = Date.now();
      while (Date.now() - t0 < 1200) {
        peak = Math.max(peak, g.debug().punchAt);
        await new Promise(r => requestAnimationFrame(r));
      }
      return peak;
    });
    expect(peak).toBeGreaterThan(0);          // it actually ran
    expect(peak).toBeLessThanOrEqual(0.03);   // and stayed inside the frame
    // and it settles back to no scale at all
    expect((await G(page)).punchAt).toBeLessThanOrEqual(0.0005);
  });

  test('a correct answer holds the frame and marks the spot', async ({ page }) => {
    const errors = await boot(page, { fast: 6 });
    expect(await toPhase(page)).toBe(true);

    const beat = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      g.setOptions({ fast: 1 });
      g._cut(g.debug().l1.unfilled[0]);
      const seen = { ring: false, held: 0, punched: 0 };
      const t0 = Date.now();
      while (Date.now() - t0 < 12_000) {
        for (const p of g._particles().list) {
          if (!p.dead && p.kind === 'ring') seen.ring = true;
        }
        const S = g.debug();
        seen.held = Math.max(seen.held, S.freeze);
        seen.punched = Math.max(seen.punched, S.punchAt);
        if (seen.ring && seen.held > 0 && seen.punched > 0) break;
        await new Promise(r => requestAnimationFrame(r));
      }
      return seen;
    });
    expect(beat.ring).toBe(true);              // the impact was marked
    expect(beat.held).toBeGreaterThan(0);      // the frame was held on it
    expect(beat.punched).toBeGreaterThan(0);   // and the view answered
    expect(jsErrors(errors)).toEqual([]);
  });

  test('no pickup token is ever spawned', async ({ page }) => {
    /* The coin was removed on request. This is the guard that keeps it removed: it
       plays a phase through and asserts nothing of that kind ever appears, so the
       particle kind cannot quietly come back with a later change. */
    await boot(page, { fast: 6 });
    expect(await toPhase(page)).toBe(true);
    const kinds = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      const seen = new Set();
      g._cut(g.debug().l1.unfilled[0]);
      const t0 = Date.now();
      while (Date.now() - t0 < 12_000) {
        for (const p of g._particles().list) if (!p.dead) seen.add(p.kind);
        if (g.debug().state === 'PHASE_DONE') break;
        await new Promise(r => requestAnimationFrame(r));
      }
      return [...seen];
    });
    expect(kinds).not.toContain('coin');
    expect(kinds.length).toBeGreaterThan(0);   // effects did run, so this proves something
  });

  test('reduced motion switches the whole layer off', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/index.html?skip=1&sound=0&fast=4&reduced=1');
    await page.waitForFunction(
      'window.iceAgeGame && window.iceAgeGame.state() !== "BOOT"', null, { timeout: 60_000 });
    await waitState(page, ['RUN_SEGMENT_1', 'JUMP_CHALLENGE_1'], 30_000);

    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      const J = g._juice();
      g._hitStop(J.stopBreak);
      g._punch(J.punchBreak, J.punchMs, 960, 840);
      await new Promise(rr => requestAnimationFrame(rr));
      const S = g.debug();
      return { freeze: S.freeze, punchAt: S.punchAt, punchLen: S.punchLen };
    });
    // no hold and no scale: a player who asked for less motion gets none of it
    expect(r.freeze).toBeLessThanOrEqual(0);
    expect(r.punchAt).toBe(0);
    expect(r.punchLen).toBe(0);
    expect(errors).toEqual([]);
  });
});
