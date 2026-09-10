/* THE CONTROLS UNDER A FINGER, and the launch furniture.
 *
 * Found on the deployment: a JUMP button that hopped 24px on every press, a blank page while
 * the art loaded, a preload warning on every load, and no icon. These hold the fixes — and
 * the button itself is gone now, so the first of them holds THAT instead. */
import { test, expect } from '@playwright/test';
import { boot, READY, force, waitState } from './helpers.mjs';

test.describe('controls', () => {
  test.setTimeout(90_000);

  test('there is no JUMP button: the whole stage is the control', async ({ page }) => {
    /* The button was removed on request — a tap anywhere already jumped, so it was a
       second way to do one thing and a corner target competing with the instruction that
       matters. This holds the removal from every side it could come back from: the
       markup, the stylesheet, and the code that used to press it. */
    await boot(page);
    await waitState(page, 'RUN_SEGMENT_1');
    await page.waitForFunction('window.iceAgeGame.debug().jumpEnabled === true');
    const gone = await page.evaluate(async () => {
      const css = await (await fetch('/css/style.css')).text();
      const hud = await (await fetch('/js/hud.js')).text();
      return {
        inMarkup: !!document.getElementById('btn-jump') || !!document.querySelector('.btn-jump'),
        inCss: /\.btn-jump/.test(css),
        inHud: /btn-jump|flashJump/.test(hud)
      };
    });
    expect(gone.inMarkup, 'no button in the markup').toBe(false);
    expect(gone.inCss, 'no rules left behind for one').toBe(false);
    expect(gone.inHud, 'and nothing in the HUD still looking for it').toBe(false);

    // and the control that replaced it works from anywhere on the stage
    const box = await page.locator('#stage').boundingBox();
    await page.mouse.click(box.x + box.width * 0.18, box.y + box.height * 0.22);   // a corner of empty sky
    await page.waitForFunction('window.iceAgeGame.mammothState() !== "RUN"', null, { timeout: 20_000 });
  });

  test('a tap on a block answers: its halo flashes and the hand shows how', async ({ page }) => {
    await boot(page);
    /* Through the INTRO, not straight to ACTIVE: the intro is what lowers the blocks in
       (dropReady), and a forced PHASE_ACTIVE leaves them held above the screen. */
    await force(page, 'PHASE_INTRO');
    await page.waitForFunction(() => window.iceAgeGame.state() === 'PHASE_ACTIVE', null, { timeout: 20_000 });
    await page.waitForFunction(() => { const L = window.iceAgeGame.debug().l1; return L && L.shapes.some(s => s.state === 'hang' && s.y > 400); }, null, { timeout: 20_000 });
    await page.waitForTimeout(400);
    const at = await page.evaluate(() => {
      const G = window.iceAgeGame.debug(); const r = document.getElementById('stage').getBoundingClientRect();
      const sh = G.l1.shapes.find(s => s.state === 'hang' && G.l1.unfilled.includes(s.kind));
      return { kind: sh.kind, x: r.left + sh.x / 1920 * r.width, y: r.top + sh.y / 1080 * r.height };
    });
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => {
      const G = window.iceAgeGame.debug();
      const want = G.l1.shapes.find(s => s.state === 'hang' && G.l1.unfilled.includes(s.kind));
      /* ON THE ANSWER'S OWN CUT LINE. It used to be measured against the block's anchorX,
         which is where the rope leaves the fog — the hand belongs where the marching
         dashes are, and with the rig swaying that is up to a dozen pixels off the anchor.
         Both now come from the one published point (engine.js: cutGuide -> sh.guide), so
         this holds the thing that actually matters: the hand is on the right rope, at the
         place that rope is marked to be cut. */
      const gd = want.guide;
      return { flashed: G.l1.shapes.filter(s => (s.flash || 0) > 0.1).map(s => s.kind), hand: !!G.handHint,
               handOnAnswer: !!G.handHint && !!gd && Math.abs(G.handHint.x - gd.x) < 0.5 && Math.abs(G.handHint.y - gd.y) < 0.5,
               handNearRope: !!G.handHint && Math.abs(G.handHint.x - want.anchorX) < 30,
               state: G.state, attempts: G.attempts };
    });
    // light, not movement: the options hold still while they are read, so the answer is the halo
    expect(after.flashed, 'the tapped block flashes').toContain(at.kind);
    expect(after.hand, 'the demonstration hand comes forward').toBe(true);
    expect(after.handOnAnswer, 'and it is on the cut line of the answer, never a wrong one').toBe(true);
    expect(after.handNearRope, 'which is the answer\'s own rope').toBe(true);
    expect(after.state).toBe('PHASE_ACTIVE');         // a tap is not a cut
    expect(after.attempts).toBe(0);
  });

  test('a real swipe leaves a sweep-slash where it crossed the rope', async ({ page }) => {
    await boot(page);
    await force(page, 'PHASE_INTRO');
    await page.waitForFunction(() => window.iceAgeGame.state() === 'PHASE_ACTIVE', null, { timeout: 20_000 });
    await page.waitForFunction(() => { const L = window.iceAgeGame.debug().l1; return L && L.shapes.some(s => s.state === 'hang' && s.y > 400); }, null, { timeout: 20_000 });
    const geo = await page.evaluate(() => {
      const G = window.iceAgeGame.debug(); const r = document.getElementById('stage').getBoundingClientRect();
      const sh = G.l1.shapes.find(s => s.state === 'hang' && G.l1.unfilled.includes(s.kind));
      const ax = sh.anchorX === undefined ? sh.x : sh.anchorX;
      return { x: r.left + ax / 1920 * r.width, y: r.top + 300 / 1080 * r.height, span: 90 / 1920 * r.width };
    });
    /* Read the mark the moment the cut registers: a headless pointer step costs ~70ms of game
       time, and a 0.3s flash is gone by the end of an eight-step swipe. */
    await page.mouse.move(geo.x - geo.span, geo.y); await page.mouse.down();
    let mark = { n: 0 };
    for (let i = 1; i <= 8 && !mark.n; i++) {
      await page.mouse.move(geo.x - geo.span + 2 * geo.span * i / 8, geo.y);
      mark = await page.evaluate(() => {
        const P = window.iceAgeGame._particles().list.filter(p => p.kind === 'slash' && !p.dead);
        return { n: P.length, y: P[0] && P[0].y, ang: P[0] && P[0].ang, state: window.iceAgeGame.state() };
      });
    }
    await page.mouse.up();
    expect(mark.n, 'a slash mark and its echo').toBe(2);
    expect(Math.abs(mark.ang), 'level swipe, level slash').toBeLessThan(0.2);
    expect(mark.y, 'at the stroke height').toBeGreaterThan(250);
    expect(mark.y).toBeLessThan(350);
    expect(['PHASE_SUCCESS', 'PHASE_DONE', 'PHASE_RUN', 'PHASE_WRONG']).toContain(mark.state);
  });

  test('after a crash Momo blinks, and cannot be hit again until the blink is over', async ({ page }) => {
    await boot(page, { fast: 1 });
    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      g._force('JUMP_CHALLENGE_1');
      const t0 = Date.now();
      while (Date.now() - t0 < 12000 && g.debug().state !== 'OBSTACLE_HIT') await new Promise(res => requestAnimationFrame(res));
      const hits = g.debug().hitCount;
      g.retryObstacle();
      const armed = g.debug().invincibleT;
      const blinkS = (await import('/js/engine.js')).CFG.juice.respawnBlinkS;
      // run on for most of the blink: nothing may count while it is on
      const t1 = Date.now();
      while (Date.now() - t1 < 600) await new Promise(res => requestAnimationFrame(res));
      const during = { hits: g.debug().hitCount, inv: g.debug().invincibleT };
      const t2 = Date.now();
      while (Date.now() - t2 < 1500 && g.debug().invincibleT > 0) await new Promise(res => requestAnimationFrame(res));
      return { hits, armed, blinkS, during, after: g.debug().invincibleT };
    });
    expect(r.hits, 'one crash').toBe(1);
    expect(r.blinkS, 'about one second, as asked (1.6 read as two)').toBeLessThanOrEqual(1.05);
    expect(r.blinkS).toBeGreaterThanOrEqual(0.8);
    expect(r.armed, 'the blink is armed on respawn').toBeGreaterThanOrEqual(r.blinkS - 0.05);
    expect(r.during.hits, 'no second hit while blinking').toBe(1);
    expect(r.after, 'and it wears off').toBe(0);
  });

  test('invincibility never touches input: a jump works during the blink', async ({ page }) => {
    await boot(page, { fast: 1 });
    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      g._force('JUMP_CHALLENGE_1');
      const t0 = Date.now();
      while (Date.now() - t0 < 12000 && g.debug().state !== 'OBSTACLE_HIT') await new Promise(res => requestAnimationFrame(res));
      g.retryObstacle();
      const t1 = Date.now();
      while (Date.now() - t1 < 3000 && !(g.debug().jumpEnabled && g.mammothState() === 'RUN')) await new Promise(res => requestAnimationFrame(res));
      const inv = g.debug().invincibleT;
      g.jump();
      await new Promise(res => setTimeout(res, 150));
      return { inv, state: g.mammothState() };
    });
    expect(r.inv, 'still blinking').toBeGreaterThan(0.5);
    expect(r.state, 'and the jump was taken').not.toBe('RUN');
  });

  test('dismissing a dialogue line never jumps: a tap while a line is read arms nothing', async ({ page }) => {
    await boot(page, { tutorial: true, skipScreens: true });
    // the first describing line freezes the game in a run state with jumping enabled
    await page.waitForFunction(() => { const l = document.getElementById('tutorial'); const tx = document.getElementById('tut-text'); return l && !l.hidden && tx && /This is Momo/.test(tx.textContent); }, null, { timeout: 30_000 });
    await page.waitForFunction(() => window.iceAgeGame.paused && window.iceAgeGame.paused(), null, { timeout: 5_000 }).catch(() => {});
    const r = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 400, clientY: 200, pointerId: 3, pointerType: 'touch', isPrimary: true }));
      window.iceAgeGame.jump();                                   // the button, too
      return { armed: !!window.iceAgeGame.debug().jumpArmed, state: window.iceAgeGame.debug().state, m: window.iceAgeGame.mammothState() };
    });
    expect(r.armed, 'a dismissing tap must not arm a jump').toBe(false);
    expect(r.m).toBe('RUN');
  });

  test('the page has an icon, and no preload warnings', async ({ page }) => {
    const warnings = [];
    page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });
    await boot(page, { skipScreens: false });
    for (const u of ['/favicon.png', '/apple-touch-icon.png']) {
      const res = await page.request.get(u);
      expect(res.status(), u).toBe(200);
      expect(res.headers()['content-type'] || '', u).toContain('image/png');
    }
    expect(warnings.filter(w => /preload/i.test(w)), 'preload warnings').toEqual([]);
  });

  test('the cover shows before the art is in, and PLAY is held until READY', async ({ page }) => {
    /* The cover appears as soon as the page runs; while the sheets load its note is up and
       PLAY does nothing. Once READY the note is gone and PLAY starts the run. */
    page.on('pageerror', e => { throw e; });
    await page.goto('/index.html?sound=0&tutorial=0');
    await expect(page.locator('#cover')).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(READY, null, { timeout: 60_000 });
    await expect(page.locator('#cover-loading')).toBeHidden();
    await expect(page.locator('#cover')).not.toHaveClass(/loading/);
    await page.locator('#btn-play').click();
    await expect(page.locator('#cover')).toBeHidden({ timeout: 5_000 });
  });
});
