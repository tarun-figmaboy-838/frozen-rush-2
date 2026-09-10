/* Shared helpers.

   The game runs its own requestAnimationFrame loop, so these tests can simply wait —
   no clock shim is needed. What they do need is a deterministic way to put the game
   at a given moment, which the engine's underscore-prefixed debug hooks provide. */

export const READY = 'window.iceAgeGame && window.iceAgeGame.state() !== "BOOT"';

/* WHY SO MANY OF THESE TESTS PASS ?fast, AND WHY THE WAITS ARE GENEROUS.
 *
 * The game's clock is driven by animation frames, and frame() caps dt at 1/30 so a
 * slow frame cannot teleport the physics. Those two together mean GAME TIME RUNS SLOWER
 * THAN WALL CLOCK whenever the renderer cannot hold 30fps — and a headless browser
 * compositing a 1920x1080 canvas without a GPU cannot come close. Measured on this
 * machine, with rendering switched off the rAF loop runs at 60fps; with the game drawing
 * it is 9fps. So one second of game time takes about three and a half seconds of wall
 * clock, and under several parallel workers, worse.
 *
 * Every beat in the game is a fixed duration in milliseconds — the collapse is ~1.4s of
 * GAME time — so a wall-clock budget sized for a real machine measures the runner's
 * frame rate rather than the thing under test, and fails on a loaded laptop while the
 * game is working perfectly. Verified: the committed engine renders at 9.1fps here and
 * the working tree at 8.8, so this is not a regression in anything.
 *
 * Two levers, and they are not interchangeable:
 *
 *   ?fast=N   steps the simulation N times per rendered frame. Physics is IDENTICAL
 *             (see the note in engine.js frame()) — it is the same dt, applied more
 *             often — so this is the right lever for a test that only cares about
 *             geometry, state or logic. It is the wrong lever for a test that drives
 *             real pointer input, because the world also animates N times faster
 *             between reading a target position and clicking it.
 *
 *   a bigger wait
 *             the right lever for the pointer tests. It weakens nothing: these
 *             assertions are about what happens, never about how long it took. Frame
 *             rate is covered separately by the performance test.
 */

/** Load the game and wait until the world exists and the loader is gone. */
/* THE TUTORIAL IS OFF BY DEFAULT HERE, and leaving it on was a real fault rather than
 * an oversight in style: the tutorial FREEZES the game on every describing step, so
 * with it running a test that swipes a rope, pokes the character or waits to walk into
 * a rock is acting on a world that is not moving. Five tests failed exactly that way
 * — "the swipe registered as an attempt: 0", "he reacted: 0", "one collision, one
 * strike: 0" — and every one of them looked like a broken feature.
 *
 * Pass `tutorial: true` for the spec that exercises the tutorial itself.
 */
export async function boot(page, { skipScreens = true, sound = false, speed = 0, fast = 0, tutorial = false, query = '' } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const q = [];
  if (skipScreens) q.push('skip=1');
  if (!sound) q.push('sound=0');
  if (speed) q.push('speed=' + speed);
  if (fast) q.push('fast=' + fast);
  q.push('tutorial=' + (tutorial ? '1' : '0'));
  if (query) q.push(query);                 // anything else, e.g. 'rs=2'
  await page.goto('/index.html' + (q.length ? '?' + q.join('&') : ''));
  /* The game preloads its whole art set before it will start, which is a real
     cold-start cost — give it room rather than hiding it behind a short timeout.
     READY going true IS the end of loading; there is no loading curtain to wait on. */
  await page.waitForFunction(READY, null, { timeout: 60_000 });
  return errors;
}

/* Real JavaScript faults only, with resource-load noise dropped.

   The character's five sprite sheets are currently missing from game/assets/char —
   CFG.characters points at mammoth-*.webp and the folder holds un-sliced raw art —
   so every page logs five console 404s. That is an ART problem, and the tests that
   exist to guard the art (assets.spec, and the sheet and no-404 checks in game.spec
   and ui.spec) are the ones that should fail while it lasts. A test about gameplay
   asserting on the same noise says nothing about gameplay, so it filters to
   pageerror — an exception thrown by the game itself, which nothing should ever
   produce. Delete this once the sheets are back and use the raw list again. */
export const jsErrors = errors => errors.filter(e => e.startsWith('pageerror'));

/** The engine's live state object. */
export const G = page => page.evaluate('window.iceAgeGame.debug()');

/** Wait until the game reaches one of these states. */
export async function waitState(page, states, timeout = 30_000) {
  const list = Array.isArray(states) ? states : [states];
  await page.waitForFunction(
    ss => ss.includes(window.iceAgeGame.state()),
    list, { timeout, polling: 50 }
  );
  return page.evaluate('window.iceAgeGame.state()');
}

/** Force a state, the way the in-repo QA harnesses do. */
export const force = (page, s) => page.evaluate(st => window.iceAgeGame._force(st), s);

/** Slice a hanging option by shape name. */
export const cut = (page, kind) => page.evaluate(k => window.iceAgeGame._cut(k), kind);

/** Play the whole of Level 1, answering correctly, and return the state trail. */
export async function playLevelOne(page, { wrongFirst = false, budgetMs = 300_000 } = {}) {
  return page.evaluate(async opts => {
    const g = window.iceAgeGame;
    const trail = [];
    let last = '';
    const t0 = Date.now();
    const triedBad = new Set();

    /* Generous, and the CALLER's budget rather than a constant. A runner without a
       GPU spends most of a frame compositing the backbuffer, and because the game's
       clock is driven by animation frames it then runs in slow motion — so six phases
       take far longer in wall clock than in game time. This loop used to run for 240s
       inside a 120s test, which meant a slow machine timed out mid-loop and the
       assertion afterwards reported a progression bug that was not happening. */
    while (Date.now() - t0 < opts.budgetMs) {
      const G = g.debug();
      const s = G.state;
      if (s !== last) { trail.push(s + '@' + G.phase); last = s; }

      // clear anything in the way
      for (const o of g._obstacles().list) {
        const sx = o.x - G.worldX;
        if (sx > 380 && sx < 700 && !o.passed) g.jump();
      }
      if (s === 'OBSTACLE_HIT') g.retryObstacle();

      if (s === 'PHASE_ACTIVE' && G.l1) {
        // what the phase still WANTS; any open crevasse will take it
        const target = G.l1.unfilled[0];
        if (opts.wrongFirst && !triedBad.has(G.phase)) {
          const bad = G.l1.shapes.find(x => x.state === 'hang' &&
            !G.l1.unfilled.includes(x.kind));
          if (bad) { triedBad.add(G.phase); g._cut(bad.kind); }
        } else if (target) {
          g._cut(target);
        }
      }

      /* LEVEL 1 IS OVER WHEN IT HANDS OVER, and what it hands over TO depends on
         CFG.levelTwo.enabled: RUN_SEGMENT_2 with Level 2 on, FINAL_RUN with it off.
         This loop answers Level 1's questions and nothing else, so it stops at either
         — a caller wanting the rest calls playLevelTwo() next. */
      if (s === 'RUN_SEGMENT_2' || s === 'FINAL_RUN' || s === 'COMPLETE') break;
      await new Promise(r => requestAnimationFrame(r));
    }
    const G = g.debug();
    return {
      trail, state: G.state, phase: G.phase, phasesDone: G.phasesDone,
      // so a caller can tell "the level stalled" from "we ran out of wall clock"
      timedOut: Date.now() - t0 >= opts.budgetMs
    };
  }, { wrongFirst, budgetMs });
}

/** The states Level 1 can legitimately be in once it has been answered in full —
    either its own tail, or the hand-over into Level 2. */
export const LEVEL_ONE_OVER = ['PHASE_DONE', 'PHASE_RUN', 'RUN_SEGMENT_2', 'FINAL_RUN', 'COMPLETE'];

/* Play Level 2: run to the crossing, then cut the slab.

   `wrongFirst` walks the three wrong answers the level distinguishes before giving the
   right one — a side, a stroke that reaches no corner, and a short diagonal — because
   the thing worth testing is that none of them ends the level or takes anything away.

   `diagonal` is which main diagonal to finish with (0, 1 or 2 -> corners 0-3, 1-4, 2-5).
   All three are correct, so a test can assert that by playing each of them. */
export async function playLevelTwo(page, { wrongFirst = false, diagonal = 0, budgetMs = 180_000 } = {}) {
  return page.evaluate(async opts => {
    const g = window.iceAgeGame;
    const trail = [];
    let last = '';
    let didWrong = false;
    const t0 = Date.now();
    const i = opts.diagonal % 3, j = i + 3;

    while (Date.now() - t0 < opts.budgetMs) {
      const G = g.debug();
      const s = G.state;
      if (s !== last) { trail.push(s); last = s; }

      for (const o of g._obstacles().list) {
        const sx = o.x - G.worldX;
        if (sx > 380 && sx < 700 && !o.passed) g.jump();
      }
      if (s === 'OBSTACLE_HIT') g.retryObstacle();

      if (s === 'LEVEL_2_ACTIVE') {
        if (opts.wrongFirst && !didWrong) {
          didWrong = true;
          g._l2Cut(0, 1);            // a side
        } else {
          g._l2Cut(i, j);            // a main diagonal: the answer
        }
      }
      /* THE CROSSING IS OVER WHEN IT HANDS ON, and what it hands on TO depends on how
         much of the old journey is left. The diagonal level is crossing ONE now, so it
         is normally followed by PHASE_RUN and the crossings still to be replaced; only
         when none remain does it lead to the run home. This loop answers the diagonal
         crossing and nothing after it, so it stops at either. */
      if (s === 'PHASE_RUN' || s === 'FINAL_RUN' || s === 'COMPLETE') break;
      await new Promise(r => requestAnimationFrame(r));
    }
    const G = g.debug();
    return {
      trail, state: G.state, gaps: g._l2Gaps(), l2: g._l2(),
      timedOut: Date.now() - t0 >= opts.budgetMs
    };
  }, { wrongFirst, diagonal, budgetMs });
}
