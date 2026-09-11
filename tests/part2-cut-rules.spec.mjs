/* WHAT EACH DRAWING CROSSING WILL AND WILL NOT ACCEPT.
 *
 * The three Part 2 crossings each teach one rule, and each rule is only taught if the
 * game actually refuses the thing it is about. A crossing that accepts the wrong answer
 * teaches the wrong answer — and it does it in the most convincing way available,
 * because the reward animation plays over it.
 *
 * This exists because crossing 3 did exactly that. The same-vertex test keyed off
 * `L.origin`, which is deliberately still null after the first line (which of its two
 * ends is the origin is not knowable until the second arrives), so the "first line"
 * branch ran again on the second line and the test below it was unreachable. Two
 * diagonals from opposite corners of the pentagon fanned the slab as a correct answer.
 * Reported as "in level 3 if i cut wrong using point why u show correct cut".
 *
 * These drive _l2Cut(i, j) rather than the pointer: the rule is about which corners
 * were joined, and a mouse drag tests the snap radius as well, which is a different
 * question and is covered in part2-responsive.
 */
import { test, expect } from '@playwright/test';
import { boot, waitState, jsErrors } from './helpers.mjs';

/** Drop onto Part 2 crossing `n` (1-based) with the slab live and cuttable. */
async function enterCrossing(page, n) {
  await page.evaluate(i => {
    const g = window.iceAgeGame, G = g.debug();
    G.phase = 0; G.phasesDone = 3; G.l1 = null; G.gapsThisPhase = null;
    G.p2i = i; G.l2 = null; G.gapA = null; G.gapB = null;
    g._force('GLACIER_BREAK_2');
  }, n - 1);
  await waitState(page, ['LEVEL_2_ACTIVE'], 60_000);
}

/** Join corners i and j in turn, then report where the level stands.
 *
 *  The pairs go over as JSON: page.evaluate takes ONE argument, and an array of arrays
 *  read back inside the page as undefined when this was first written — a string cannot
 *  be got wrong that way.
 *
 *  `_l2()` is a curated snapshot, not the live level: badLine comes back already
 *  reduced to its kind string, and mechanic/solved/drawn/origin are exposed there
 *  precisely so these rules can be asserted from outside. */
const cut = (page, pairs) => page.evaluate(js => {
  const g = window.iceAgeGame;
  for (const [i, j] of JSON.parse(js)) g._l2Cut(i, j);
  const L = g._l2();
  return {
    state: g.state(),
    solved: !!(L && L.solved),
    wrong: L ? L.wrong : -1,
    badKind: L ? L.badLine : null,
    drawn: L ? L.drawn : null,
    origin: L ? L.origin : undefined,
    mechanic: L ? L.mechanic : null
  };
}, JSON.stringify(pairs));

test.describe('crossing 3 — two diagonals from the SAME vertex', () => {
  test.setTimeout(180_000);

  /* THE FAULT ITSELF. A regular pentagon's diagonals are 0-2, 0-3, 1-3, 1-4 and 2-4.
     0-2 and 1-3 are both real diagonals and share no corner, which is precisely the
     mistake this crossing is for. */
  test('refuses two diagonals that share no corner', async ({ page }) => {
    const errors = await boot(page, { speed: 900, fast: 4 });
    await enterCrossing(page, 3);
    const r = await cut(page, [[0, 2], [1, 3]]);
    expect(r.solved, 'the slab must NOT come apart on a wrong pair').toBe(false);
    expect(r.state, 'it goes to the wrong-answer beat').toBe('LEVEL_2_WRONG_FEEDBACK');
    expect(r.badKind, 'and is refused by name, so the nudge can say why')
      .toBe('sameVertex');
    expect(r.wrong, 'the attempt is counted').toBeGreaterThan(0);
    expect(r.drawn, 'the refused line is not kept').toEqual(['0-2']);
    expect(jsErrors(errors), 'the game threw').toEqual([]);
  });

  /* AND THE OTHER PAIRING OF THE SAME MISTAKE, because the first line's two ends are
     held as candidates and a bug could easily accept one of them and not the other. */
  test('refuses it the other way round too', async ({ page }) => {
    const errors = await boot(page, { speed: 900, fast: 4 });
    await enterCrossing(page, 3);
    const r = await cut(page, [[1, 3], [0, 2]]);
    expect(r.solved).toBe(false);
    expect(r.badKind).toBe('sameVertex');
    expect(jsErrors(errors)).toEqual([]);
  });

  /* THE RIGHT ANSWER STILL WORKS, from either end of the first line — that is the whole
     reason the origin is left undecided until the second cut, and it is the thing a
     naive fix to the above would break. */
  for (const [name, pairs, origin] of [
    ['from the first line\'s low end', [[0, 2], [0, 3]], 0],
    ['from the first line\'s high end', [[0, 2], [2, 4]], 2]
  ]) {
    test(`accepts two diagonals ${name}`, async ({ page }) => {
      const errors = await boot(page, { speed: 900, fast: 4 });
      await enterCrossing(page, 3);
      const r = await cut(page, pairs);
      expect(r.solved, 'the slab fans on the right answer').toBe(true);
      expect(r.origin, 'and the shared corner is the one they share').toBe(origin);
      expect(r.state).toBe('LEVEL_2_SUCCESS');
      expect(jsErrors(errors)).toEqual([]);
    });
  }

  /* A REPEAT IS NOT THE SAME MISTAKE and must not be reported as one: the learner has
     drawn a real diagonal and simply drawn it already. */
  test('a repeated line is refused as a repeat, not as a wrong corner', async ({ page }) => {
    await boot(page, { speed: 900, fast: 4 });
    await enterCrossing(page, 3);
    const r = await cut(page, [[0, 2], [2, 0]]);
    expect(r.solved).toBe(false);
    expect(r.badKind).toBe('already');
  });
});

/* THE OTHER TWO CROSSINGS, so the fix above cannot have been made by loosening
   something they share. */
test.describe('crossings 1 and 2 still hold their own rules', () => {
  test.setTimeout(180_000);

  /* Asserted on the STATE, not on `solved`: cut-diagonal is the one mechanic that has
     no multi-line rule to satisfy, so it goes straight to LEVEL_2_SUCCESS and never
     sets the flag the other two need. */
  test('crossing 1 refuses a side and takes a main diagonal', async ({ page }) => {
    await boot(page, { speed: 900, fast: 4 });
    await enterCrossing(page, 1);
    const bad = await cut(page, [[0, 1]]);
    expect(bad.state, 'a side is not a diagonal').toBe('LEVEL_2_WRONG_FEEDBACK');
    expect(bad.badKind).toBe('side');

    await enterCrossing(page, 1);
    const good = await cut(page, [[0, 3]]);
    expect(good.state, 'the long diagonal is the answer').toBe('LEVEL_2_SUCCESS');
  });

  test('crossing 2 needs EVERY diagonal before it comes apart', async ({ page }) => {
    await boot(page, { speed: 900, fast: 4 });
    await enterCrossing(page, 2);
    const one = await cut(page, [[0, 2]]);
    expect(one.solved, 'one of two is not all of them').toBe(false);
    expect(one.state, 'and it is not a mistake either — the shape stays open')
      .toBe('LEVEL_2_ACTIVE');
    const both = await cut(page, [[1, 3]]);
    expect(both.solved, 'the second one finishes it').toBe(true);
  });
});
