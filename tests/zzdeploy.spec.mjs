import { test, expect } from '@playwright/test';
/* Points at tools/zzvercel-sim.mjs, which applies the real vercel.json the way Vercel
   does. This is the check that would have caught the 404: the local dev server serves
   game/ AS the root, so a repo-root deploy's relative-path breakage is invisible to it. */
test('the game loads and plays from a simulated Vercel deploy', async ({ page }) => {
  test.setTimeout(120_000);
  const bad = [], errs = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });

  // enter at "/", exactly as a visitor would
  await page.goto('http://127.0.0.1:8201/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.iceAgeGame && window.iceAgeGame.state() !== "BOOT"', null, { timeout: 60_000 });
  console.log('  landed on: ' + page.url());
  console.log('  state:     ' + await page.evaluate('window.iceAgeGame.state()'));

  // the cover, then a real run
  await expect(page.locator('#cover')).toBeVisible();
  await page.locator('#btn-play').click({ force: true });
  await page.waitForFunction(() => ['RUN_SEGMENT_1','JUMP_CHALLENGE_1'].includes(window.iceAgeGame.state()), null, { timeout: 20_000 });

  /* The character is really drawing, which a missing sheet would not be. ANY sheet
     proves that — and the wait above accepts JUMP_CHALLENGE_1, where the character is
     legitimately mid-jump, so pinning this to the run cycle made it a race that lost
     whenever an obstacle happened to be under way. */
  const anim = await page.evaluate('window.iceAgeGame.mammothFrame()');
  console.log('  animating: ' + anim);
  expect(anim, 'a real sheet frame').toMatch(/^(run|jump|skid|idle):\d+$/);

  // and one whole puzzle
  await page.evaluate(() => {
    const g = window.iceAgeGame, G = g.debug();
    G.phase = 0; G.l1 = null; G.phaseLayout = null; G.gapsThisPhase = null;
    g._force('GLACIER_BREAK_1');
  });
  await page.waitForFunction(() => window.iceAgeGame.state() === 'PHASE_ACTIVE', null, { timeout: 30_000 });
  const want = await page.evaluate(() => window.iceAgeGame.debug().l1.wanted[0]);
  await page.evaluate(k => window.iceAgeGame._cut(k), want);
  await page.waitForFunction(() => {
    const gs = window.iceAgeGame.debug().gapsThisPhase || [];
    return gs.length && gs.every(g => g.repaired && g.bridge >= 0.999);
  }, null, { timeout: 20_000 });
  console.log('  repaired a crossing with ' + want);

  console.log('  BROKEN REQUESTS: ' + (bad.join(' | ') || 'none'));
  console.log('  ERRORS:          ' + (errs.join(' | ') || 'none'));
  expect([...new Set(bad)], 'requests that 404 on a deploy').toEqual([]);
  expect(errs.filter(e => e.startsWith('PAGEERROR')), 'the game threw').toEqual([]);
});
