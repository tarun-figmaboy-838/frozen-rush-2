import { test, expect } from '@playwright/test';
/* Runs against the real deployment, not a simulator. Kept out of the default run by
   requiring LIVE_URL; with it set this is the only check that proves production. */
const LIVE = process.env.LIVE_URL;
/* HOW LONG BOOT IS ALLOWED. The whole art set is fetched before the title appears, so on a
   slow link a healthy deployment and a broken one both look like a hung page. Tunable so a
   thin connection reports the truth instead of a false failure: LIVE_BOOT_MS=420000. */
const BOOT_MS = Number(process.env.LIVE_BOOT_MS) || 120_000;
test.skip(!LIVE, 'set LIVE_URL to run against the deployment');

test('the deployed game loads and plays', async ({ page }) => {
  test.setTimeout(BOOT_MS + 120_000);
  const bad = [], errs = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });

  await page.goto(LIVE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.iceAgeGame && window.iceAgeGame.state() !== "BOOT"', null, { timeout: BOOT_MS });
  console.log('  landed on: ' + page.url());
  console.log('  state:     ' + await page.evaluate('window.iceAgeGame.state()'));

  // the stylesheet really applied, which a 404 on style.css would not
  const styled = await page.evaluate(() => getComputedStyle(document.querySelector('.stage')).position);
  console.log('  .stage position (css applied): ' + styled);
  expect(styled).not.toBe('static');

  await expect(page.locator('#cover')).toBeVisible();
  await page.screenshot({ path: 'test-results/live-cover.png' });

  await page.locator('#btn-play').click({ force: true });
  await page.waitForFunction(() => ['RUN_SEGMENT_1','JUMP_CHALLENGE_1'].includes(window.iceAgeGame.state()), null, { timeout: 30_000 });
  const anim = await page.evaluate('window.iceAgeGame.mammothFrame()');
  console.log('  animating: ' + anim);
  expect(anim).toMatch(/^run:\d+$/);
  await page.screenshot({ path: 'test-results/live-run.png' });

  // one whole puzzle, on production
  await page.evaluate(() => {
    const g = window.iceAgeGame, G = g.debug();
    G.phase = 0; G.l1 = null; G.phaseLayout = null; G.gapsThisPhase = null;
    g._force('GLACIER_BREAK_1');
  });
  await page.waitForFunction(() => window.iceAgeGame.state() === 'PHASE_ACTIVE', null, { timeout: 40_000 });
  await page.screenshot({ path: 'test-results/live-phase.png' });
  const want = await page.evaluate(() => window.iceAgeGame.debug().l1.wanted[0]);
  await page.evaluate(k => window.iceAgeGame._cut(k), want);
  await page.waitForFunction(() => {
    const gs = window.iceAgeGame.debug().gapsThisPhase || [];
    return gs.length && gs.every(g => g.repaired && g.bridge >= 0.999);
  }, null, { timeout: 30_000 });
  console.log('  repaired a crossing with ' + want);
  await page.screenshot({ path: 'test-results/live-repaired.png' });

  console.log('  BROKEN REQUESTS: ' + (bad.join(' | ') || 'none'));
  console.log('  ERRORS:          ' + (errs.join(' | ') || 'none'));
  expect([...new Set(bad)], 'requests that 404 on the live deploy').toEqual([]);
  expect(errs.filter(e => e.startsWith('PAGEERROR')), 'the game threw').toEqual([]);
});
