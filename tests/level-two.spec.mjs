/* LEVEL 2 — "Cut the shape along its diagonal."
 *
 * The level asks WHERE to cut rather than WHICH to cut, so what these hold is the
 * rule: a diagonal joins two corners that are not next to each other, a side does
 * not, and only a cut that goes right across leaves two halves that can each bridge
 * a hole. Everything else here is the same set of promises Level 1 is held to — a
 * wrong answer takes nothing away, the crossing cannot be jumped, the answer lands
 * at the size it was cut, and the level completes.
 *
 * Most of these drive the level through `_l2Cut(i, j)`, which is the corner-index
 * form of the drag and goes through the same attemptCut() a finger does. The pointer
 * itself is exercised separately, at the bottom, because a gesture test also has to
 * be right about where the corners are on screen — a different question from whether
 * the rule is right.
 */
import { test, expect } from '@playwright/test';
import { boot, G, waitState, jsErrors, playLevelTwo } from './helpers.mjs';

/** Put the game at the start of Level 2's puzzle, without playing Level 1 first. */
async function enterLevelTwo(page) {
  await page.evaluate(() => {
    const g = window.iceAgeGame, G = g.debug();
    // every crossing behind us, exactly as PHASE_DONE would leave it
    G.phase = 7; G.phasesDone = 7; G.l1 = null; G.gapsThisPhase = null;
    g._force('GLACIER_BREAK_2');
  });
  await waitState(page, ['LEVEL_2_ACTIVE'], 60_000);
  return G(page);
}

test.describe('Level 2 — the shape and its holes', () => {
  test.setTimeout(180_000);

  test('two crevasses open, each cut to the half that will bridge it', async ({ page }) => {
    const errors = await boot(page, { speed: 900, fast: 4 });
    await enterLevelTwo(page);
    const r = await page.evaluate(() => ({
      gaps: window.iceAgeGame._l2Gaps(),
      cfg: window.iceAgeGame.debug().l2
    }));
    expect(r.gaps.filter(Boolean).length, 'two crevasses').toBe(2);
    const [a, b] = r.gaps;
    expect(a.w, 'both holes are the same size — the halves are congruent').toBe(b.w);

    /* UNJUMPABLE. The same floor Level 1's crevasses are held to: under 400px and a
       leap carries it, which would make the puzzle optional. */
    expect(a.w, 'too wide to jump').toBeGreaterThan(400);

    /* AND BOTH ON THE STAGE. Two holes plus the pillar between them is the widest
       thing this layout ever builds, and it has to fit between the character and the
       right edge or the far one is off screen. */
    const G0 = await G(page);
    expect(b.x1 - G0.worldX, 'the far lip is on a 1920 stage').toBeLessThan(1920);
    expect(a.x0 - G0.worldX, 'the near lip is clear of the character').toBeGreaterThan(700);
  });

  test('the slab is a hexagon, and every one of its corners is shown', async ({ page }) => {
    const errors = await boot(page, { speed: 900, fast: 4 });
    await enterLevelTwo(page);
    const l2 = await page.evaluate(() => window.iceAgeGame._l2());
    expect(l2, 'the slab exists').not.toBeNull();
    expect(l2.corners.length, 'six corners').toBe(6);
    /* NO CORNER IS SINGLED OUT. There are three right answers and the level must not
       hand one over, so the corners are all drawn the same — nothing in the state
       marks one of them as the one to use. */
    expect(l2.cut, 'nothing is cut yet').toBeNull();
    expect(l2.dragFrom, 'no corner is pre-selected').toBe(-1);
    expect(jsErrors(errors), 'the game threw').toEqual([]);
  });

  test('the slab comes to the middle of the stage while the question is up', async ({ page }) => {
    await boot(page, { speed: 900, fast: 4 });
    await enterLevelTwo(page);
    const l2 = await page.evaluate(() => window.iceAgeGame._l2());
    // the focus animation has run: it is bigger than it was, and centred
    expect(l2.focusT, 'the focus finished').toBeGreaterThan(0.98);
    expect(l2.scale, 'and it grew').toBeGreaterThan(1.1);
    expect(Math.abs(l2.pos.x - 960), 'centred across the stage').toBeLessThan(40);
  });
});

test.describe('Level 2 — what counts as a diagonal', () => {
  test.setTimeout(180_000);

  /* THE RULE, as pure geometry, with no level running. A diagonal joins two corners
     that are not adjacent; of a hexagon's diagonals only the three that go right
     across leave two halves that can each bridge a hole (see CFG.levelTwo). */
  test('only the three main diagonals are accepted', async ({ page }) => {
    await boot(page);
    const table = await page.evaluate(() => {
      const g = window.iceAgeGame, out = [];
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) out.push([i, j, g._l2Accepts(i, j)]);
      return out;
    });
    const accepted = table.filter(([, , ok]) => ok).map(([i, j]) => [i, j].sort().join('-'));
    expect([...new Set(accepted)].sort(), 'exactly 0-3, 1-4 and 2-5')
      .toEqual(['0-3', '1-4', '2-5']);
    // and the six sides are all refused
    for (let i = 0; i < 6; i++) {
      expect(table.find(([a, b]) => a === i && b === (i + 1) % 6)[2],
        `side ${i}-${(i + 1) % 6} is not a diagonal`).toBe(false);
    }
    // as is a corner joined to itself
    for (let i = 0; i < 6; i++) {
      expect(table.find(([a, b]) => a === i && b === i)[2], 'a corner is not a cut').toBe(false);
    }
  });

  test('a side is refused, and is told it is a side', async ({ page }) => {
    const errors = await boot(page, { speed: 900, fast: 4 });
    await enterLevelTwo(page);
    await page.evaluate(() => window.iceAgeGame._l2Cut(0, 1));
    const after = await page.evaluate(() => ({
      state: window.iceAgeGame.state(),
      l2: window.iceAgeGame._l2(),
      sign: window.iceAgeGame.debug().signSay
    }));
    expect(after.state).toBe('LEVEL_2_WRONG_FEEDBACK');
    expect(after.l2.pieces, 'nothing was cut').toBe(0);
    expect(after.l2.badLine, 'the mark says which mistake').toBe('side');
    expect(after.sign.toLowerCase(), 'and so does the sentence').toContain('side');
    expect(jsErrors(errors), 'the game threw').toEqual([]);
  });

  /* A SHORT DIAGONAL IS NOT CALLED WRONG. It IS a diagonal — the learner has
     understood the idea — it just leaves a piece too tall to bridge. So it gets its
     own nudge, and the nudge must not use the word "side": saying that would unteach
     the thing they just got right. */
  test('a short diagonal is nudged, not called a side', async ({ page }) => {
    await boot(page, { speed: 900, fast: 4 });
    await enterLevelTwo(page);
    await page.evaluate(() => window.iceAgeGame._l2Cut(0, 2));
    const after = await page.evaluate(() => ({
      state: window.iceAgeGame.state(),
      l2: window.iceAgeGame._l2(),
      sign: window.iceAgeGame.debug().signSay
    }));
    expect(after.state).toBe('LEVEL_2_WRONG_FEEDBACK');
    expect(after.l2.pieces, 'nothing was cut').toBe(0);
    expect(after.l2.badLine).toBe('shortDiagonal');
    expect(after.sign.toLowerCase(), 'it does not call a diagonal a side').not.toContain('side');
    expect(after.sign.toLowerCase(), 'it asks for the cut right across').toContain('across');
  });

  test('a stroke that reaches no corner is told to connect two corners', async ({ page }) => {
    await boot(page, { speed: 900, fast: 4 });
    await enterLevelTwo(page);
    await page.evaluate(() => window.iceAgeGame._l2Cut(0, -1));
    const after = await page.evaluate(() => ({
      state: window.iceAgeGame.state(),
      sign: window.iceAgeGame.debug().signSay,
      badLine: window.iceAgeGame._l2().badLine
    }));
    expect(after.state).toBe('LEVEL_2_WRONG_FEEDBACK');
    expect(after.badLine).toBe('corners');
    expect(after.sign.toLowerCase()).toContain('corner');
  });

  /* THE COST OF BEING WRONG IS NOTHING BUT THE ATTEMPT. This is the promise Level 1
     makes too, and it is the one that matters most for a learner: nothing is removed,
     nothing is locked out, and the slab is live again a moment later. */
  test('a wrong cut takes nothing away and the slab comes back', async ({ page }) => {
    const errors = await boot(page, { speed: 900, fast: 4 });
    await enterLevelTwo(page);
    const before = await page.evaluate(() => window.iceAgeGame._l2());

    for (const [i, j] of [[0, 1], [1, 2], [0, 2], [3, 4]]) {
      await page.evaluate(() => window.iceAgeGame.state());
      await waitState(page, ['LEVEL_2_ACTIVE'], 20_000);
      await page.evaluate(([a, b]) => window.iceAgeGame._l2Cut(a, b), [i, j]);
      await waitState(page, ['LEVEL_2_ACTIVE'], 20_000);   // it comes back by itself
    }
    const after = await page.evaluate(() => window.iceAgeGame._l2());
    expect(after.corners.length, 'all six corners are still there').toBe(6);
    expect(after.pieces, 'still uncut').toBe(0);
    expect(after.wrong, 'four wrong attempts were counted').toBe(4);
    expect(after.corners, 'and the slab has not moved').toEqual(before.corners);

    // and the level is still winnable afterwards
    await page.evaluate(() => window.iceAgeGame._l2Cut(0, 3));
    expect(await page.evaluate(() => window.iceAgeGame.state())).toBe('LEVEL_2_SUCCESS');
    expect(jsErrors(errors), 'the game threw').toEqual([]);
  });
});

test.describe('Level 2 — the mend', () => {
  test.setTimeout(240_000);

  for (const d of [0, 1, 2]) {
    test(`main diagonal ${d} halves the slab and bridges both crevasses`, async ({ page }) => {
      const errors = await boot(page, { speed: 900, fast: 4 });
      await enterLevelTwo(page);
      await page.evaluate(n => window.iceAgeGame._l2Cut(n, n + 3), d);
      expect(await page.evaluate(() => window.iceAgeGame.state())).toBe('LEVEL_2_SUCCESS');

      await waitState(page, ['BRIDGE_2_COMPLETE', 'FINAL_RUN', 'COMPLETE'], 60_000);
      const gaps = await page.evaluate(() => window.iceAgeGame._l2Gaps());
      for (const g of gaps) {
        expect(g.repaired, 'the crossing is mended').toBe(true);
        expect(g.pieces, 'exactly one half in each hole').toBe(1);
        expect(g.filled, 'its slot is taken').toBe(true);
      }
      expect(jsErrors(errors), 'the game threw').toEqual([]);
    });
  }

  /* THE ANSWER LANDS AT THE SIZE IT WAS CUT. RUNNER's standing rule, and the reason
     CFG.levelTwo.hexR is 220 rather than a rounder number: a half is 0.866R tall
     against a 234px cavity, so the seating fit comes out at 1.0 and the learner never
     watches their own answer resize. */
  test('neither half is resized on the way in', async ({ page }) => {
    await boot(page, { speed: 900, fast: 4 });
    await enterLevelTwo(page);
    await page.evaluate(() => window.iceAgeGame._l2Cut(0, 3));
    await waitState(page, ['BRIDGE_2_COMPLETE', 'FINAL_RUN', 'COMPLETE'], 60_000);
    const fits = await page.evaluate(() =>
      window.iceAgeGame.debug().gapA.pieces.concat(window.iceAgeGame.debug().gapB.pieces)
        .map(p => p.fit));
    expect(fits.length).toBe(2);
    for (const f of fits) expect(f, 'seated at 1.0, not shrunk to fit').toBe(1);
  });

  test('the two halves span their holes — no daylight at either crossing', async ({ page }) => {
    await boot(page, { speed: 900, fast: 4 });
    await enterLevelTwo(page);
    await page.evaluate(() => window.iceAgeGame._l2Cut(1, 4));
    await waitState(page, ['BRIDGE_2_COMPLETE', 'FINAL_RUN', 'COMPLETE'], 60_000);
    const r = await page.evaluate(() => {
      const Gd = window.iceAgeGame.debug();
      return [Gd.gapA, Gd.gapB].map(g => {
        const p = g.pieces[0];
        // the widest the seated silhouette gets, against the hole it has to cover
        const xs = p.pts.map(q => q.x * p.fit);
        return { span: Math.max(...xs) - Math.min(...xs), hole: g.x1 - g.x0 };
      });
    });
    for (const { span, hole } of r) {
      expect(span, `a ${Math.round(span)}px half over a ${Math.round(hole)}px hole`)
        .toBeGreaterThanOrEqual(hole);
    }
  });

  test('the level completes and the run home follows it', async ({ page }) => {
    const errors = await boot(page, { speed: 900, fast: 5 });
    await enterLevelTwo(page);
    const r = await playLevelTwo(page, { budgetMs: 150_000 });
    expect(r.timedOut, 'ran out of wall clock at ' + r.state).toBe(false);
    expect(['FINAL_RUN', 'COMPLETE']).toContain(r.state);
    expect(r.trail.join(' '), 'the answer beat played').toContain('LEVEL_2_SUCCESS');
    expect(r.trail.join(' '), 'and the crossing celebrated').toContain('BRIDGE_2_COMPLETE');
    expect(jsErrors(errors), 'the game threw').toEqual([]);
  });

  test('a wrong answer first still completes the level', async ({ page }) => {
    const errors = await boot(page, { speed: 900, fast: 5 });
    await enterLevelTwo(page);
    const r = await playLevelTwo(page, { wrongFirst: true, budgetMs: 150_000 });
    expect(r.timedOut, 'ran out of wall clock at ' + r.state).toBe(false);
    expect(['FINAL_RUN', 'COMPLETE']).toContain(r.state);
    expect(r.trail.join(' ')).toContain('LEVEL_2_WRONG_FEEDBACK');
    expect(jsErrors(errors), 'the game threw').toEqual([]);
  });
});

test.describe('Level 2 — the instruction', () => {
  test.setTimeout(120_000);

  /* THE SAME RULE LEVEL 1's SENTENCES FOLLOW: the words name what to do, never how to
     recognise the answer, and none of the words that would give a shape away may
     appear. Level 2's sentence has one more thing to avoid — it must not say WHICH
     diagonal, because there are three and any of them is right. */
  test('names the cut without naming which one, and avoids the banned words', async ({ page }) => {
    await boot(page);
    const text = await page.evaluate(async () => {
      const m = await import('/js/engine.js');
      return m.CFG.levels[1].instruction;
    });
    expect(text.length, 'there is a sentence').toBeGreaterThan(0);
    for (const banned of ['regular', 'irregular', 'convex', 'concave', 'sides']) {
      expect(text.toLowerCase(), `the sentence must not say "${banned}"`).not.toContain(banned);
    }
    for (const leak of ['left', 'right', 'top', 'bottom', 'first', 'opposite']) {
      expect(text.toLowerCase(), `it must not point at one diagonal ("${leak}")`).not.toContain(leak);
    }
  });

  test('the sentence is up for the whole of the puzzle', async ({ page }) => {
    await boot(page, { speed: 900, fast: 4 });
    await enterLevelTwo(page);
    const shown = await page.evaluate(() => {
      const el = document.getElementById('instruction-text');
      return el ? el.textContent.trim() : '';
    });
    expect(shown.length, 'the plank is carrying the question').toBeGreaterThan(0);
    expect(shown.toLowerCase()).toContain('diagonal');
  });
});

test.describe('Level 2 — the drag', () => {
  test.setTimeout(180_000);

  /* THE REAL GESTURE, once. Everything above drives the rule through corner indices;
     this one puts a finger on the screen and drags it, because the level is only
     playable if the corners are where they are drawn. */
  test('a drag from one corner to the opposite one cuts the slab', async ({ page }) => {
    const errors = await boot(page, { speed: 900 });
    await enterLevelTwo(page);
    const box = await page.locator('#stage').boundingBox();
    const l2 = await page.evaluate(() => window.iceAgeGame._l2());
    // stage coordinates -> the page. The level does not zoom, so this is a flat scale.
    const at = i => ({
      x: box.x + l2.corners[i].x / 1920 * box.width,
      y: box.y + l2.corners[i].y / 1080 * box.height
    });
    const a = at(0), b = at(3);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let s = 1; s <= 8; s++) {
      await page.mouse.move(a.x + (b.x - a.x) * s / 8, a.y + (b.y - a.y) * s / 8);
    }
    await page.mouse.up();
    await waitState(page, ['LEVEL_2_SUCCESS', 'BRIDGE_2_COMPLETE', 'FINAL_RUN'], 30_000);
    const after = await page.evaluate(() => window.iceAgeGame._l2());
    if (after) expect(after.cut, 'cut on the diagonal that was dragged').toEqual([0, 3]);
    expect(jsErrors(errors), 'the game threw').toEqual([]);
  });

  /* A PRESS WITH NO TRAVEL IS NOT AN ANSWER. Someone touching a corner to see what it
     does must not have that read as a cut — the same guard Level 1's swipe has, for
     the same reason: an accidental commit is the worst input bug this game can have. */
  test('a tap on a corner commits nothing', async ({ page }) => {
    await boot(page, { speed: 900 });
    await enterLevelTwo(page);
    const box = await page.locator('#stage').boundingBox();
    const l2 = await page.evaluate(() => window.iceAgeGame._l2());
    const p = {
      x: box.x + l2.corners[0].x / 1920 * box.width,
      y: box.y + l2.corners[0].y / 1080 * box.height
    };
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 3, p.y + 2);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({
      state: window.iceAgeGame.state(), l2: window.iceAgeGame._l2()
    }));
    expect(after.state, 'still waiting for an answer').toBe('LEVEL_2_ACTIVE');
    expect(after.l2.pieces).toBe(0);
    expect(after.l2.wrong, 'and it was not counted against the learner').toBe(0);
  });
});
