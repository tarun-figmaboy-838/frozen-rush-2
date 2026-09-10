/* THE TEMPORARY "SKIP TO ENDING" REVIEW CONTROL.
 *
 * It exists so the ending can be checked without playing seven phases. This holds what it
 * has to do while it exists: be up during play and gone on the cover and at the end, and
 * drive the REAL ending — the run home, the arrival, the banner with all seven stamps. */
import { test, expect } from '@playwright/test';
import { boot, waitState } from './helpers.mjs';

test.describe('skip to ending (temporary)', () => {
  test.setTimeout(90_000);

  test('hidden on the cover, shown in play, and it plays the whole ending', async ({ page }) => {
    const errors = await boot(page, { skipScreens: false });
    const btn = page.locator('#btn-skip-end');
    await expect(btn).toBeHidden();                 // the cover is not play

    await page.locator('#btn-play').click();        // as a player would: PLAY dismisses the cover
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    expect(box.height, 'tap target').toBeGreaterThanOrEqual(24);

    await btn.click();
    // the run home, then the arrival: the friend stands a short way ahead
    expect(await waitState(page, ['FINAL_RUN', 'COMPLETE'], 5_000)).toMatch(/FINAL_RUN|COMPLETE/);
    // the run home is six seconds of game time, and a loaded runner plays it at a third of that
    await waitState(page, 'COMPLETE', 60_000);
    await expect(btn).toBeHidden();                 // gone once the ending is up

    await expect(page.locator('#complete')).toBeVisible();
    /* THE DANCE IS THE REWARD, and nothing is allowed to sit on top of it. First the row of
       seven polygon coins went, then the banner that replaced them — "You did it!" over "Momo
       crossed the Frozen Pass!", both spoken — because a card across the top third of the
       stage with words moving in it is the eye's first stop, and the thing the child has just
       earned is the two of them dancing underneath it. So what is held here is the absence:
       no banner, no title, no ending speech. Only Play again. */
    await expect(page.locator('#win-stamps')).toHaveCount(0);
    await expect(page.locator('#win-bubble')).toHaveCount(0);
    await expect(page.locator('.win-title')).toHaveCount(0);
    await expect(page.locator('#win-sub')).toHaveCount(0);
    await expect(page.locator('#btn-replay')).toBeVisible();

    /* AND THE CAMERA CLOSES ON THEM. At zoom 1 the pair are a small couple in a wide empty
       stage. The push-in starts a beat after they arrive, so it is read after the settle
       rather than at it, and it frames the pair with air around them. */
    await page.waitForFunction(() => window.iceAgeGame.debug().zoom > 1.3, null, { timeout: 60_000 });
    const shot = await page.evaluate(() => {
      const G = window.iceAgeGame.debug();
      const d = G.duoRect;
      const k = G.zoom, vx = G.zoomVX, vy = G.zoomVY;
      // the visible world rectangle at this zoom, about the focus point
      const view = { x0: vx - vx / k, y0: vy - vy / k, x1: vx + (1920 - vx) / k, y1: vy + (1080 - vy) / k };
      return { zoom: +k.toFixed(3), vx, vy, duo: d && { x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.w), h: Math.round(d.h) }, view };
    });
    console.log('ENDING FRAMING', JSON.stringify(shot));
    expect(shot.zoom, 'the camera really pushed in').toBeGreaterThan(1.3);
    expect(shot.duo, 'the pair are on screen').toBeTruthy();
    // and the whole pair is inside the frame — a zoom that crops the dance is worse than none
    expect(shot.duo.x, 'the dancers are not cut off on the left').toBeGreaterThanOrEqual(shot.view.x0);
    expect(shot.duo.x + shot.duo.w, 'nor on the right').toBeLessThanOrEqual(shot.view.x1);
    expect(shot.duo.y, 'nor at the top').toBeGreaterThanOrEqual(shot.view.y0);
    expect(shot.duo.y + shot.duo.h, 'nor at the bottom').toBeLessThanOrEqual(shot.view.y1);
    const g = await page.evaluate(() => ({ complete: window.iceAgeGame.debug().complete, phases: window.iceAgeGame.debug().phasesDone }));
    expect(g.complete).toBe(true);
    expect(g.phases).toBe(7);
    expect(errors).toEqual([]);
  });

  test('does nothing on the cover or once complete', async ({ page }) => {
    await boot(page, { skipScreens: false });
    expect(await page.evaluate(() => window.iceAgeGame.skipToEnd())).toBe(false);
    await page.evaluate(() => window.iceAgeGame.begin());
    expect(await page.evaluate(() => window.iceAgeGame.skipToEnd())).toBe(true);
    await waitState(page, 'COMPLETE', 25_000);
    expect(await page.evaluate(() => window.iceAgeGame.skipToEnd())).toBe(false);
  });
});
