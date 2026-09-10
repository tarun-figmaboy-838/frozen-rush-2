/* CROSSING 1, PLAYED THE WAY A CHILD PLAYS IT — tutorial and all.
 *
 * Every other spec for this level forces the state and turns the tutorial off, which is
 * right for testing the rule and wrong for testing whether the level can be PLAYED. The
 * reported fault ("user unable to cut") did not reproduce under those conditions, so
 * this reproduces the real path instead: press play, sit through the tutorial, and try
 * to cut with a real pointer.
 */
import { test, expect } from '@playwright/test';
import { boot, G, waitState, jsErrors } from './helpers.mjs';

test.describe('crossing 1, played live', () => {
  test.setTimeout(240_000);

  test('the run reaches the diagonal crossing with the tutorial running', async ({ page }) => {
    const errors = await boot(page, { speed: 900, fast: 3, tutorial: true });
    /* It has to get there on its own: the tutorial jump step waits for a real jump, so
       the harness clears the rock the way a player would. */
    const trail = await page.evaluate(async () => {
      const g = window.iceAgeGame, seen = [];
      let last = '';
      const t0 = Date.now();
      while (Date.now() - t0 < 90_000) {
        const G = g.debug();
        if (G.state !== last) { seen.push(G.state); last = G.state; }
        for (const o of g._obstacles().list) {
          const sx = o.x - G.worldX;
          if (sx > 380 && sx < 700 && !o.passed) g.jump();
        }
        if (G.state === 'OBSTACLE_HIT') g.retryObstacle();
        if (G.state === 'LEVEL_2_ACTIVE') break;
        await new Promise(r => requestAnimationFrame(r));
      }
      return seen;
    });
    expect(trail.join(' '), 'the journey reached the crossing: ' + trail.join(' '))
      .toContain('LEVEL_2_ACTIVE');
    // and the beats happened in the order the level was designed in
    const i = n => trail.indexOf(n);
    expect(i('LEVEL_2_OVERVIEW'), 'the scene was shown').toBeGreaterThan(-1);
    expect(i('LEVEL_2_OVERVIEW')).toBeLessThan(i('LEVEL_2_FOCUS'));
    expect(i('LEVEL_2_FOCUS')).toBeLessThan(i('LEVEL_2_ACTIVE'));
    expect(jsErrors(errors), 'the game threw').toEqual([]);
  });

  /* THE REPORTED FAULT. Reaching the level is not the same as being able to play it:
     the tutorial pauses the simulation while it explains, and a paused game drops
     pointer input on the floor (engine onDown returns early). If a step is still
     holding the freeze when the slab goes live, the child drags and nothing happens. */
  test('the game is not frozen when the slab goes live', async ({ page }) => {
    await boot(page, { speed: 900, fast: 3, tutorial: true });
    await page.evaluate(async () => {
      const g = window.iceAgeGame;
      const t0 = Date.now();
      while (Date.now() - t0 < 90_000) {
        const G = g.debug();
        for (const o of g._obstacles().list) {
          const sx = o.x - G.worldX;
          if (sx > 380 && sx < 700 && !o.passed) g.jump();
        }
        if (G.state === 'OBSTACLE_HIT') g.retryObstacle();
        if (G.state === 'LEVEL_2_ACTIVE') break;
        await new Promise(r => requestAnimationFrame(r));
      }
    });
    // give any tutorial step its moment, then look
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      state: window.iceAgeGame.state(),
      paused: window.iceAgeGame.paused,
      dialogue: window.iceAgeGame.debug().dialogue
    }));
    expect(r.state).toBe('LEVEL_2_ACTIVE');
    expect(r.paused, 'the simulation is running, so a drag can be read').toBe(false);
  });

  test('a real drag cuts it, with the tutorial running', async ({ page }) => {
    const errors = await boot(page, { speed: 900, fast: 3, tutorial: true });
    await page.evaluate(async () => {
      const g = window.iceAgeGame;
      const t0 = Date.now();
      while (Date.now() - t0 < 90_000) {
        const G = g.debug();
        for (const o of g._obstacles().list) {
          const sx = o.x - G.worldX;
          if (sx > 380 && sx < 700 && !o.passed) g.jump();
        }
        if (G.state === 'OBSTACLE_HIT') g.retryObstacle();
        if (G.state === 'LEVEL_2_ACTIVE') break;
        await new Promise(r => requestAnimationFrame(r));
      }
    });
    await page.waitForTimeout(2000);

    const box = await page.locator('#stage').boundingBox();
    const l2 = await page.evaluate(() => window.iceAgeGame._l2());
    expect(l2, 'the slab is there to be cut').not.toBeNull();
    const at = i => ({
      x: box.x + l2.corners[i].x / 1920 * box.width,
      y: box.y + l2.corners[i].y / 1080 * box.height
    });
    const a = at(0), b = at(3);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let s = 1; s <= 10; s++) {
      await page.mouse.move(a.x + (b.x - a.x) * s / 10, a.y + (b.y - a.y) * s / 10);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(600);

    const after = await page.evaluate(() => ({
      state: window.iceAgeGame.state(),
      attempts: window.iceAgeGame.debug().attempts
    }));
    expect(after.attempts, 'the drag was READ as an attempt').toBeGreaterThan(0);
    expect(['LEVEL_2_SUCCESS', 'BRIDGE_2_COMPLETE', 'PHASE_RUN'],
      'and it was accepted').toContain(after.state);
    expect(jsErrors(errors), 'the game threw').toEqual([]);
  });
});
