/* PART 2 — THE NINE LEVELS, AS DATA.
 *
 * Part 1 asks WHICH POLYGON, by counting sides. Part 2 asks two new questions:
 * levels 1-3 are about the DIAGONAL (what one is, and cutting along one), and
 * levels 4-9 are about CONCAVITY (which shape is dented, which is not).
 *
 * WHY THIS IS A FILE OF ITS OWN, and the only part of Part 2 that is. The mechanics
 * have to live inside createGame() in engine.js — they reach for `G`, `ground`,
 * `particles` and `audio`, none of which are exported, and prising them out would be
 * exactly the "large rewrite" this work was told not to do. The DATA has no such
 * dependency, so it lives here where a level can be re-tuned, reordered or switched
 * off without opening a ten-thousand-line file.
 *
 * THE NUMBERING IS FINAL AND IT IS NOT THE DESIGN'S. Three levels come before the
 * hanging-choice mechanic, so the first hanging level is 4, not 3. Getting this wrong
 * is the single easiest mistake to make here, so `levels` is index-checked at the
 * bottom of this file and a test asserts it.
 *
 * EVERY SHAPE NAMED BELOW IS A VERIFIED GEOMETRY from polygons.js — the registry that
 * knows each shape's side count and convexity and is checked by verify(). Nothing here
 * decides an answer by filename or by what a picture looks like: a rule is a predicate
 * over that metadata, evaluated in rulePasses() below, so "is this a concave pentagon"
 * is answered by the same data the renderer draws from and the two can never disagree.
 */

import { polygonMetadata, canonical } from './polygons.js';

/* ---------- the rules a hanging level can ask ----------

   A rule is a name and a predicate. Keeping them here rather than as loose strings in
   the level records means a typo is a missing rule (loud) rather than a rule that
   silently matches nothing (a level with no answer, which is unwinnable and looks like
   a physics bug). rulePasses() throws on an unknown name for that reason. */
export const RULES = {
  concave:          m => !m.convex,
  convex:           m => m.convex,
  'concave-pentagon': m => !m.convex && m.sides === 5,
  'convex-hexagon':   m => m.convex && m.sides === 6
};

/** Does this geometry satisfy this rule? The one place a Part 2 answer is decided. */
export function rulePasses(rule, kind) {
  const test = RULES[rule];
  if (!test) throw new Error('part2: unknown rule "' + rule + '"');
  const m = polygonMetadata[canonical(kind)];
  return !!m && !!test(m);
}

/* ---------- the levels ----------

   focus 'center'  levels 1-3: one polygon, brought to the middle of the stage and
                   worked ON. The world blurs behind it.
   focus 'hanging' levels 4-9: several polygons on ropes over the crossing, and the
                   question is which to cut. This is Part 1's mechanic, unchanged —
                   only the rule that decides an answer is different.

   `targets` and `distractors` are spelled out rather than generated from the rule.
   Generating them would make the level list shorter and the CURRICULUM invisible: which
   distractors sit beside an answer is the whole difficulty of a recognition question,
   and it has to be reviewable at a glance. Every one of them is checked against its own
   rule by a test, so a wrong entry here cannot ship.
*/
export const levels = [
  /* ============ 1-3: THE DIAGONAL, worked on one shape ============ */

  /* A diagonal joins two corners that are not next to each other. The learner draws
     every one of them, which is the definition made physical: the sides are already
     drawn, so what is left to draw is exactly the diagonals.

     THE DELIVERED SLAB, and a quadrilateral on purpose. It has exactly TWO diagonals —
     the fewest any polygon has, and they cross in the middle where both stay plainly
     visible — so the first thing the learner ever draws is the whole answer rather than
     two of five. The geometry is traced off assets/option-shape/1.png (see
     iceQuadrilateral in polygons.js), so the corner handles land on the painted
     corners. */
  {
    id: 1,
    mechanic: 'draw-all-diagonals',
    focus: 'center',
    shape: 'iceQuadrilateral',
    art: '1',
    instruction: 'Draw all the diagonals.',
    hint: 'Join two corners that are not next to each other.',
    repairPath: true
  },

  /* The same idea, narrowed to one corner. Two diagonals FROM THE SAME VERTEX is the
     step between "what a diagonal is" and "how a shape is cut up by them", and it is
     the first time the learner has to hold a constraint while drawing rather than just
     produce valid lines.

     A PENTAGON, and the constraint is real rather than decorative: it has five
     diagonals in total but only two from any one corner, so a learner who draws two
     valid diagonals from DIFFERENT corners has done something reasonable and still not
     answered the question. That is the mistake this level exists to catch, and it is
     why the level cannot be a quadrilateral (whose two diagonals never share a corner)
     or a hexagon (where two of the three from a corner is a weaker constraint). */
  {
    id: 2,
    mechanic: 'same-vertex-diagonals',
    focus: 'center',
    shape: 'regularPentagon',
    requiredCount: 2,
    instruction: 'Draw 2 diagonals from the same vertex.',
    hint: 'Both lines must start at the same corner.',
    repairPath: true
  },

  /* And now the diagonal does something: it cuts. The hexagon comes apart along the
     line the learner draws and the two halves bridge the two crevasses.

     Only a MAIN diagonal completes it, and that is a geometry constraint rather than a
     preference — a short diagonal leaves a piece too tall to bridge. It is never called
     wrong, because it IS a diagonal; it gets its own nudge. The full arithmetic is in
     RUNNER.md §15, which this level predates as CFG.levelTwo. */
  {
    id: 3,
    mechanic: 'cut-diagonal',
    focus: 'center',
    shape: 'regularHexagon',
    instruction: 'Cut the shape along its diagonal.',
    hint: 'Cut from a corner to the corner opposite it.',
    repairPath: true
  },

  /* ============ 4-9: CONCAVITY, chosen from the ropes ============

     From here the question changes from "work with this shape" to "which of these".
     This is Part 1's hanging-option mechanic with a different rule, so the ropes, the
     swipe, the drop, the wedge and the mend are all the code that already shipped. */

  /* THE FIRST HANGING LEVEL IS 4. Three options: one dented shape against two that are
     not. Concavity is the only thing that separates them — the side counts are 5, 6 and
     7 across the row precisely so that counting sides cannot answer it. */
  {
    id: 4,
    mechanic: 'hanging-single',
    focus: 'hanging',
    rule: 'concave',
    options: 3, ditches: 1,
    targets: ['concaveHexagon'],
    distractors: ['regularPentagon', 'regularHeptagon'],
    instruction: 'Cut the concave polygon.',
    sub: 'Choose the polygon that is concave.',
    repairPath: true
  },

  /* The mirror of 4, and it matters that it comes second: having found the dented one,
     the learner now has to find the ones that are NOT. Two concave distractors, so
     "the odd one out" is the answer here and was the distractor last time. */
  {
    id: 5,
    mechanic: 'hanging-single',
    focus: 'hanging',
    rule: 'convex',
    options: 3, ditches: 1,
    targets: ['regularHexagon'],
    distractors: ['concavePentagon', 'concaveHeptagon'],
    instruction: 'Cut the convex polygon.',
    sub: 'Choose the polygon that is convex.',
    repairPath: true
  },

  /* TWO PROPERTIES AT ONCE, and the distractors are chosen so that neither alone is
     enough. One shape is a pentagon but convex; two are concave but not pentagons. So
     "the dented one" fails, "the five-sided one" fails, and only both together answer
     it. This is the phase most easily broken by a careless distractor swap. */
  {
    id: 6,
    mechanic: 'hanging-single',
    focus: 'hanging',
    rule: 'concave-pentagon',
    options: 4, ditches: 1,
    targets: ['concavePentagon'],
    distractors: ['regularPentagon', 'concaveHexagon', 'concaveHeptagon'],
    instruction: 'Cut the concave pentagon.',
    sub: 'Choose the polygon that is a concave pentagon.',
    repairPath: true
  },

  /* The same double condition the other way up: one convex non-hexagon, one concave
     hexagon, one concave non-hexagon. Again neither property alone decides it. */
  {
    id: 7,
    mechanic: 'hanging-single',
    focus: 'hanging',
    rule: 'convex-hexagon',
    options: 4, ditches: 1,
    targets: ['irregularConvexHexagon'],
    distractors: ['concaveHexagon', 'regularPentagon', 'concaveHeptagon'],
    instruction: 'Cut the convex hexagon.',
    sub: 'Choose the polygon that is a convex hexagon.',
    repairPath: true
  },

  /* ============ 8-9: EVERY shape that matches ============

     Multi-answer, and Part 1 already does this ("Cut all the pentagons") — the phase
     stays open until every entry in `targets` has been cut, in any order, and no answer
     can be counted twice. Nothing new was needed for these two.

     All three concave geometries the registry holds are answers here, against three
     convex shapes. That is the whole concave set, which is why 8 is the level that
     proves the learner can find dents rather than remember one. */
  {
    id: 8,
    mechanic: 'hanging-multiple',
    focus: 'hanging',
    rule: 'concave',
    options: 6, ditches: 2,
    targets: ['concavePentagon', 'concaveHexagon', 'concaveHeptagon'],
    distractors: ['regularPentagon', 'irregularConvexHexagon', 'regularOctagon'],
    instruction: 'Cut all the concave polygons.',
    sub: 'Choose all the polygons that are concave.',
    repairPath: true
  },

  /* The last level, and the widest: three convex answers spread across a triangle, a
     quadrilateral and an octagon, so the property is plainly not about size or side
     count, against all three concave shapes. */
  {
    id: 9,
    mechanic: 'hanging-multiple',
    focus: 'hanging',
    rule: 'convex',
    options: 6, ditches: 2,
    targets: ['regularTriangle', 'regularQuadrilateral', 'regularOctagon'],
    distractors: ['concavePentagon', 'concaveHexagon', 'concaveHeptagon'],
    instruction: 'Cut all the convex polygons.',
    sub: 'Choose all the polygons that are convex.',
    repairPath: true
  }
];

/* HOW LONG THE MAMMOTH RUNS before each level, one entry per level. Part 1 keeps the
   same arrangement (CFG.levelOne.runMs) and the same rule applies: change the level
   count and this moves with it, which a test checks. Shorter than Part 1's because by
   Part 2 the journey is established and the questions are the point. */
export const runMs = [5200, 6000, 6000, 6500, 6000, 6500, 6000, 6500, 6000];

/* WHICH LEVELS GET A ROCK TO CLEAR before them. Not level 1: Part 1's last crossing
   already leads into a run, and stacking a rock stretch in front of the first new
   question puts two obstacles back to back before anything is asked. */
export const jumpBefore = [2, 4, 6, 8];

/* HOW LONG THE COMPLETE SCENE IS SHOWN before the level focuses (§5 of the brief).
   It is a reading moment, not loading: mammoth -> ditch -> activity -> solution. Long
   enough to take the picture in, short enough not to feel like lag. Interaction is
   locked throughout, and a tap skips the remainder — a returning player should not have
   to sit through it nine times. */
export const overviewMs = 1350;

/* ---------- self-checks, run at import ----------

   These are assertions about the DATA, and they run once when the module loads rather
   than only in the test suite. A level list that cannot be won is not a failing test in
   CI three hours later — it is a child stuck on a screen — so it fails loudly here. */
(function check() {
  if (levels.length !== 9) throw new Error('part2: expected 9 levels, got ' + levels.length);
  levels.forEach((L, i) => {
    if (L.id !== i + 1) throw new Error('part2: level at index ' + i + ' has id ' + L.id);
    if (L.focus === 'hanging') {
      // the row must be exactly what the level says it is
      const row = L.targets.concat(L.distractors);
      if (row.length !== L.options) {
        throw new Error(`part2 level ${L.id}: ${row.length} shapes for ${L.options} options`);
      }
      // no shape may appear twice in one row — a duplicate is two ropes with one answer
      if (new Set(row).size !== row.length) throw new Error(`part2 level ${L.id}: duplicate shape in the row`);
      // and the rule must actually pick out the targets, and only the targets
      for (const t of L.targets) {
        if (!rulePasses(L.rule, t)) throw new Error(`part2 level ${L.id}: target ${t} fails rule ${L.rule}`);
      }
      for (const d of L.distractors) {
        if (rulePasses(L.rule, d)) throw new Error(`part2 level ${L.id}: distractor ${d} PASSES rule ${L.rule}`);
      }
      const multi = L.mechanic === 'hanging-multiple';
      if (multi !== (L.targets.length > 1)) {
        throw new Error(`part2 level ${L.id}: ${L.mechanic} with ${L.targets.length} target(s)`);
      }
    }
  });
  if (runMs.length !== levels.length) throw new Error('part2: runMs must have one entry per level');
  const ids = levels.map(L => L.id);
  for (const j of jumpBefore) if (!ids.includes(j)) throw new Error('part2: jumpBefore names level ' + j);
})();

/** The level record for a 1-based id, or null. */
export function levelById(id) { return levels.find(L => L.id === id) || null; }
