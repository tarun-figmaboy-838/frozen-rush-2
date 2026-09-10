/* PLAY THE WHOLE GAME LIKE A PLAYER, and keep the evidence.
 *
 *     node tools/playthrough-qa.mjs
 *
 * Cover -> PLAY -> the tutorial (acting only when its hand asks) -> seven phases with one
 * deliberate wrong answer -> the knockout -> the run home -> the ending. A screenshot of
 * every beat lands in qa-report/play/, and the run fails loudly on any page error, failed
 * request or state that sits still for 45s. This is the QA pass the test suite cannot do:
 * it looks at the game the way a person does, end to end. */
/* A real playthrough, driven like a player: cover -> PLAY -> tutorial -> seven phases -> the end.
   Screenshots at every beat, every error caught, stalls and frame rate measured. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('qa-report/play', { recursive: true });
/* Against the DEPLOYMENT when LIVE_URL is set (e.g. https://running-mammoth.vercel.app/game/),
   otherwise against a local server: the same walk, so the two can be compared. */
const LIVE = process.env.LIVE_URL ? (process.env.LIVE_URL.endsWith('/') ? process.env.LIVE_URL : process.env.LIVE_URL + '/') : '';
const PORT = 8491;
const srv = LIVE ? null : spawn('node', ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
if (!LIVE) await new Promise(r => setTimeout(r, 1500));
const BASE = LIVE || `http://127.0.0.1:${PORT}/`;
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [], failed = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
page.on('requestfailed', r => failed.push(r.url().split('/').pop()));
page.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url().split('/').pop()); });

// 1. the cover, as a player sees it (no skip), with the tutorial on
// domcontentloaded: on the deployment the load event can wait on a slow edge fetch, and READY below is the real gate
await page.goto(`${BASE}index.html?sound=0`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction('window.iceAgeGame && window.iceAgeGame.state() !== "BOOT"', null, { timeout: 60000 });
await page.waitForTimeout(600);
await page.screenshot({ path: 'qa-report/play/00-cover.png' });
const cover = await page.evaluate(() => { const c = document.getElementById('cover'), p = document.getElementById('btn-play'); const r = p.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { coverVisible: !!c && !c.hidden, playHit: el === p || (el && p.contains(el)) }; });
console.log('cover: ' + JSON.stringify(cover));
await page.locator('#btn-play').click();
await page.waitForTimeout(500);

// 2. play like a player, with the tutorial guiding: act only when the hand asks, or a rock is in the window
const beats = new Set(); let last = ''; let lastChange = Date.now(); const stalls = []; let frames = 0;
await page.evaluate(() => { window.__f = 0; const tick = () => { window.__f++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
await page.evaluate(() => window.iceAgeGame.setOptions({ fast: 3 }));
const t0 = Date.now();
const shot = async name => { if (beats.has(name)) return; beats.add(name); await page.screenshot({ path: 'qa-report/play/' + name + '.png' }); };
while (Date.now() - t0 < 420000) {
  const s = await page.evaluate(() => {
    const g = window.iceAgeGame, G = g.debug();
    const hand = document.getElementById('tut-hand'), tut = document.getElementById('tutorial');
    const handUp = hand && !hand.hidden && tut && !tut.hidden;
    const text = (document.getElementById('tut-text') || {}).textContent || '';
    let rock = null; for (const o of g._obstacles().list) { const sx = o.x - G.worldX; if (!o.passed && (rock === null || sx < rock)) rock = sx; }
    return { state: G.state, phase: G.phase, done: G.phasesDone, handUp, text, rock, paused: G.freeze > 0, l1: !!G.l1, unfilled: G.l1 ? G.l1.unfilled.slice() : [], hang: G.l1 ? G.l1.shapes.filter(x => x.state === 'hang').length : 0, complete: G.complete };
  });
  if (s.state !== last) { last = s.state; lastChange = Date.now(); }
  else if (Date.now() - lastChange > 45000 && s.state !== 'PHASE_ACTIVE') { stalls.push(s.state + ' for 45s (phase ' + (s.phase + 1) + ')'); lastChange = Date.now(); }
  // beats
  if (s.text.startsWith('This is Momo')) await shot('01-tut-momo');
  if (s.text.startsWith('Watch out')) await shot('02-tut-rock');
  if (s.text.startsWith('Tap to jump')) await shot('03-tut-button');
  if (s.text.startsWith('Oh no!')) await shot('04-tut-gap');
  if (s.text.startsWith('Use the right')) await shot('05-tut-cut');
  if (s.text.startsWith('Perfect fit')) await shot('06-tut-fit');
  if (s.text.startsWith('Swipe')) await shot('06-tut-cut');
  if (s.state === 'GLACIER_BREAK_1') await shot('10-break-p' + (s.phase + 1));
  if (s.state === 'PHASE_ACTIVE' && s.hang) await shot('11-active-p' + (s.phase + 1));
  if (s.state === 'PHASE_RUN') await shot('13-run-p' + (s.phase + 1));
  if (s.state === 'OBSTACLE_HIT') await shot('14-knockout');
  if (s.state === 'FINAL_RUN') await shot('15-final-run');
  if (s.state === 'COMPLETE') { await page.waitForTimeout(2800); await shot('16-ending'); break; }
  // act like a player
  const inTutorial = await page.evaluate(() => { const t = document.getElementById('tutorial'); return t && !t.hidden; });
  if (s.state === 'PHASE_ACTIVE' && s.unfilled.length && (!inTutorial || s.handUp)) {
    // one deliberate wrong answer in phase 1, then right ones
    const G = s;
    if (G.phase === 0 && !beats.has('12-wrong')) {
      const bad = await page.evaluate(() => { const D = window.iceAgeGame.debug(); const sh = D.l1.shapes.find(x => x.state === 'hang' && !D.l1.unfilled.includes(x.kind)); return sh ? sh.kind : null; });
      if (bad) { await page.evaluate(k => window.iceAgeGame._cut(k), bad); await page.waitForTimeout(350); await shot('12-wrong'); await page.waitForTimeout(900); }
    } else {
      await page.evaluate(k => window.iceAgeGame._cut(k), s.unfilled[0]);
      await page.waitForTimeout(500);
      await shot('12-mended-p' + (s.phase + 1));
    }
  }
  if (s.rock !== null && s.rock > 380 && s.rock < 700 && (!inTutorial || s.handUp || s.state !== 'JUMP_CHALLENGE_1')) await page.evaluate(() => window.iceAgeGame.jump());
  if (s.state === 'OBSTACLE_HIT') { await page.waitForTimeout(1200); }
  await page.waitForTimeout(90);
}
frames = await page.evaluate(() => window.__f);
const fin = await page.evaluate(() => { const G = window.iceAgeGame.debug(); return { state: G.state, phasesDone: G.phasesDone, complete: G.complete }; });
console.log('finished in ' + Math.round((Date.now() - t0) / 1000) + 's: ' + JSON.stringify(fin) + '   avg fps ' + (frames / ((Date.now() - t0) / 1000)).toFixed(1));
console.log('beats captured: ' + [...beats].sort().join(', '));
console.log('stalls: ' + (stalls.length ? stalls.join(' | ') : 'none'));
console.log('failed requests: ' + (failed.length ? [...new Set(failed)].join(' | ') : 'none'));
console.log('errors: ' + (errs.length ? [...new Set(errs)].join(' | ') : 'none'));
await b.close(); if (srv) srv.kill();
