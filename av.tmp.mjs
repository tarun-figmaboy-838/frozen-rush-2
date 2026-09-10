import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.goto('http://127.0.0.1:8181/index.html?skip=1&sound=0&tutorial=0');
await p.waitForFunction('window.iceAgeGame && window.iceAgeGame.state() !== "BOOT"', null, { timeout: 60000 });
const r = await p.evaluate(async () => {
  const g = window.iceAgeGame;
  const trail = [], t0 = Date.now(); let last = ''; let sawWall = false, maxT = 0;
  while (Date.now() - t0 < 25000) {
    const G = g.debug();
    if (G.state !== last) { trail.push(G.state); last = G.state; }
    if (G.state === 'AVALANCHE') { sawWall = true; maxT = Math.max(maxT, G.avT || 0); }
    if (G.state === 'JUMP_CHALLENGE_1') break;
    await new Promise(r => requestAnimationFrame(r));
  }
  return { trail, sawWall, maxT: +maxT.toFixed(2) };
});
console.log('errors:', errs.length ? errs.slice(0,3) : 'none');
console.log('opened with avalanche:', r.sawWall, '| avT reached', r.maxT);
console.log('trail:', r.trail.join(' -> '));
await b.close();
