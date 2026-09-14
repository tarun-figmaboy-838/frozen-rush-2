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

/* WHAT THE BROWSER IS TOLD TO KEEP, and for how long. Nothing asserted this before, so
   the whole caching design — the one thing a visitor's SECOND load depends on — was
   riding on a file nobody tested.
 
   The two halves are deliberately opposite and both matter:
 
     assets   immutable for a year. Safe ONLY because every asset URL carries a content
              hash (?v=<md5-8>, see tools/build-bundle.mjs), so changing the art changes
              the URL. Take the hash away and this header strands players on old art.
 
     css/js   must-revalidate. Neither is hashed — index.html asks for css/style.css and
              js/main.js by plain name — so the browser has to ask every time whether it
              still has the current one. style.css matched NO rule at all until this test
              was written, leaving the file that carries the entire HUD to Vercel's
              default, which is not ours to rely on.
 
   Run against the simulator, which applies the real vercel.json the way Vercel does, so
   this fails on the config rather than on a deployed mistake. */
test('the cache headers say what they should', async ({ request }) => {
  const at = async path => {
    const r = await request.get('http://127.0.0.1:8201' + path);
    expect(r.status(), path).toBeLessThan(400);
    return (r.headers()['cache-control'] || '(none)').toLowerCase();
  };

  // hashed, so it may be held forever
  const art = await at('/game/assets/progress/panel.webp');
  console.log('  assets:     ' + art);
  expect(art, 'hashed art should be immutable').toContain('immutable');
  expect(art).toContain('max-age=31536000');

  // NOT hashed, so both must be re-checked on every load
  for (const path of ['/game/css/style.css', '/game/js/main.js']) {
    const h = await at(path);
    console.log('  ' + path.padEnd(22) + h);
    expect(h, path + ' is unhashed and must revalidate').toContain('must-revalidate');
    expect(h, path + ' must not be cached for any length of time').toContain('max-age=0');
    expect(h, path + ' must never be immutable').not.toContain('immutable');
  }

  // the entry point, likewise
  const html = await at('/game/index.html');
  console.log('  index.html:           ' + html);
  expect(html).toContain('must-revalidate');
});
