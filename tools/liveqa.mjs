/* LIVE QA — play the whole game and measure it.
 *
 * Not a pass/fail suite. This plays a real playthrough at real speed, records every
 * state it passes through and how long it held, watches for long frames, dead input,
 * arrays that only grow, and console noise — then prints it. The point is to find the
 * things a unit test cannot phrase: buffering, stalls, dead air, and getting stuck.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const PORT = 8225;
const srv = spawn('node', ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1400));
const browser = await chromium.launch();

const VIEWPORTS = [
  { width: 1920, height: 1080, name: 'desktop' },
  { width: 844, height: 390, name: 'phone-landscape' }
];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('requestfailed', r => errs.push('requestfailed: ' + r.url().split('/').pop()));

  console.log('\n' + '='.repeat(74));
  console.log('  ' + vp.name + '   ' + vp.width + 'x' + vp.height);
  console.log('='.repeat(74));

  // ---- cold start, measured ----
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/index.html?sound=0`);
  await page.waitForFunction('window.iceAgeGame && window.iceAgeGame.state() !== "BOOT"',
    null, { timeout: 120000 });
  const boot = Date.now() - t0;
  const weight = await page.evaluate(() => {
    const e = performance.getEntriesByType('resource');
    let bytes = 0, n = 0;
    for (const r of e) { bytes += r.transferSize || r.encodedBodySize || 0; n++; }
    return { bytes, n, dom: Math.round(performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart) };
  });
  console.log(`\nCOLD START`);
  console.log(`  playable after      ${boot} ms`);
  console.log(`  requests            ${weight.n}   ${(weight.bytes / 1048576).toFixed(2)} MB transferred`);
  console.log(`  blank-screen window ${boot} ms (nothing is drawn until the art set is in)`);

  // ---- play the whole thing at real speed, instrumented ----
  const run = await page.evaluate(async () => {
    const g = window.iceAgeGame;
    g.setOptions({ fast: 3 });          // 3x game time; every duration still relative
    const trail = [];
    const frames = [];
    let last = '', lastAt = performance.now(), lastFrame = performance.now();
    let deadTaps = 0, cuts = 0, wrongs = 0, jumps = 0, retries = 0;
    // Part 2 is drawn, not cut: its own counter, and a throttle so the drags can play out
    let l2cuts = 0, lastL2 = -999;
    const growth = [];
    const t0 = Date.now();

    // click PLAY if the cover is up
    const play = document.getElementById('btn-play');
    if (play && !document.getElementById('cover').hidden) play.click();

    while (Date.now() - t0 < 240000) {
      const now = performance.now();
      frames.push(now - lastFrame); lastFrame = now;

      const G = g.debug();
      if (G.state !== last) {
        if (last) trail.push({ s: last, ms: Math.round(now - lastAt), phase: G.phase });
        last = G.state; lastAt = now;
      }

      // clear obstacles the way a player would
      for (const o of g._obstacles().list) {
        const sx = o.x - G.worldX;
        if (sx > 380 && sx < 700 && !o.passed) { g.jump(); jumps++; }
      }
      if (G.state === 'OBSTACLE_HIT') { g.retryObstacle(); retries++; }

      // solve: one wrong answer per phase, then the right ones
      if (G.state === 'PHASE_ACTIVE' && G.l1) {
        const bad = G.l1.shapes.find(s => s.state === 'hang' && !G.l1.unfilled.includes(s.kind));
        if (bad && !G.l1.__triedBad) { G.l1.__triedBad = true; g._cut(bad.kind); wrongs++; }
        else if (G.l1.unfilled.length) { g._cut(G.l1.unfilled[0]); cuts++; }
      }

      /* AND PART 2, WHICH THIS COULD NOT PLAY AT ALL.
       *
       * The loop above is the whole of what it knew: g._cut(kind), the rope crossings'
       * mechanic. Part 2 is drawn diagonals, so the moment the game reached LEVEL_2 the
       * bot had nothing to do and sat there until the clock ran out — a run reported as
       * "0 / 7 crossings, 0 cuts, 87.7% of the time in LEVEL_2_ACTIVE", which reads like
       * the game is stuck when it is the tool that is.
       *
       * A diagonal is any pair of corners that are not neighbours. Trying them in order
       * satisfies all three crossings without knowing which is which: crossing 1 wants
       * one, crossing 2 wants every one, and crossing 3 wants two that share a corner —
       * so where the level has already fixed an origin, its diagonals are tried first.
       * Refusals are the level's own rules talking and are counted as wrong answers.
       *
       * Throttled, because these are drags with animations behind them: firing every
       * frame would queue hundreds of them and measure nothing real. */
      if (/^LEVEL_2/.test(G.state) && typeof g._l2Cut === 'function' && typeof g._l2 === 'function') {
        const L = g._l2();
        if (L && L.corners && L.corners.length >= 4 && !L.fall && !L.seated && !L.locked
            && frames.length - lastL2 > 24) {
          lastL2 = frames.length;
          const n = L.corners.length;
          const diags = [];
          for (let i = 0; i < n; i++) {
            for (let j = i + 2; j < n; j++) if (!(i === 0 && j === n - 1)) diags.push([i, j]);
          }
          /* LONGEST FIRST, AND NEVER ONE ALREADY DRAWN.
             Trying them in index order meant offering short diagonals to crossing 1,
             which only takes a main one — 122 refusals in a run, each of which drops the
             slab, plays the wrong-answer beat and grows a new one, so the bot spent the
             clock being told no. Ordering by span puts corner-to-opposite-corner first,
             which is what every crossing here will take; skipping what is on the slab
             already is what crossing 2 needs to finish. */
          const o = L.origin;
          const drawn = new Set(L.drawn || []);
          const span = d => Math.min(d[1] - d[0], n - (d[1] - d[0]));
          const order = diags
            .filter(d => !drawn.has(d[0] + '-' + d[1]))
            .sort((a, b) => span(b) - span(a));
          // where the level has fixed an origin, its diagonals go first: same-vertex wants that
          if (o !== undefined && o !== null) {
            order.sort((a, b) => ((b[0] === o || b[1] === o) ? 1 : 0) - ((a[0] === o || a[1] === o) ? 1 : 0));
          }
          for (const [i, j] of order) {
            const took = g._l2Cut(i, j);
            if (took) { l2cuts++; break; }
            if (took === false) { wrongs++; break; }   // the level refused it: that is an answer
          }
        }
      }

      // arrays that only ever grow are the leak signature
      if (frames.length % 120 === 0) {
        growth.push({
          particles: g._player().particles.list.length,
          gaps: g._ground().gaps.length,
          stubs: G.l1 && G.l1.stubs ? G.l1.stubs.length : 0,
          pieces: g._ground().gaps.reduce((a, x) => a + ((x.pieces || []).length), 0),
          splashes: g._ground().gaps.reduce((a, x) => a + ((x.splashes || []).length), 0)
        });
      }

      if (G.state === 'COMPLETE') break;
      await new Promise(r => requestAnimationFrame(r));
    }
    const G = g.debug();
    if (last) trail.push({ s: last, ms: Math.round(performance.now() - lastAt), phase: G.phase });
    frames.sort((a, b) => a - b);
    const at = q => +frames[Math.floor(frames.length * q)].toFixed(1);
    return {
      finished: G.state === 'COMPLETE',
      state: G.state, phasesDone: G.phasesDone,
      wallMs: Date.now() - t0,
      trail, cuts, wrongs, jumps, retries, deadTaps, l2cuts,
      frame: { p50: at(0.5), p90: at(0.9), p99: at(0.99), worst: +frames[frames.length - 1].toFixed(1) },
      longFrames: frames.filter(f => f > 100).length,
      growth: growth.slice(-1)[0], growthFirst: growth[0]
    };
  });

  console.log(`\nPLAYTHROUGH  (fast=3, so wall clock is a third of game time)`);
  console.log(`  reached              ${run.state}${run.finished ? '  — finished' : '  — DID NOT FINISH'}`);
  console.log(`  crossings repaired   ${run.phasesDone} / 7`);
  console.log(`  cuts ${run.cuts}   diagonals drawn ${run.l2cuts}   wrong answers ${run.wrongs}   jumps ${run.jumps}   retries ${run.retries}`);
  console.log(`  wall clock           ${(run.wallMs / 1000).toFixed(1)} s  (~${(run.wallMs * 3 / 1000).toFixed(0)} s of game time)`);

  console.log(`\nFRAME TIME`);
  console.log(`  p50 ${run.frame.p50} ms   p90 ${run.frame.p90} ms   p99 ${run.frame.p99} ms   worst ${run.frame.worst} ms`);
  console.log(`  frames over 100ms    ${run.longFrames}  ${run.longFrames ? '<-- visible stalls' : '(none)'}`);

  console.log(`\nWHERE THE TIME WENT  (game time, summed per state)`);
  const byState = {};
  for (const t of run.trail) byState[t.s] = (byState[t.s] || 0) + t.ms * 3;
  const total = Object.values(byState).reduce((a, b) => a + b, 0);
  const interactive = ['PHASE_ACTIVE', 'JUMP_CHALLENGE_1'];
  let inter = 0;
  Object.entries(byState).sort((a, b) => b[1] - a[1]).forEach(([s, ms]) => {
    if (interactive.includes(s)) inter += ms;
    const pct = (ms / total * 100).toFixed(1);
    console.log(`  ${s.padEnd(20)} ${(ms / 1000).toFixed(1).padStart(6)} s  ${pct.padStart(5)}%` +
      (interactive.includes(s) ? '   <- the player can act' : ''));
  });
  console.log(`  ${'—'.repeat(46)}`);
  console.log(`  INTERACTIVE          ${(inter / 1000).toFixed(1)} s of ${(total / 1000).toFixed(1)} s = ${(inter / total * 100).toFixed(0)}%`);

  console.log(`\nARRAYS  (first sample -> last; a number that only climbs is a leak)`);
  if (run.growthFirst && run.growth) {
    for (const k of Object.keys(run.growth)) {
      const a = run.growthFirst[k], b = run.growth[k];
      console.log(`  ${k.padEnd(12)} ${String(a).padStart(4)} -> ${String(b).padStart(4)}${b > a * 3 && b > 20 ? '   <-- GROWING' : ''}`);
    }
  }

  console.log(`\nERRORS`);
  const uniq = [...new Set(errs)];
  console.log(uniq.length ? uniq.map(e => '  ' + e).join('\n') : '  none');

  await page.close();
}

await browser.close();
srv.kill();
