/* THE DEVICE MATRIX. Boots the game at every shape and pixel density that matters, plays a
   little, and measures: the stage and backbuffer geometry, the art set chosen, JS heap, frame
   cost, console errors, whether anything is clipped or off-stage, and what the portrait path
   does. Prints one row per device plus a verdict, and writes a screenshot for each.

   node device-matrix.mjs [--live] */
import { chromium, devices } from '@playwright/test';

const LIVE = process.argv.includes('--live');
const BASE = LIVE ? 'https://running-mammoth.vercel.app/game' : 'http://127.0.0.1:8181';
const OUT = 'C:/Users/hptec/Downloads/running-mammoth/qa-report/';
const READY = 'window.iceAgeGame && window.iceAgeGame.state() !== "BOOT"';

/* name, viewport, dpr, touch — the shapes real players have. */
const MATRIX = [
  ['desktop-1080',      { width: 1920, height: 1080 }, 1, false],
  ['desktop-1080-dpr2', { width: 1920, height: 1080 }, 2, false],
  ['desktop-4k-dpr2',   { width: 3840, height: 2160 }, 2, false],
  ['laptop-1366',       { width: 1366, height: 768 },  1, false],
  ['laptop-1280x800',   { width: 1280, height: 800 },  2, false],
  ['ipad-landscape',    { width: 1024, height: 768 },  2, true],
  ['ipad-portrait',     { width: 768, height: 1024 },  2, true],
  ['phone-844x390',     { width: 844, height: 390 },   3, true],
  ['phone-small-667',   { width: 667, height: 375 },   2, true],
  ['phone-tiny-568',    { width: 568, height: 320 },   2, true],
  ['phone-tall-932',    { width: 932, height: 430 },   3, true],
  ['phone-portrait',    { width: 390, height: 844 },   3, true],
  ['fold-narrow',       { width: 653, height: 280 },   3, true],
  ['ultrawide',         { width: 3440, height: 1440 }, 1, false]
];

const rows = [];
const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] });

for (const [name, viewport, dpr, touch] of MATRIX) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120)); });
  page.on('requestfailed', r => { if (!/favicon/.test(r.url())) errors.push('failed: ' + r.url().split('/').pop().slice(0, 40)); });
  const row = { name, viewport: viewport.width + 'x' + viewport.height, dpr };
  try {
    await page.goto(BASE + '/index.html?skip=1&sound=0&tutorial=0', { timeout: 90000 });
    await page.waitForFunction(READY, null, { timeout: 90000 });

    /* geometry, art set, heap */
    Object.assign(row, await page.evaluate(() => {
      const g = window.iceAgeGame, c = document.getElementById('game-canvas');
      const st = document.getElementById('stage').getBoundingClientRect();
      const doc = document.documentElement.getBoundingClientRect();
      const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
      const rot = document.getElementById('rotate');
      const sheets = g.roster ? g.roster().flatMap(ch => ['run', 'jump', 'skid', 'hurt', 'idle', 'tremble']
        .map(s => g.sheetFor(ch.id, s)).filter(Boolean).map(s => s.src.split('/').slice(-2).join('/'))) : [];
      return {
        stage: Math.round(st.width) + 'x' + Math.round(st.height),
        stageAR: +(st.width / st.height).toFixed(3),
        canvas: c.width + 'x' + c.height,
        canvasMpx: +(c.width * c.height / 1e6).toFixed(2),
        maxSide: Math.max(c.width, c.height),
        rs: +(c.width / 1920).toFixed(2),
        hd: sheets.some(s => s.startsWith('hd/')),
        heapMB: mem,
        rotateShown: !!(rot && !rot.hidden),
        overflowX: Math.round(document.documentElement.scrollWidth - doc.width),
        overflowY: Math.round(document.documentElement.scrollHeight - doc.height)
      };
    }));

    /* play: run, crash, reach a puzzle, cut — and time the frames while it happens */
    const play = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      const raf = () => new Promise(r => requestAnimationFrame(r));
      const stamps = [];
      let last = performance.now();
      const t0 = Date.now();
      g._force('GLACIER_BREAK_1');
      while (Date.now() - t0 < 12000) {
        await raf();
        const now = performance.now(); stamps.push(now - last); last = now;
        if (g.debug().state === 'PHASE_ACTIVE' && g.debug().l1 && g.debug().l1.shapes.some(s => s.state === 'hang' && s.y > 400)) break;
      }
      const st = g.debug();
      if (st.state === 'PHASE_ACTIVE' && st.l1) g._cut(st.l1.unfilled[0]);
      const t1 = Date.now();
      while (Date.now() - t1 < 2500) { await raf(); const now = performance.now(); stamps.push(now - last); last = now; }
      stamps.sort((a, b) => a - b);
      const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
      return { state: g.debug().state, medianMs: +stamps[stamps.length >> 1].toFixed(1),
               p95Ms: +stamps[Math.floor(stamps.length * 0.95)].toFixed(1), frames: stamps.length,
               heapAfterMB: mem, particles: g._particles ? g._particles().list.length : null };
    });
    Object.assign(row, play);

    /* is anything drawn outside the stage, and do the controls fit a thumb? */
    Object.assign(row, await page.evaluate(() => {
      const st = document.getElementById('stage').getBoundingClientRect();
      const bad = [];
      /* No control to measure any more: the JUMP button is gone and the stage itself is
         the jump. What this pass still catches is anything DRAWN outside the stage. */
      for (const el of document.querySelectorAll('#hud *, .overlay:not([hidden]) *')) {
        if (el.hidden || !el.getClientRects().length) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (r.left < st.left - 2 || r.right > st.right + 2 || r.top < st.top - 2 || r.bottom > st.bottom + 2) {
          bad.push((el.id || el.className || el.tagName).toString().slice(0, 26));
        }
      }
      return { offStage: [...new Set(bad)].slice(0, 6).join(',') };
    }));

    row.errors = errors.length ? errors.slice(0, 3).join(' | ') : '';
    await page.screenshot({ path: OUT + 'dev-' + name + '.png' });
  } catch (e) {
    row.fatal = String(e.message).split('\n')[0].slice(0, 120);
    row.errors = errors.slice(0, 3).join(' | ');
  }
  rows.push(row);
  console.log(JSON.stringify(row));
  await ctx.close();
}
await browser.close();

/* ---- the verdict ---- */
console.log('\n== VERDICT ==');
const problems = [];
for (const r of rows) {
  if (r.fatal) problems.push(`${r.name}: FATAL ${r.fatal}`);
  if (r.errors) problems.push(`${r.name}: ${r.errors}`);
  if (r.canvasMpx > 16.7) problems.push(`${r.name}: backbuffer ${r.canvas} = ${r.canvasMpx}Mpx (past the 16.7Mpx mobile limit)`);
  if (r.maxSide > 4096) problems.push(`${r.name}: backbuffer side ${r.maxSide} px (past a common 4096 texture limit)`);
  if (r.overflowX > 2) problems.push(`${r.name}: the page scrolls sideways by ${r.overflowX}px`);
  if (r.offStage) problems.push(`${r.name}: drawn outside the stage: ${r.offStage}`);
  if (r.p95Ms > 60) problems.push(`${r.name}: p95 frame ${r.p95Ms}ms`);
  if (r.heapAfterMB && r.heapAfterMB > 420) problems.push(`${r.name}: heap ${r.heapAfterMB}MB`);
  if (!/portrait/.test(r.name) && r.rotateShown) problems.push(`${r.name}: the rotate screen is up in landscape`);
  if (/^phone-portrait|ipad-portrait/.test(r.name) && !r.rotateShown) problems.push(`${r.name}: no rotate prompt in portrait`);
  if (r.stageAR && Math.abs(r.stageAR - 16 / 9) > 0.02) problems.push(`${r.name}: stage aspect ${r.stageAR}, not 16:9`);
}
console.log(problems.length ? problems.map(p => ' - ' + p).join('\n') : ' nothing flagged');
console.log('\nheap MB:', rows.map(r => `${r.name} ${r.heapMB}->${r.heapAfterMB}`).join(' | '));
