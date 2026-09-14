/* THE PROGRESS PANEL: its proportions, its entrance, and the editor that tunes it.
 *
 * Nothing covered this before, and it is the part of the HUD that has been broken the
 * most often — by a border-width that silently fell back to 3px, by a card that grew
 * until it read as a poster, by an editor whose defaults drifted away from the
 * stylesheet's. Every one of those was invisible to the suite and visible to the player.
 *
 * The measurements are taken against the CARD, as percentages of it, because that is how
 * the reference layout specifies them — so these assertions stay true at any stage width
 * and say nothing about the machine they run on. */
import { test, expect } from '@playwright/test';
import { boot } from './helpers.mjs';

test.setTimeout(240000);

const MARKER_X = [11.8, 20.2, 28.5, 36.9, 45.3, 53.7, 62.1, 70.4, 78.8];
const BEAR_X = 87.4;
const SIZES = [[844, 390], [1280, 720], [1600, 900], [1920, 1080], [2560, 1440]];

const probe = () => {
  const stage = document.querySelector('#stage') || document.querySelector('.stage');
  const card = document.querySelector('.trail-card');
  if (!card) return { err: 'no card' };
  const cr = card.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const pct = r => +(((r.left + r.width / 2 - cr.left) / cr.width) * 100).toFixed(2);
  const nodes = [...document.querySelectorAll('.trail-rail .level-node')]
    .map(n => pct(n.getBoundingClientRect()));
  const bearEl = document.querySelector('.bear-destination');
  const stone = document.querySelector('.trail-rail .level-node');
  let worst = 0;
  for (const el of document.querySelectorAll('.level-node, .bear-destination, .journey-lane')) {
    const r = el.getBoundingClientRect();
    if (r.width) worst = Math.max(worst, cr.left - r.left, r.right - cr.right);
  }
  return {
    stageW: +sr.width.toFixed(1),
    w: +cr.width.toFixed(1), h: +cr.height.toFixed(1),
    pctW: +((cr.width / sr.width) * 100).toFixed(2),
    aspect: +(cr.width / cr.height).toFixed(3),
    nodes,
    bear: bearEl ? pct(bearEl.getBoundingClientRect()) : null,
    stoneW: stone ? +((stone.getBoundingClientRect().width / cr.width) * 100).toFixed(2) : null,
    overflow: +worst.toFixed(1)
  };
};

test('panel holds its proportions at every stage width', async ({ page }) => {
  await boot(page);
  await page.waitForTimeout(1500);
  // the arrival whoosh is transform-based; let it settle so rects are the real box
  await page.evaluate(() => { document.querySelector('.trail-card').style.animation = 'none'; });

  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(350);
    const m = await page.evaluate(probe);
    console.log(`\n--- ${w}x${h} --- ` + JSON.stringify(m));

    expect(m.err, `${w}x${h}`).toBeUndefined();
    expect(m.aspect, `aspect @${w}`).toBeCloseTo(1362 / 464, 1);
    expect(m.pctW, `width share @${w}`).toBeCloseTo(24, 1);
    expect(m.nodes.length, `node count @${w}`).toBe(9);
    m.nodes.forEach((x, i) =>
      expect(Math.abs(x - MARKER_X[i]), `node ${i} @${w} was ${x}`).toBeLessThan(0.35));
    expect(Math.abs(m.bear - BEAR_X), `bear @${w} was ${m.bear}`).toBeLessThan(0.5);
    expect(m.stoneW, `stone @${w}`).toBeCloseTo(6.2, 1);
    expect(m.overflow, `overflow @${w}`).toBeLessThanOrEqual(0.6);
  }
});

test('the whoosh fires on arrival and on departure', async ({ page }) => {
  await boot(page);
  await page.waitForTimeout(1200);
  const inAnim = await page.evaluate(() => ({
    card: getComputedStyle(document.querySelector('.trail-card')).animationName,
    puff: getComputedStyle(document.querySelector('.trail-card'), '::before').animationName,
    puffOpacityAtRest: getComputedStyle(document.querySelector('.trail-card'), '::before').opacity
  }));
  console.log('arrive ->', JSON.stringify(inAnim));
  expect(inAnim.card).toContain('cardWhooshIn');
  expect(inAnim.puff).toContain('snowPuff');

  await page.evaluate(() => document.querySelector('.trail').classList.add('away'));
  await page.waitForTimeout(80);
  const outAnim = await page.evaluate(() => ({
    card: getComputedStyle(document.querySelector('.trail-card')).animationName,
    puff: getComputedStyle(document.querySelector('.trail-card'), '::before').animationName
  }));
  console.log('depart ->', JSON.stringify(outAnim));
  expect(outAnim.card).toContain('cardWhooshOut');
  expect(outAnim.puff).toContain('snowPuff');

  // and it comes back when the question goes, rather than firing only once
  await page.evaluate(() => document.querySelector('.trail').classList.remove('away'));
  await page.waitForTimeout(80);
  const again = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.trail-card')).animationName);
  console.log('return ->', again);
  expect(again).toContain('cardWhooshIn');
});

/* The editor's defaults must BE the stylesheet's defaults: it writes them as inline
   custom properties, so if any one has drifted the panel jumps the moment ?panel=1 is
   on, and Reset makes that permanent. */
test('the panel editor opens without moving anything', async ({ page }) => {
  await boot(page);
  await page.waitForTimeout(1200);
  // the entrance is transform-based and would skew the rects; stop it first
  await page.evaluate(() => { document.querySelector('.trail-card').style.animation = 'none'; });
  const before = await page.evaluate(probe);

  await boot(page, { query: 'panel=1' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.querySelector('.trail-card').style.animation = 'none'; });

  const open = await page.evaluate(() => !!document.querySelector('.trail').dataset.editor);
  console.log('editor attached:', open);
  expect(open, 'the editor loaded under ?panel=1').toBe(true);

  const after = await page.evaluate(probe);
  console.log('before:', JSON.stringify(before.nodes), before.bear, before.stoneW, before.aspect);
  console.log('after: ', JSON.stringify(after.nodes), after.bear, after.stoneW, after.aspect);

  expect(after.pctW, 'card width').toBeCloseTo(before.pctW, 1);
  expect(after.aspect, 'the frame is not stretched').toBeCloseTo(before.aspect, 2);
  after.nodes.forEach((x, i) =>
    expect(Math.abs(x - before.nodes[i]), `node ${i}`).toBeLessThan(0.35));
  expect(Math.abs(after.bear - before.bear), 'bear').toBeLessThan(0.35);
  expect(after.stoneW, 'stone').toBeCloseTo(before.stoneW, 1);

  /* and every value it writes is one the stylesheet reads. This is the check that would
     have caught --ph, --safe-x and the rest going stale: they were still being written
     long after the last rule that read them was deleted. */
  const unread = await page.evaluate(() => {
    const el = document.querySelector('.trail');
    const written = [...el.style].filter(p => p.startsWith('--'));
    const sheet = [...document.styleSheets]
      .flatMap(s => { try { return [...s.cssRules]; } catch { return []; } })
      .map(r => r.cssText).join('\n');
    return written.filter(p => !sheet.includes('var(' + p));
  });
  console.log('written but never read:', JSON.stringify(unread));
  expect(unread, 'the editor writes variables the CSS does not read').toEqual([]);
});
