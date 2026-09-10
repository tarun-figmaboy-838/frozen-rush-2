/* A visual sweep: the cover, the hand-off to the run, the play screen at three times of
   day, and a settled repair. Not assertions — pictures to judge.
     npx playwright test shot-qa --project=desktop                                 */
import { test } from '@playwright/test';

// A visual sweep, not a pass/fail suite: run it deliberately with SHOTS=1.
const SHOTS = !!process.env.SHOTS;
import { boot, waitState } from './helpers.mjs';

test('screens', async ({ page }) => {
  test.skip(!SHOTS, 'visual sweep — run with SHOTS=1');
  test.setTimeout(180_000);
  await page.goto('/index.html?sound=0');
  await page.waitForFunction('window.iceAgeGame && window.iceAgeGame.state() !== "BOOT"', null, { timeout: 60_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/qa-cover.png' });

  // PLAY now goes straight to the run: there is no select screen to photograph
  await page.locator('#btn-play').click({ force: true });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/qa-handoff.png' });
});

test('play at three times of day', async ({ page }) => {
  test.skip(!SHOTS, 'visual sweep — run with SHOTS=1');
  test.setTimeout(180_000);
  await boot(page, { skipScreens: true });
  for (const [name, prog] of [['morning', 0.26], ['sunset', 0.68], ['night', 0.94]]) {
    await page.evaluate(p => { window.iceAgeGame.debug().progress = p; }, prog);
    await page.waitForTimeout(1900);          // let the crossfade land
    await page.screenshot({ path: `test-results/qa-sky-${name}.png` });
  }
});

test('a settled repair, full frame', async ({ page }) => {
  test.skip(!SHOTS, 'visual sweep — run with SHOTS=1');
  test.setTimeout(180_000);
  await boot(page, { skipScreens: true });
  await page.evaluate(() => {
    const g = window.iceAgeGame;
    g.debug().phase = 2;
    g.debug().phaseTargets = null;
    g._force('GLACIER_BREAK_1');   // the real collapse, so the crevasse is actually OPEN
  });
  await waitState(page, ['PHASE_ACTIVE'], 25_000);
  await page.screenshot({ path: 'test-results/qa-puzzle.png' });
  const want = await page.evaluate(() => window.iceAgeGame.debug().l1.targets[0].kind);
  await page.evaluate(k => window.iceAgeGame._cut(k), want);
  await page.waitForFunction(() => {
    const gs = window.iceAgeGame.debug().gapsThisPhase || [];
    return gs.length && gs.every(g => g.repaired && g.bridge >= 0.999 &&
      (g.pieces || []).length && g.pieces.every(p => p.grow >= 0.999));
  }, null, { timeout: 12_000, polling: 'raf' }).catch(() => {});
  await page.waitForTimeout(300);          // the seal settles
  await page.evaluate(() => window.iceAgeGame.setPaused(true));
  await page.screenshot({ path: 'test-results/qa-repaired.png' });
});
