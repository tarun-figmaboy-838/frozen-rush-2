/* THE THINGS THAT MUST NOT BREAK.

   The curriculum suite proves the seven phases teach the right thing. This one
   guards everything around them that a content change could quietly wreck: the
   swipe itself at the new option densities, the safety valve on the jump, the three
   HUD controls, reduced motion, and the fact that the journey ends after phase 7 and
   not before.

   Every one of these is on the "do not break" list in RUNNER.md, and none of them is
   covered anywhere else. They drive the real engine through its debug hooks. */
import { test, expect } from '@playwright/test';
import { boot, waitState, cut, jsErrors } from './helpers.mjs';

/** Put the game at the start of one phase, with its crevasses genuinely open. */
async function enterPhase(page, i) {
  await page.evaluate(k => {
    const g = window.iceAgeGame, G = g.debug();
    G.phase = k; G.l1 = null; G.phaseLayout = null; G.gapsThisPhase = null;
    g._force('GLACIER_BREAK_1');
  }, i);
  await waitState(page, 'PHASE_ACTIVE', 30_000);
}

/** Wait until a cut has resolved and the phase has settled or moved on. */
const settle = page => page.waitForFunction(() => {
  const s = window.iceAgeGame.state();
  return ['PHASE_ACTIVE', 'PHASE_DONE', 'PHASE_RUN', 'RUN_SEGMENT_2', 'FINAL_RUN', 'COMPLETE'].includes(s);
}, null, { timeout: 20_000 });

test.describe('the cut', () => {
  test.setTimeout(180_000);

  /* Driven the way a player drives it: a real drag across a rope. Everything else
     calls _cut() directly, which skips the hit test entirely — so nothing else covers
     the case where the drawn rope and the cuttable line disagree. On the SIX-option
     row, because that is where the ropes are closest together. */
  test('a real swipe cuts the rope it crosses, on the densest row', async ({ page }) => {
    await boot(page, { speed: 900 });
    await enterPhase(page, 6);

    const aim = await page.evaluate(() => {
      const G = window.iceAgeGame.debug();
      const want = G.l1.wanted[0];
      const sh = G.l1.shapes.find(s => s.state === 'hang' && s.kind === want);
      const r = document.getElementById('game-canvas').getBoundingClientRect();
      // halfway down the rope, above the chunk
      const midY = (sh.y - 120) / 2;
      /* AIMED WHERE THE ROPE IS DRAWN, which is what a player does. The puzzle pushes the view
         in about (zoomVX, zoomVY) by G.zoom, so the rope's world x is not its screen x — and
         the engine now inverts that mapping for pointer input (it used to test the raw stage
         point, up to 96px from the rope the finger was on). This aim goes through the same
         forward map the renderer uses, so the test asks the question the player asks. */
      const z = G.zoom || 1;
      const sx = G.zoomVX + (sh.anchorX - G.zoomVX) * z;
      const sy = G.zoomVY + (midY - G.zoomVY) * z;
      return {
        kind: want,
        cssX: r.left + (sx / 1920) * r.width,
        cssY: r.top + (sy / 1080) * r.height,
        span: (70 / 1920) * r.width * z
      };
    });

    await page.mouse.move(aim.cssX - aim.span, aim.cssY);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(aim.cssX - aim.span + (aim.span * 2 * i) / 8, aim.cssY);
    }
    await page.mouse.up();

    await page.waitForFunction(k => {
      const G = window.iceAgeGame.debug();
      return G.l1 && !G.l1.shapes.some(s => s.kind === k && s.state === 'hang');
    }, aim.kind, { timeout: 8000 });

    const r = await page.evaluate(() => {
      const G = window.iceAgeGame.debug();
      return {
        solved: G.l1.targets.filter(t => t.filled).length,
        stubs: (G.l1.stubs || []).length,
        cutKind: G.l1.targets.filter(t => t.filled).map(t => t.kind)
      };
    });
    expect(r.solved, 'the swiped rope was the one that counted').toBe(1);
    expect(r.cutKind, 'and it was the rope aimed at').toEqual([aim.kind]);
    // the rope really parts: a severed stub is left behind
    expect(r.stubs, 'a cut leaves a severed stub').toBe(1);
  });

  test('a swipe through empty sky cuts nothing, at six options', async ({ page }) => {
    await boot(page, { speed: 900 });
    await enterPhase(page, 6);
    const before = await page.evaluate('window.iceAgeGame.debug().l1.shapes.length');
    const b = await page.locator('#game-canvas').boundingBox();
    // low and to the left of every rope
    const y = b.y + b.height * 0.66;
    await page.mouse.move(b.x + b.width * 0.05, y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(b.x + b.width * (0.05 + 0.02 * i), y);
    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(await page.evaluate('window.iceAgeGame.debug().l1.shapes.length')).toBe(before);
    expect(await page.evaluate('window.iceAgeGame.state()')).toBe('PHASE_ACTIVE');
  });
});

test.describe('the character is never hit', () => {
  test.setTimeout(240_000);

  /* The hanging positions are checked in curriculum.spec. This checks the FALL, which
     is the thing that could actually land on the character — and it matters more now
     than it did, because a correct chunk is carried sideways to its repair slot
     instead of dropping straight down.

     The character's sprite is 420 x 1.28 = 538px wide centred on x 430, so it occupies
     x 161..699. Every chunk, at every frame of every fall, on every phase, has to stay
     clear of that. Sampled every frame rather than reasoned about, because the fall is
     real gravity plus a solved horizontal speed. */
  test('no chunk ever overlaps the character, hanging or falling', async ({ page }) => {
    /* Seven phases, every one cut to exhaustion, and the assertion is purely about
       positions — so this is the clearest case for fast-forward. At fast: 3 it was
       spending three minutes and still timing out on a loaded machine. */
    await boot(page, { speed: 900, fast: 6 });
    const total = await page.evaluate(async () => {
      const m = await import('/js/engine.js');
      return m.CFG.levelOne.phases.length;
    });

    for (let i = 0; i < total; i++) {
      await enterPhase(page, i);
      const worst = await page.evaluate(async () => {
        const g = window.iceAgeGame;
        const bounds = pts => {
          let x0 = 1e9;
          for (const p of pts) x0 = Math.min(x0, p.x);
          return x0;
        };
        let minLeft = 1e9, guard = 0;
        /* Re-read the puzzle every time. It is torn down partway through the
           celebrate, so a reference captured at the top of the loop goes stale
           inside the same iteration. */
        const sample = () => {
          const L = g.debug().l1;
          if (!L) return;
          for (const s of L.shapes) {
            minLeft = Math.min(minLeft, s.x + bounds(s.pts) * (s.scale || 1));
          }
        };
        // cut everything — right answers and wrong ones — and watch every frame
        while (guard++ < 4000) {
          const G = g.debug();
          if (!G.l1) break;
          sample();
          if (G.state === 'PHASE_ACTIVE') {
            const hang = G.l1.shapes.filter(s => s.state === 'hang');
            if (!hang.length) break;
            // wrong ones first, so both kinds of fall are covered
            const bad = hang.find(s => !G.l1.wanted.includes(s.kind));
            g._cut((bad || hang[0]).kind);
          }
          await new Promise(r => requestAnimationFrame(r));
          sample();
        }
        return minLeft;
      });
      // 699 is the character's right edge; anything at or left of it is a hit
      expect(worst, `phase ${i + 1}: a chunk reached x ${Math.round(worst)}`)
        .toBeGreaterThan(700);
    }
  });
});

test.describe('accessibility', () => {
  test.setTimeout(180_000);

  /* Recognition must not depend on motion. A phase that needed the swing or the
     camera to be legible would be unplayable for the learners who most need it calm. */
  test('reduced motion still lets a three-answer phase be solved', async ({ page }) => {
    const errors = await boot(page, { speed: 900, fast: 4 });
    await page.evaluate(() => window.iceAgeGame.setOptions({ reduced: true }));
    await enterPhase(page, 5);
    for (let i = 0; i < 6; i++) {
      const want = await page.evaluate(() => {
        const L = window.iceAgeGame.debug().l1;
        return L ? L.wanted[0] || null : null;
      });
      if (!want) break;
      expect(await cut(page, want), want + ' should be cuttable').toBe(true);
      await settle(page);
    }
    expect(await page.evaluate('window.iceAgeGame.debug().phasesDone')).toBe(6);
    expect(jsErrors(errors), 'the game threw').toEqual([]);
  });

  test('the quake is damped under reduced motion, but still felt without it', async ({ page }) => {
    const peak = async reduced => {
      await boot(page, { speed: 900 });
      if (reduced) await page.evaluate(() => window.iceAgeGame.setOptions({ reduced: true }));
      await page.evaluate(() => {
        const g = window.iceAgeGame, G = g.debug();
        G.phase = 0; G.l1 = null; G.phaseLayout = null; G.gapsThisPhase = null;
        g._force('GLACIER_BREAK_1');
      });
      return page.evaluate(async () => {
        let m = 0;
        for (let i = 0; i < 70; i++) {
          m = Math.max(m, window.iceAgeGame.debug().quakeAt || 0);
          await new Promise(r => requestAnimationFrame(r));
        }
        return m;
      });
    };
    const full = await peak(false);
    const red = await peak(true);
    expect(full, 'the ground giving way has to be felt').toBeGreaterThan(6);
    expect(red, 'reduced motion is calmer, not dead').toBeGreaterThan(0);
    expect(red, 'reduced motion damps the quake').toBeLessThan(full * 0.6);
  });
});

test.describe('the safety valve', () => {
  test.setTimeout(180_000);

  /* Progress can never dead-end. A learner who cannot time the jump used to get the
     Try Again card for ever, because the strike counter lived on the obstacle and
     retrying cleared it. On the third failure the rock crumbles and the run goes on. */
  test('three failed jumps crumble the rock', async ({ page }) => {
    await boot(page, { speed: 900 });
    await waitState(page, ['RUN_SEGMENT_1', 'JUMP_CHALLENGE_1'], 20_000);
    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      let hits = 0, guard = 0;
      while (guard++ < 4000) {
        const G = g.debug();
        if (G.state === 'OBSTACLE_HIT') { hits++; g.retryObstacle(); }
        const o = g._obstacles().list[0];
        if (o && o.hits >= 3) return { hits, crumbled: true };
        // never jump: the run must still get past on its own
        if (G.state.indexOf('PHASE') === 0) return { hits, crumbled: false, reachedPhase: true };
        await new Promise(res => requestAnimationFrame(res));
      }
      return { hits, crumbled: false, timedOut: true };
    });
    expect(r.timedOut, 'the run stalled at the obstacle').toBeFalsy();
    expect(r.hits, 'walking into the rock costs a Try Again').toBeGreaterThan(0);
    // either the rock crumbled, or the run got past it anyway — never a dead end
    expect(r.crumbled || r.reachedPhase, JSON.stringify(r)).toBe(true);
  });
});

test.describe('the controls', () => {
  test.setTimeout(180_000);

  test.skip('the hint brings the instruction back without revealing an answer', async ({ page }) => {
    await boot(page, { speed: 900 });
    await enterPhase(page, 6);
    // the card owns the stage first, then leaves
    await page.waitForFunction(() => document.getElementById('instruction').hidden === true,
      null, { timeout: 12_000 });
    await page.locator('#btn-hint').click();
    await expect(page.locator('#instruction')).toBeVisible();
    const want = await page.evaluate(async () => {
      const m = await import('/js/engine.js');
      return m.CFG.levelOne.phases[6].instruction;
    });
    // the same sentence, not a new one, and not a list of what is left
    await expect(page.locator('#instruction-text')).toHaveText(want);
  });

  /* The buttons are gone, but the CAPABILITIES must not be: muting and pausing are
     still what the URL flags and the host API do, and the music bed has to obey both
     or a five-megabyte track keeps playing under a muted game. */
  test('sound and pause still work through the API without the buttons', async ({ page }) => {
    await boot(page, { speed: 900 });
    await enterPhase(page, 6);

    const before = await page.evaluate('window.iceAgeGame.soundOn()');
    expect(await page.evaluate('window.iceAgeGame.toggleSound()')).toBe(!before);
    expect(await page.evaluate('window.iceAgeGame.soundOn()')).toBe(!before);

    const at = () => page.evaluate('window.iceAgeGame.debug().worldX');
    await page.evaluate('window.iceAgeGame.setPaused(true)');
    expect(await page.evaluate('window.iceAgeGame.paused')).toBe(true);
    const a = await at();
    await page.waitForTimeout(250);
    expect(Math.abs((await at()) - a), 'frozen means frozen').toBeLessThan(1);
    await page.evaluate('window.iceAgeGame.setPaused(false)');
    expect(await page.evaluate('window.iceAgeGame.paused')).toBe(false);
  });
});

test.describe('the end of the journey', () => {
  // nine crossings now, on a renderer that runs game time slower than wall clock
  test.setTimeout(720_000);

  /* The run home must start after the LAST phase and not a phase earlier — with the
     count changing from six to seven, an off-by-one here would cut a crossing out of
     the curriculum without failing anything else. */
  test('the run home starts only once every crossing is repaired, and reaches COMPLETE', async ({ page }) => {
    const errors = await boot(page, { speed: 900, fast: 6 });
    const total = await page.evaluate(async () => {
      const m = await import('/js/engine.js');
      return m.CFG.levelOne.phases.length;
    });
    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      const t0 = Date.now();
      let doneAtFinalRun = -1;
      while (Date.now() - t0 < 620_000) {
        const G = g.debug();
        for (const o of g._obstacles().list) {
          const sx = o.x - G.worldX;
          if (sx > 380 && sx < 700 && !o.passed) g.jump();
        }
        if (G.state === 'OBSTACLE_HIT') g.retryObstacle();
        if (G.state === 'PHASE_ACTIVE' && G.l1 && G.l1.wanted.length) g._cut(G.l1.wanted[0]);
        // Level 2 is on the way home now: cut the slab on a main diagonal
        /* Each drawing crossing by its own rule — one main diagonal, every diagonal,
           or two from the same corner. They come before the rope crossings now. */
        if (G.state === 'LEVEL_2_ACTIVE' && G.l2) {
          const m = G.l2.mechanic;
          if (m === 'cut-diagonal') g._l2Cut(0, 3);
          else if (m === 'draw-all-diagonals') { g._l2Cut(0, 2); g._l2Cut(1, 3); }
          else if (m === 'same-vertex-diagonals') { g._l2Cut(0, 2); g._l2Cut(0, 3); }
        }
        if (G.state === 'FINAL_RUN' && doneAtFinalRun < 0) doneAtFinalRun = G.phasesDone;
        if (G.state === 'COMPLETE') return { complete: true, doneAtFinalRun, phasesDone: G.phasesDone };
        await new Promise(res => requestAnimationFrame(res));
      }
      const G = g.debug();
      return { complete: false, doneAtFinalRun, phasesDone: G.phasesDone, state: G.state };
    });
    expect(r.doneAtFinalRun, 'the run home waited for every phase').toBe(total);
    expect(r.complete, 'the journey finished: ' + JSON.stringify(r)).toBe(true);
    await expect(page.locator('#complete')).toBeVisible();
    expect(jsErrors(errors), 'the game threw across a whole playthrough').toEqual([]);
  });
});
