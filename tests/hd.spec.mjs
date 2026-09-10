/* THE HI-DPI PATH.
 *
 * The canvas renders at renderScale x 1920x1080 (up to 2x) and the character sheets come in
 * two sets — the base 420x320 cell and the same cell at 1.5x — chosen once at boot from that
 * scale. These tests hold the contract: a plain screen is exactly what it always was; a
 * forced ?rs=2 doubles the backbuffer and loads the hd set at its expected geometry, with
 * the character the same size on stage; a real 2x device picks the path on its own. */
import { test, expect } from '@playwright/test';
import { boot } from './helpers.mjs';

const STATE = () => ({
  rs: window.iceAgeGame.renderScale(),
  set: window.iceAgeGame.artSet(),
  w: document.getElementById('game-canvas').width,
  h: document.getElementById('game-canvas').height,
  run: window.iceAgeGame.sheetFor(window.iceAgeGame.character(), 'run')
});

test.describe('the hi-DPI path', () => {
  test.setTimeout(120_000);

  test('a plain screen renders 1:1 on the base set', async ({ page }) => {
    const errors = await boot(page);
    const s = await page.evaluate(STATE);
    expect(s.rs).toBe(1);
    expect(s.set).toBe('base');
    expect([s.w, s.h]).toEqual([1920, 1080]);
    expect([s.run.cw, s.run.ch, s.run.cols]).toEqual([420, 320, 6]);
    expect(errors).toEqual([]);
  });

  test('?rs=2 doubles the backbuffer and loads the hd sheets at 1.5x cells', async ({ page }) => {
    const errors = await boot(page, { query: 'rs=2' });
    const s = await page.evaluate(STATE);
    expect(s.rs).toBe(2);
    expect(s.set).toBe('hd');
    expect([s.w, s.h]).toEqual([3840, 2160]);
    expect([s.run.cw, s.run.ch, s.run.cols]).toEqual([630, 480, 6]);
    expect(s.run.src).toContain('/assets/char/hd/');
    // the hd sheet really is the six-column grid at the bigger cell
    const dims = await page.evaluate(async src => {
      const img = new Image(); img.src = src; await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, s.run.src);
    expect(dims).toEqual([630 * 6, 480 * 6]);
    expect(errors).toEqual([]);
  });

  test('the character is the same size on stage from either set', async ({ page }) => {
    /* Measured on the real backbuffer, in layout pixels, on ONE deterministic pose: the
       game is paused, the character is put on trample frame 8 with every transient
       (squash, lean, breath...) zeroed, and one frame is drawn. Sampling live frames was
       tried and is not deterministic — a headless runner at 3840x2160 draws so few
       frames that the run cycle's extremes are never reached. cellK divides the sprite
       scale, so the two sets must agree to a few pixels. */
    const measure = async query => {
      await boot(page, { query });
      return page.evaluate(() => {
        const g = window.iceAgeGame;
        g.setPaused(true);
        const p = g._player();
        p.setState('LOOK_DOWN'); p.t = 0.6;
        Object.assign(p, { squash: 1, wobSq: 0, wobX: 0, wobRot: 0, lean: 0, knock: 0, tilt: 0, breath: 0, gulp: 0 });
        g._renderOnce();
        const c = document.getElementById('game-canvas');
        const k = c.width / 1920;
        const x0 = Math.round(220 * k), x1 = Math.round(640 * k), y0 = Math.round(280 * k), y1 = Math.round(700 * k);
        const W = x1 - x0;
        const d = c.getContext('2d').getImageData(x0, y0, W, y1 - y0).data;
        let top = -1, bottom = -1, left = W, right = -1;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], gg = d[i + 1], b = d[i + 2];
          // the mammoth is brown against sky and snow: warm, dark-ish, red well over blue
          if (r > b + 40 && r < 200 && gg < 150 && d[i + 3] > 200) {
            const px = (i / 4) % W, py = Math.floor(i / 4 / W);
            if (top < 0) top = py; bottom = py;
            if (px < left) left = px; if (px > right) right = px;
          }
        }
        return { frame: g.mammothFrame(), h: (bottom - top) / k, w: (right - left) / k, top: top / k, left: left / k };
      });
    };
    const a = await measure('rs=1');
    const b = await measure('rs=2');
    expect(a.frame, 'the pose is the settle he waits on').toContain('tremble:');
    expect(a.frame).toBe(b.frame);
    /* 4%, not a pixel or two: the hd silhouette is resolved twice as finely, so its
       anti-aliased rim passes the colour test a pixel further out on each side (measured:
       324 vs 330.5 wide). A wrong cellK would be off by 50%, which this still catches. */
    expect(a.h, 'a character was measured').toBeGreaterThan(150);
    expect(Math.abs(a.h - b.h), `height ${a.h} vs ${b.h}`).toBeLessThan(a.h * 0.04);
    expect(Math.abs(a.w - b.w), `width ${a.w} vs ${b.w}`).toBeLessThan(a.w * 0.04);
    expect(Math.abs(a.top - b.top), `top ${a.top} vs ${b.top}`).toBeLessThan(8);
    expect(Math.abs(a.left - b.left), `left ${a.left} vs ${b.left}`).toBeLessThan(8);
  });
});

test.describe('a 3x phone', () => {
  /* Dense enough to qualify for the hd set by scale alone — and the one place it must not
     go: a small device that could not decode the big sheets was left with no character at
     all. The stage is under 1000 CSS px wide, so it keeps the base set at a sharper canvas. */
  test.use({ viewport: { width: 932, height: 430 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  test('keeps the base set on a sharper canvas', async ({ page }) => {
    const errors = await boot(page);
    const s = await page.evaluate(STATE);
    expect(s.rs).toBeGreaterThan(1);
    expect(s.set).toBe('base');
    expect(s.run.src).not.toContain('/hd/');
    expect(errors).toEqual([]);
  });
});

test.describe('a 2x device', () => {
  test.use({ deviceScaleFactor: 2, viewport: { width: 1280, height: 720 } });
  test('picks a bigger backbuffer and the hd set on its own', async ({ page }) => {
    const errors = await boot(page);
    const s = await page.evaluate(STATE);
    // a 1280-wide stage at 2x is 2560 device pixels: 1.33 of the 1920 layout, rounded to 1.25
    expect(s.rs).toBeGreaterThan(1);
    expect(s.set).toBe('hd');
    expect(s.w).toBe(Math.round(1920 * s.rs));
    expect(errors).toEqual([]);
  });
});
