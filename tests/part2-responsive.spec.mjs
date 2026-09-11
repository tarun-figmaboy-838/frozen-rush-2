/* PART 2 AT EVERY SIZE IT HAS TO SURVIVE.
 *
 * The game is a fixed 1920x1080 backbuffer letterboxed into whatever the window is, so
 * nothing here should depend on the viewport at all — everything is laid out in stage
 * units and scaled once. That is the theory, and it is worth one spec because Part 2
 * broke the assumption twice while it was being built: the focused slab is sized from
 * the STAGE and the question board from CSS units, and those two are the places where
 * a viewport can leak into a layout.
 *
 * The slabs now run from y 140 to 1070 of a 1080-tall stage, which leaves 10px of air
 * at the bottom and about 20 at the top. There is no room for a rounding error, and a
 * short viewport is where one would show.
 *
 * The sizes are the three the brief named plus the phone the suite already runs at.
 */
import { test, expect } from '@playwright/test';
import { boot, waitState, jsErrors } from './helpers.mjs';

const SIZES = [
  { name: '1920x1080', w: 1920, h: 1080 },
  { name: '1366x768', w: 1366, h: 768 },
  { name: '1280x720', w: 1280, h: 720 },
  { name: 'phone landscape', w: 844, h: 390 }
];

/** Drop onto Part 2 crossing `n` (1-based) with the slab live. */
async function enterCrossing(page, n) {
  await page.evaluate(i => {
    const g = window.iceAgeGame, G = g.debug();
    G.phase = 0; G.phasesDone = 3; G.l1 = null; G.gapsThisPhase = null;
    G.p2i = i; G.l2 = null; G.gapA = null; G.gapB = null;
    g._force('GLACIER_BREAK_2');
  }, n - 1);
  await waitState(page, ['LEVEL_2_ACTIVE'], 60_000);
  await page.waitForTimeout(700);          // let the handles fade up
}

for (const s of SIZES) {
  test.describe(`Part 2 at ${s.name}`, () => {
    test.setTimeout(240_000);

    /* THE STAGE ITSELF. It is letterboxed 16:9 into the window, and the whole layout
       rests on that being exact — every stage unit is a fraction of this box. */
    test('the stage keeps 16:9 and fits the window', async ({ page }) => {
      await page.setViewportSize({ width: s.w, height: s.h });
      await boot(page);
      const r = await page.evaluate(() => {
        const b = document.getElementById('stage').getBoundingClientRect();
        return { w: b.width, h: b.height, right: b.right, bottom: b.bottom };
      });
      expect(Math.abs(r.w / r.h - 16 / 9), 'the stage is 16:9').toBeLessThan(0.02);
      expect(r.w).toBeLessThanOrEqual(s.w + 1);
      expect(r.h).toBeLessThanOrEqual(s.h + 1);
    });

    /* THE SLAB AND ITS HANDLES. Sized in stage units, so the numbers below are the
       SAME at every viewport — that is the property being tested. A handle reaches
       about 20px past its corner and must stay inside the stage; the question board
       ends at y 117, so nothing may reach above about 130. */
    for (const n of [1, 2, 3]) {
      test(`crossing ${n}: the slab and its handles stay on the stage`, async ({ page }) => {
        await page.setViewportSize({ width: s.w, height: s.h });
        const errors = await boot(page, { speed: 900, fast: 4 });
        await enterCrossing(page, n);
        const r = await page.evaluate(() => {
          const g = window.iceAgeGame;
          const c = g._l2().corners;
          const xs = c.map(q => q.x), ys = c.map(q => q.y);
          return {
            left: Math.min(...xs), right: Math.max(...xs),
            top: Math.min(...ys), bottom: Math.max(...ys),
            boardBottom: (() => {
              const st = document.getElementById('stage').getBoundingClientRect();
              const ins = document.getElementById('instruction').getBoundingClientRect();
              return (ins.bottom - st.top) / st.height * 1080;
            })()
          };
        });
        const PAD = 20;                       // the handle's reach past its corner
        expect(r.top - PAD, 'the top handles clear the question board')
          .toBeGreaterThan(r.boardBottom);
        expect(r.bottom + PAD, 'the bottom handles are on the stage').toBeLessThan(1080);
        expect(r.left - PAD, 'the left handles are on the stage').toBeGreaterThan(0);
        expect(r.right + PAD, 'the right handles are on the stage').toBeLessThan(1920);
        expect(jsErrors(errors), 'the game threw').toEqual([]);
      });
    }

    /* AND IT IS STILL PLAYABLE. A layout that fits but cannot be cut is no better than
       one that clips — the corners have to be reachable, which on the smallest stage
       means the drag tolerance has to scale with it too. */
    test('crossing 1 can still be cut with a real drag', async ({ page }) => {
      await page.setViewportSize({ width: s.w, height: s.h });
      const errors = await boot(page, { speed: 900 });
      await enterCrossing(page, 1);
      const box = await page.locator('#stage').boundingBox();
      const c = await page.evaluate(() => window.iceAgeGame._l2().corners);
      const at = i => ({
        x: box.x + c[i].x / 1920 * box.width,
        y: box.y + c[i].y / 1080 * box.height
      });
      const a = at(0), b = at(3);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      for (let k = 1; k <= 10; k++) {
        await page.mouse.move(a.x + (b.x - a.x) * k / 10, a.y + (b.y - a.y) * k / 10);
      }
      await page.mouse.up();
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({
        state: window.iceAgeGame.state(), attempts: window.iceAgeGame.debug().attempts
      }));
      expect(after.attempts, 'the drag was read').toBeGreaterThan(0);
      expect(['LEVEL_2_SUCCESS', 'BRIDGE_2_COMPLETE', 'RUN_SEGMENT_2'],
        'the cut was accepted').toContain(after.state);
      expect(jsErrors(errors), 'the game threw').toEqual([]);
    });

    /* THE INTERFACE SHARE. The board is the only thing on the stage that is not the
       game, and on a short viewport CSS clamps can let it grow out of proportion. */
    test('the question board stays a small share of the stage', async ({ page }) => {
      await page.setViewportSize({ width: s.w, height: s.h });
      await boot(page, { speed: 900, fast: 4 });
      await enterCrossing(page, 1);
      const share = await page.evaluate(() => {
        const st = document.getElementById('stage').getBoundingClientRect();
        const ins = document.getElementById('instruction').getBoundingClientRect();
        return (ins.width * ins.height) / (st.width * st.height);
      });
      expect(share, 'the board covers under 12% of the stage').toBeLessThan(0.12);
    });
  });
}
