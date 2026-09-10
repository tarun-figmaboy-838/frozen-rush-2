/* THE FILE:// BUILD.
 *
 * game/index.html loads the ES modules over http:// and the concatenated classic
 * script over file://, because a browser fetches a module with CORS even from a
 * file:// page and file:// refuses. That split has exactly one failure mode worth
 * guarding, and it is a bad one: a bundle that no longer matches the modules. The two
 * origins would then run DIFFERENT CODE, and the person who opened the file version
 * would report a bug nobody could reproduce over a server.
 *
 * So the first test here rebuilds the bundle in memory and fails if the committed file
 * differs. A forgotten `node tools/build-bundle.mjs` is a red test, not a mystery.
 */
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

test.describe('the file:// build', () => {
  test('the bundle is in sync with the modules', async () => {
    const { build } = await import('../tools/build-bundle.mjs');
    const expected = await build();
    const actual = await readFile(resolve('game/js/game.bundle.js'), 'utf8');
    expect(actual === expected,
      'game/js/game.bundle.js is out of date — run: node tools/build-bundle.mjs').toBe(true);
  });

  test('index.html loads and plays when opened straight off the disk', async ({ page }) => {
    test.setTimeout(180_000);
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    page.on('requestfailed', r => errs.push('requestfailed: ' + r.url().split('/').pop()));

    await page.goto(pathToFileURL(resolve('game/index.html')).href);
    await page.waitForFunction('window.iceAgeGame && window.iceAgeGame.state() !== "BOOT"',
      null, { timeout: 90_000 });

    // the cover is up and the supplied PLAY art is on it
    await expect(page.locator('#cover')).toBeVisible();
    await page.locator('#btn-play').click({ force: true });
    await page.waitForTimeout(400);

    /* It has to PLAY, not merely load. Two phases repaired proves the whole chain
       works off the disk: the sprite sheets, the sky set, the option art, the ring
       geometry, the state machine and the cut. */
    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      g.setOptions({ fast: 6 });
      const t0 = Date.now();
      while (Date.now() - t0 < 90_000) {
        const G = g.debug();
        for (const o of g._obstacles().list) {
          const sx = o.x - G.worldX;
          if (sx > 380 && sx < 700 && !o.passed) g.jump();
        }
        if (G.state === 'OBSTACLE_HIT') g.retryObstacle();
        if (G.state === 'PHASE_ACTIVE' && G.l1) g._cut(G.l1.unfilled[0]);
        if (G.phasesDone >= 2) break;
        await new Promise(res => requestAnimationFrame(res));
      }
      const G = g.debug();
      return {
        phasesDone: G.phasesDone,
        // the rock art needs pixel access to measure; a file:// canvas is tainted, so
        // this proves the measureContent fallback kept the obstacles visible
        rocks: g._obstacles().kinds.length
      };
    });
    expect(r.phasesDone, 'two crossings repaired from the disk').toBeGreaterThanOrEqual(2);
    expect(r.rocks, 'the rocks still have art despite a tainted canvas').toBeGreaterThan(0);

    /* AND IT MUST BE QUIET. The recorded sound cues need fetch() and the music bed
       needs a CORS-clean media element; neither works on the file scheme, and both
       used to log an error per asset — nine console errors for a game that was
       otherwise running perfectly. They are skipped on this scheme now and fall back
       to the synthesised palette, silently. */
    expect([...new Set(errs)], 'no errors when run off the disk').toEqual([]);
  });
});
