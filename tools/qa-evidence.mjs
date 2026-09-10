/* CAPTURE THE EVIDENCE for the QA report.
 *
 * Every "after" frame is the game as it stands. Every "before" frame is produced by
 * reverting exactly one thing at runtime — a single constant or class — so the pair is a
 * genuine comparison and not a redrawing of a claim.
 *
 *     node tools/qa-evidence.mjs
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 8241;
const OUT = 'qa-report';
mkdirSync(OUT, { recursive: true });

const srv = spawn('node', ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch();

const url = q => `http://127.0.0.1:${PORT}/index.html?${q}`;
const READY = 'window.iceAgeGame && window.iceAgeGame.state() !== "BOOT"';

async function fresh(q = 'skip=1&sound=0&fast=8') {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(url(q));
  await page.waitForFunction(READY, null, { timeout: 90000 });
  return page;
}

/** Drive to a playable phase, jumping anything in the way. */
const toPhase = (page, target) => page.evaluate(async t => {
  const g = window.iceAgeGame;
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const G = g.debug();
    for (const o of g._obstacles().list) {
      const sx = o.x - G.worldX;
      if (sx > 380 && sx < 700 && !o.passed) g.jump();
    }
    if (G.state === 'OBSTACLE_HIT') g.retryObstacle();
    if (G.state === 'PHASE_ACTIVE' && G.phase === t) return;
    if (G.state === 'PHASE_ACTIVE' && G.phase < t && G.l1) g._cut(G.l1.unfilled[0]);
    await new Promise(r => requestAnimationFrame(r));
  }
}, target);

/** Answer the phase and freeze the frame the crossing completes on. */
const mendAndFreeze = page => page.evaluate(async () => {
  const g = window.iceAgeGame;
  let guard = 0;
  while (guard++ < 600) {
    const G = g.debug();
    if (!G.l1) break;
    if (G.state === 'PHASE_ACTIVE' && G.l1.unfilled.length) g._cut(G.l1.unfilled[0]);
    if (G.state === 'PHASE_DONE') break;
    await new Promise(r => requestAnimationFrame(r));
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) {
    const gaps = g.debug().gapsThisPhase || [];
    if (gaps.length && gaps.every(x => x.bridge >= 1)) break;
    await new Promise(r => requestAnimationFrame(r));
  }
  g.setPaused(true);
});

const CROSSING = { x: 850, y: 800, width: 760, height: 280 };
const shots = [];
async function shot(page, name, clip) {
  await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });
  shots.push(name);
  console.log('  ' + name);
}

/* ── 1. THE PLUG: grown-and-clipped vs whole ─────────────────────────────── */
console.log('\n1. the seated answer');
{
  // BEFORE: revert the two things that broke it — grow the plug to fill the slot width,
  // and clip it at the water line, exactly as the shipped build did.
  const page = await fresh();
  await page.evaluate(() => {
    const g = window.iceAgeGame;
    g.__patchPlug = true;
    const G = g.debug();
    // hook the piece list: rescale each plug the old way as soon as it is created
    setInterval(() => {
      for (const gp of g._ground().gaps) {
        for (const p of (gp.pieces || [])) {
          if (p.__old) continue;
          p.__old = true;
          let w = 0, h = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
          for (const q of p.pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
          w = x1 - x0; h = y1 - y0;
          p.fit = ((p.x1 - p.x0) * 0.99) / w;      // the old slot-width scale
        }
      }
    }, 16);
  });
  await toPhase(page, 0);
  await mendAndFreeze(page);
  await shot(page, '1a-plug-before', CROSSING);
  await page.close();
}
{
  const page = await fresh();
  await toPhase(page, 0);
  await mendAndFreeze(page);
  await shot(page, '1b-plug-after', CROSSING);
  await page.close();
}

/* ── 2. MULTI-ANSWER: one crevasse vs two ────────────────────────────────── */
console.log('\n2. three answers');
{
  const page = await fresh();
  await page.evaluate(async () => {
    const m = await import('/js/engine.js');
    m.CFG.levelOne.phases[6].ditches = 1;      // as it shipped
  });
  await toPhase(page, 6);
  await mendAndFreeze(page);
  await shot(page, '2a-multi-before', { x: 850, y: 790, width: 1010, height: 290 });
  await page.close();
}
{
  const page = await fresh();
  await toPhase(page, 6);
  await mendAndFreeze(page);
  await shot(page, '2b-multi-after', { x: 850, y: 790, width: 1010, height: 290 });
  await page.close();
}

/* ── 3. THE CREVASSE, open ───────────────────────────────────────────────── */
console.log('\n3. the open crevasse');
{
  const page = await fresh();
  await toPhase(page, 0);
  await page.evaluate(() => window.iceAgeGame.setPaused(true));
  await shot(page, '3-crevasse', { x: 850, y: 790, width: 780, height: 290 });
  await shot(page, '3-full-phase');
  await page.close();
}

/* ── 4. THE PLAY BUTTON: inherited keyline vs its own family ─────────────── */
console.log('\n4. the PLAY button on hover');
for (const [name, revert] of [['4a-play-before', true], ['4b-play-after', false]]) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(url('sound=0'));
  await page.waitForFunction(READY, null, { timeout: 90000 });
  if (revert) await page.evaluate(() => document.getElementById('btn-play').classList.add('btn-chunky'));
  const b = await page.locator('#btn-play').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(260);
  await shot(page, name, { x: Math.round(b.x - 70), y: Math.round(b.y - 60), width: Math.round(b.width + 140), height: Math.round(b.height + 120) });
  await page.close();
}

/* ── 5. THE ROCK: flat 6px sink vs proportional ──────────────────────────── */
console.log('\n5. the rock');
for (const [name, ratio] of [['5a-rock-before', 6 / 230], ['5b-rock-after', null]]) {
  const page = await fresh('skip=1&sound=0&fast=4');
  if (ratio !== null) await page.evaluate(async r => {
    const m = await import('/js/engine.js');
    m.CFG.obstacle.sinkRatio = r;
  }, ratio);
  const at = await page.evaluate(async () => {
    const g = window.iceAgeGame;
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      const G = g.debug();
      const o = g._obstacles().list[0];
      if (o) { const sx = o.x - G.worldX; if (sx < 1150 && sx > 950) { g.setPaused(true); return Math.round(sx); } }
      await new Promise(r => requestAnimationFrame(r));
    }
    return null;
  });
  await shot(page, name, { x: Math.max(0, at - 230), y: 640, width: 460, height: 300 });
  await page.close();
}

/* ── 6. UNDER THE SHELF: flat background vs sea ──────────────────────────── */
console.log('\n6. below the shelf');
for (const [name, kill] of [['6a-shelf-before', true], ['6b-shelf-after', false]]) {
  const page = await fresh('skip=1&sound=0');
  if (kill) await page.evaluate(() => { window.iceAgeGame._ground().drawDeepWater = function () {}; });
  await page.waitForTimeout(700);
  await shot(page, name, { x: 0, y: 950, width: 1920, height: 130 });
  await page.close();
}

/* ── 7. THE OUCH CARD ────────────────────────────────────────────────────── */
console.log('\n7. the Ouch card');
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(url('sound=0'));
  await page.waitForFunction(READY, null, { timeout: 90000 });
  await page.locator('#btn-play').click({ force: true });
  await page.evaluate(async () => {
    const g = window.iceAgeGame;
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) { if (g.debug().oops) return; await new Promise(r => requestAnimationFrame(r)); }
  });
  await page.waitForTimeout(700);
  await shot(page, '7-ouch-card', { x: 620, y: 200, width: 680, height: 680 });
  await page.close();
}

console.log('\nwrote ' + shots.length + ' frames to ' + OUT + '/');
await browser.close();
srv.kill();
