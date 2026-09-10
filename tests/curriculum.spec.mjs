/* THE CURRICULUM, held to its own spec.

   Seven phases, and the thing being taught is that a polygon's identity is its
   NUMBER OF SIDES — not how regular it looks, and not whether it is convex. So
   these tests check two separate things and keep them separate:

     the GEOMETRY   every shape the curriculum names really has the side count,
                    convexity and regularity it claims, straight from the verified
                    registry rather than from a filename or a picture;
     the PHASE      a phase accepts exactly its targets, rejects everything else,
                    and — for "cut ALL the pentagons" — is not finished until every
                    one of them has been cut, in whatever order the learner chose.

   Everything here drives the real engine through its debug hooks. Nothing asserts a
   fixed horizontal option order, because the options are shuffled on purpose. */
import { test, expect } from '@playwright/test';
import { boot, waitState, cut, G, jsErrors } from './helpers.mjs';

/** The curriculum data itself, read from the module rather than duplicated here. */
const curriculum = page => page.evaluate(async () => {
  const m = await import('/js/engine.js');
  return m.CFG.levelOne.phases.map(p => ({
    id: p.id, instruction: p.instruction, options: p.options, ditches: p.ditches,
    targets: p.targets.slice(), distractors: p.distractors.slice()
  }));
});

/** How many phases there are. Read, never assumed, so one number moves the suite. */
const phaseCount = page => page.evaluate(async () => {
  const m = await import('/js/engine.js');
  return m.CFG.levelOne.phases.length;
});

/** Put the game at the start of one phase, with its crevasses genuinely open. */
async function enterPhase(page, index) {
  await page.evaluate(i => {
    const g = window.iceAgeGame;
    const G = g.debug();
    G.phase = i;
    G.l1 = null;
    G.phaseLayout = null;
    G.gapsThisPhase = null;
    g._force('GLACIER_BREAK_1');
  }, index);
  // the collapse is a fixed duration in GAME time — see the note in helpers.mjs
  await waitState(page, 'PHASE_ACTIVE', 90_000);
  return page.evaluate(() => {
    const L = window.iceAgeGame.debug().l1;
    return {
      hanging: L.shapes.map(s => s.kind),
      wanted: L.wanted.slice(),
      slots: L.slots.length
    };
  });
}

/** Cut one rope and wait until the phase settles again (or moves on). */
async function cutAndSettle(page, kind) {
  const ok = await cut(page, kind);
  await page.waitForFunction(() => {
    const s = window.iceAgeGame.state();
    return s === 'PHASE_ACTIVE' || s === 'PHASE_DONE' || s === 'PHASE_RUN' ||
           s === 'RUN_SEGMENT_2' || s === 'FINAL_RUN' || s === 'COMPLETE';
  }, null, { timeout: 20_000 });
  const after = await page.evaluate(() => {
    const g = window.iceAgeGame, G = g.debug();
    return {
      state: G.state,
      wanted: G.l1 ? G.l1.wanted.slice() : [],
      hanging: G.l1 ? G.l1.shapes.filter(s => s.state === 'hang').map(s => s.kind) : [],
      solved: G.l1 ? G.l1.targets.filter(t => t.filled).length : -1,
      phasesDone: G.phasesDone
    };
  });
  return { accepted: ok, ...after };
}

/* =========================== the geometry =========================== */

test.describe('polygon geometry', () => {
  test('the verified registry reports no problems', async ({ page }) => {
    await boot(page);
    const problems = await page.evaluate(async () => {
      const m = await import('/js/polygons.js');
      return m.verify();
    });
    expect(problems, 'polygons.js verify()').toEqual([]);
  });

  /* Side count, convexity and regularity come from the METADATA and the vertices,
     never from the name of a file or how a shape looks. */
  test('every named geometry has the sides, convexity and regularity it claims', async ({ page }) => {
    await boot(page);
    const rows = await page.evaluate(async () => {
      const m = await import('/js/polygons.js');
      const want = {
        regularTriangle: [3, true, true], regularQuadrilateral: [4, true, true],
        regularPentagon: [5, true, true], regularHexagon: [6, true, true],
        regularHeptagon: [7, true, true], regularOctagon: [8, true, true],
        irregularPentagon: [5, false, true], irregularConvexPentagon: [5, false, true],
        irregularHexagon: [6, false, true], irregularConvexHexagon: [6, false, true],
        irregularConvexOctagon: [8, false, true],
        concavePentagon: [5, false, false], concaveHexagon: [6, false, false],
        concaveHeptagon: [7, false, false]
      };
      const turn = (p, i) => {
        const n = p.length, a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
        return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - a.x);
      };
      const cross = (p1, p2, p3, p4) => {
        const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
        return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
      };
      return Object.entries(want).map(([name, [sides, regular, convex]]) => {
        const pts = m.pointsOf(name);
        const t = pts.map((_, i) => turn(pts, i));
        const isConvex = !(t.some(v => v > 0) && t.some(v => v < 0));
        const lens = pts.map((q, i) => {
          const r = pts[(i + 1) % pts.length];
          return Math.hypot(r.x - q.x, r.y - q.y);
        });
        const spread = (Math.max(...lens) - Math.min(...lens)) / Math.max(...lens);
        let selfCross = false;
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 2; j < pts.length; j++) {
            if (i === 0 && j === pts.length - 1) continue;
            if (cross(pts[i], pts[(i + 1) % pts.length], pts[j], pts[(j + 1) % pts.length])) selfCross = true;
          }
        }
        return {
          name, wantSides: sides, wantRegular: regular, wantConvex: convex,
          vertices: pts.length, metaSides: m.sidesOf(name),
          isConvex, isRegular: spread <= 0.02, selfCross
        };
      });
    });

    for (const r of rows) {
      expect(r.vertices, r.name + ' vertex count').toBe(r.wantSides);
      expect(r.metaSides, r.name + ' metadata side count').toBe(r.wantSides);
      expect(r.isConvex, r.name + (r.wantConvex ? ' must be convex' : ' must be concave')).toBe(r.wantConvex);
      expect(r.isRegular, r.name + (r.wantRegular ? ' must have equal sides' : ' must not have equal sides')).toBe(r.wantRegular);
      expect(r.selfCross, r.name + ' must not self-intersect').toBe(false);
    }
  });

  /* The runner fits, seats and rotates every chunk before it is drawn. None of that
     may change what the polygon IS — which is the one thing the learner counts. */
  test('fitting, seating and rotating a chunk never changes its side count or convexity', async ({ page }) => {
    await boot(page);
    const bad = await page.evaluate(async () => {
      const e = await import('/js/engine.js');
      const p = await import('/js/polygons.js');
      const out = [];
      const turn = (q, i) => {
        const n = q.length, a = q[(i - 1 + n) % n], b = q[i], c = q[(i + 1) % n];
        /* The cross product of the two EDGE vectors, b-a and c-b. This read
           (c.x - a.x), which is neither edge and only happens to carry the right sign
           on most shapes — it reported a rotated convex hexagon as concave, and the
           geometry was never wrong. */
        return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      };
      for (const name of Object.keys(p.polygonMetadata)) {
        const meta = p.polygonMetadata[name];
        for (const rotate of [0, 8, 14, 45, 90]) {
          const raw = e.PolygonFactory.chunk(name, 196, 210, { irregular: 0.14 });
          const seat = e.PolygonFactory.seat(raw, 196);
          const pts = e.PolygonFactory.turn(e.PolygonFactory.fitInside(seat.pts, 196, 210), rotate);
          const t = pts.map((_, i) => turn(pts, i));
          const convex = !(t.some(v => v > 0) && t.some(v => v < 0));
          if (pts.length !== meta.sides) out.push(`${name}@${rotate}: ${pts.length} sides, want ${meta.sides}`);
          if (convex !== meta.convex) out.push(`${name}@${rotate}: convexity flipped`);
        }
      }
      return out;
    });
    expect(bad).toEqual([]);
  });
});

/* =========================== the curriculum data =========================== */

test.describe('curriculum data', () => {
  test('seven phases, with the exact instruction sentences', async ({ page }) => {
    await boot(page);
    const phases = await curriculum(page);
    expect(phases.map(p => p.instruction)).toEqual([
      'Cut the triangle.',
      'Cut the quadrilateral.',
      'Cut the pentagon.',
      'Cut the hexagon.',
      'Cut the heptagon.',
      'Cut all the pentagons.',
      'Cut all the hexagons.'
    ]);
    expect(phases.map(p => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('the option counts are 3, 3, 3, 3, 3, 5, 6', async ({ page }) => {
    await boot(page);
    const phases = await curriculum(page);
    expect(phases.map(p => p.options)).toEqual([3, 3, 3, 3, 3, 5, 6]);
    // and every phase really has that many distinct shapes to hang
    for (const p of phases) {
      const all = p.targets.concat(p.distractors);
      expect(all.length, `phase ${p.id} shape count`).toBe(p.options);
      expect(new Set(all).size, `phase ${p.id} has a duplicated option`).toBe(p.options);
    }
  });

  test('the targets and distractors are the curriculum ones', async ({ page }) => {
    await boot(page);
    const phases = await curriculum(page);
    const want = [
      { targets: ['regularTriangle'], distractors: ['regularPentagon', 'regularHexagon'] },
      { targets: ['regularQuadrilateral'], distractors: ['regularTriangle', 'regularPentagon'] },
      { targets: ['regularPentagon'], distractors: ['regularTriangle', 'regularOctagon'] },
      { targets: ['irregularConvexHexagon'], distractors: ['irregularPentagon', 'regularHeptagon'] },
      { targets: ['concaveHeptagon'], distractors: ['concaveHexagon', 'irregularConvexOctagon'] },
      { targets: ['regularPentagon', 'irregularConvexPentagon', 'concavePentagon'],
        distractors: ['concaveHexagon', 'regularQuadrilateral'] },
      { targets: ['irregularConvexHexagon', 'concaveHexagon', 'regularHexagon'],
        distractors: ['concaveHeptagon', 'irregularPentagon', 'regularOctagon'] }
    ];
    phases.forEach((p, i) => {
      expect(p.targets.slice().sort(), `phase ${p.id} targets`).toEqual(want[i].targets.slice().sort());
      expect(p.distractors.slice().sort(), `phase ${p.id} distractors`).toEqual(want[i].distractors.slice().sort());
    });
  });

  /* The instruction names the CLASS, and only the class. Phase 4's answer is an
     irregular hexagon and phase 5's is a concave heptagon — if the sentence said so,
     there would be nothing left for the learner to work out. */
  test('the instruction names the class, and never the answer', async ({ page }) => {
    await boot(page);
    const phases = await curriculum(page);
    for (const p of phases) {
      const s = p.instruction.toLowerCase();
      // it says the class...
      const cls = ['triangle', 'quadrilateral', 'pentagon', 'hexagon', 'heptagon']
        .filter(c => s.includes(c));
      expect(cls.length, `phase ${p.id} names exactly one class: "${p.instruction}"`).toBe(1);
      // ...and never gives away regularity or convexity, which is what it is testing
      for (const tell of ['regular', 'irregular', 'convex', 'concave', 'sided', 'sides']) {
        expect(s, `phase ${p.id} must not say "${tell}"`).not.toContain(tell);
      }
      // plural exactly when several answers are wanted
      const plural = s.includes(cls[0] + 's');
      expect(plural, `phase ${p.id} plural`).toBe(p.targets.length > 1);
      // and "all" only where it means all
      expect(s.includes('all the'), `phase ${p.id} "all"`).toBe(p.targets.length > 1);
    }
  });

  test('the pacing arrays move with the phase count', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const m = await import('/js/engine.js');
      const L = m.CFG.levelOne;
      return { phases: L.phases.length, runMs: L.runMs.length, jumpBefore: L.jumpBefore,
               ids: L.phases.map(p => p.id) };
    });
    expect(r.phases).toBe(7);
    expect(r.runMs, 'one run length per phase').toBe(7);
    // every jump-before id is a phase that exists
    for (const id of r.jumpBefore) expect(r.ids).toContain(id);
  });
});

/* =========================== single-answer phases =========================== */

test.describe('single-answer phases', () => {
  test.setTimeout(180_000);

  /* One case per phase 1-5: the target is accepted, and each distractor is refused
     and splashes.

     PHASES 4 AND 5 CHANGED (2026-09-04) and the reason is the point of the whole
     curriculum. Phase 4's target is an IRREGULAR hexagon and its distractors were both
     regular, so the target was the only irregular shape in the row and "cut the wonky
     one" passed it every time — without counting a side. Phase 5's target is a CONCAVE
     heptagon among two convex distractors, so "cut the dented one" always worked. Those
     are exactly the two phases that introduce irregular and concave shapes, so each
     shortcut defeated the lesson its own phase exists to teach.

     One distractor swapped in each: an irregular pentagon in 4, a concave hexagon in 5.
     Now neither regularity nor convexity separates the answer from the rest in any
     phase, and only the side count can. */
  const cases = [
    { i: 0, target: 'regularTriangle', wrong: ['regularPentagon', 'regularHexagon'] },
    { i: 1, target: 'regularQuadrilateral', wrong: ['regularTriangle', 'regularPentagon'] },
    { i: 2, target: 'regularPentagon', wrong: ['regularTriangle', 'regularOctagon'] },
    { i: 3, target: 'irregularConvexHexagon', wrong: ['irregularPentagon', 'regularHeptagon'] },
    { i: 4, target: 'concaveHeptagon', wrong: ['concaveHexagon', 'irregularConvexOctagon'] }
  ];

  for (const c of cases) {
    test(`phase ${c.i + 1} accepts ${c.target} and refuses its distractors`, async ({ page }) => {
      const errors = await boot(page, { speed: 900, fast: 4 });

      // every distractor first, so a wrong answer is proved recoverable
      for (const w of c.wrong) {
        const start = await enterPhase(page, c.i);
        expect(start.hanging.sort(), 'the options that hang').toEqual([c.target, ...c.wrong].sort());
        expect(start.wanted, 'exactly one answer wanted').toEqual([c.target]);

        const r = await cutAndSettle(page, w);
        expect(r.accepted, w + ' should be cuttable').toBe(true);
        expect(r.state, w + ' must not finish the phase').toBe('PHASE_ACTIVE');
        expect(r.wanted, w + ' must not count as an answer').toEqual([c.target]);
        expect(r.hanging, 'the answer must still be hanging').toContain(c.target);
      }

      // then the answer, which finishes it
      const start = await enterPhase(page, c.i);
      const r = await cutAndSettle(page, c.target);
      expect(r.accepted).toBe(true);
      expect(r.wanted, 'nothing left to want').toEqual([]);
      expect(['PHASE_DONE', 'PHASE_RUN', 'RUN_SEGMENT_2', 'FINAL_RUN', 'COMPLETE']).toContain(r.state);
      expect(jsErrors(errors), 'the game threw').toEqual([]);
    });
  }
});

/* =========================== "cut ALL the ..." =========================== */

test.describe('multi-answer phases', () => {
  /* 420s, not 300s. These drive three answers through three different orders, and the
     journey pacing changes — a 2.3s skid and 8s runs — made each pass through a phase
     about half again as long. They pass in a minute alone and were timing out only
     under four-way parallel load. */
  /* Three orders through a seven-phase level, at a frame rate this runner sets rather
     than the game — see the note at the top of helpers.mjs. */
  test.setTimeout(600_000);

  const MULTI = [
    /* phase 6's irregularHexagon -> concaveHexagon: both distractors were convex while
       one of the three targets is a concave pentagon, so concavity identified one of
       the three answers for free. */
    { i: 5, name: 'phase 6', targets: ['regularPentagon', 'irregularConvexPentagon', 'concavePentagon'],
      wrong: ['concaveHexagon', 'regularQuadrilateral'] },
    { i: 6, name: 'phase 7', targets: ['irregularConvexHexagon', 'concaveHexagon', 'regularHexagon'],
      wrong: ['concaveHeptagon', 'irregularPentagon', 'regularOctagon'] }
  ];

  for (const m of MULTI) {
    test(`${m.name} does not complete until all three targets are cut`, async ({ page }) => {
      const errors = await boot(page, { speed: 900, fast: 4 });
      const start = await enterPhase(page, m.i);
      expect(start.wanted.sort(), 'all three are wanted up front').toEqual(m.targets.slice().sort());
      expect(start.slots, 'one repair slot per answer').toBe(3);

      const r1 = await cutAndSettle(page, m.targets[0]);
      expect(r1.state, 'one answer is not all of them').toBe('PHASE_ACTIVE');
      expect(r1.solved).toBe(1);
      expect(r1.phasesDone, 'the phase has not been credited').toBe(0);

      const r2 = await cutAndSettle(page, m.targets[1]);
      expect(r2.state, 'two answers are not all of them').toBe('PHASE_ACTIVE');
      expect(r2.solved).toBe(2);
      expect(r2.phasesDone).toBe(0);

      const r3 = await cutAndSettle(page, m.targets[2]);
      expect(r3.wanted, 'and now nothing is wanted').toEqual([]);
      expect(['PHASE_DONE', 'PHASE_RUN', 'RUN_SEGMENT_2', 'FINAL_RUN', 'COMPLETE']).toContain(r3.state);
      expect(jsErrors(errors), 'the game threw').toEqual([]);
    });

    test(`${m.name} accepts its targets in any order`, async ({ page }) => {
      const errors = await boot(page, { speed: 900, fast: 4 });
      const [a, b, c] = m.targets;
      // three genuinely different orders through the same phase
      const orders = [[a, b, c], [c, a, b], [b, c, a]];
      for (const order of orders) {
        await enterPhase(page, m.i);
        let last = null;
        for (const kind of order) {
          last = await cutAndSettle(page, kind);
          expect(last.accepted, kind + ' should be accepted in order ' + order.join('>')).toBe(true);
        }
        expect(last.wanted, 'finished in order ' + order.join('>')).toEqual([]);
        expect(['PHASE_DONE', 'PHASE_RUN', 'RUN_SEGMENT_2', 'FINAL_RUN', 'COMPLETE']).toContain(last.state);
      }
      expect(jsErrors(errors), 'the game threw').toEqual([]);
    });

    test(`${m.name} is still finishable after every distractor is cut first`, async ({ page }) => {
      const errors = await boot(page, { speed: 900, fast: 4 });
      await enterPhase(page, m.i);

      // clear the board of wrong answers
      for (const w of m.wrong) {
        const r = await cutAndSettle(page, w);
        expect(r.accepted, w + ' should be cuttable').toBe(true);
        expect(r.state, 'a wrong cut leaves the phase open').toBe('PHASE_ACTIVE');
        expect(r.solved, 'a wrong cut solves nothing').toBe(0);
        // and it removed nothing but itself
        for (const t of m.targets) expect(r.hanging, 'still hanging: ' + t).toContain(t);
      }

      // every answer is still there and still works
      for (const t of m.targets) {
        const r = await cutAndSettle(page, t);
        expect(r.accepted, t + ' must still be usable').toBe(true);
      }
      /* Read the STATE, not l1: the puzzle object is torn down 700ms into the
         celebrate, so a test that waits only for PHASE_DONE would race it. */
      const end = await page.evaluate(() => {
        const G = window.iceAgeGame.debug();
        return { state: G.state, wanted: G.l1 ? G.l1.wanted.length : 0 };
      });
      expect(end.wanted, 'every answer is in').toBe(0);
      expect(['PHASE_DONE', 'PHASE_RUN', 'RUN_SEGMENT_2', 'FINAL_RUN', 'COMPLETE']).toContain(end.state);
      expect(jsErrors(errors), 'the game threw').toEqual([]);
    });

    test(`${m.name} cannot count one answer twice`, async ({ page }) => {
      const errors = await boot(page, { speed: 900, fast: 4 });
      await enterPhase(page, m.i);
      const first = m.targets[0];

      const r = await cutAndSettle(page, first);
      expect(r.solved).toBe(1);
      expect(r.wanted, 'it left the wanted list').not.toContain(first);
      expect(r.hanging, 'and it is no longer hanging').not.toContain(first);

      // there is nothing left to cut of that kind, so a second attempt does nothing
      expect(await cut(page, first), 'a second cut of the same kind').toBe(false);
      const after = await page.evaluate(() => {
        const L = window.iceAgeGame.debug().l1;
        return { solved: L.targets.filter(t => t.filled).length, wanted: L.wanted.length };
      });
      expect(after.solved, 'still one answer in').toBe(1);
      expect(after.wanted, 'still two wanted').toBe(2);
      expect(jsErrors(errors), 'the game threw').toEqual([]);
    });
  }

  /* Three answers, three repair slots, and no slot bound to a shape in advance. The
     point of the slot model is that the learner is never told which shape belongs
     where — any answer fits the nearest free slot.

     THIS USED TO ASSERT THE SLOTS WERE THE SAME WIDTH, and the reason it gave was
     "a phase that mends one hole with two small plugs and another with one big one
     shows a difference the learner cannot account for". That reason is about PLUG
     SIZE, and slot width no longer determines it: a plug is now sized from the depth
     of the cavity, so every plug in the game comes out identical however the slots are
     shared out. Equal slot widths had become a proxy for something it no longer
     implied — and an expensive one, because it is what forced phases 6 and 7 down to a
     single crevasse.

     So it asserts the thing it actually cares about instead: that the PLUGS are the
     same size. That is strictly stronger, since it checks the outcome rather than a
     stand-in for it. Phases 6 and 7 open two crevasses again, which also widens the
     option row and so makes every shape bigger. */
  test('every repair slot is cut for one answer, and any answer still lands somewhere', async ({ page }) => {
    test.setTimeout(180_000);
    await boot(page, { speed: 900, fast: 4 });
    await enterPhase(page, 5);
    const before = await page.evaluate(() => {
      const G = window.iceAgeGame.debug();
      return {
        gaps: G.gapsThisPhase.length,
        // EVERY slot is cut for an answer before anything is cut (the notch shows which)
        preBound: G.l1.slots.filter(s => s.kind && s.notch).length,
        widths: G.l1.slots.map(s => Math.round(s.x1 - s.x0))
      };
    });
    /* REVERSED on request (September 2026): the gap now shows the silhouette of the piece that
       belongs in it, so every slot is bound to a target up front. What must still hold is that
       cutting in any order works: the piece goes to the slot cut for it, never refused. */
    expect(before.preBound, 'every slot expects a particular shape up front').toBe(3);
    expect(before.widths.length, 'one slot per answer').toBe(3);
    /* Cut the answer hanging FURTHEST RIGHT first. If any allocation were hidden in
       the data this is where it would show up as a refusal. */
    const rightmost = await page.evaluate(() => {
      const L = window.iceAgeGame.debug().l1;
      const mine = L.shapes.filter(s => s.state === 'hang' && L.wanted.includes(s.kind));
      mine.sort((a, b) => b.x - a.x);
      return mine[0].kind;
    });
    const r = await cutAndSettle(page, rightmost);
    expect(r.accepted, rightmost + ' cut from the right').toBe(true);
    expect(r.solved, 'and it counted').toBe(1);
  });

  /* EVERY PLUG IS THE SAME SIZE — and that size is 1.0, the size the shape was cut at.

     This replaces an assertion that the repair SLOTS were all the same width. The
     reason that one gave was "a phase that mends one hole with two small plugs and
     another with one big one shows a difference the learner cannot account for" — which
     is about plug size, and slot width no longer determines it. A plug is sized from
     the depth of the cavity, and CFG.levelOne.optionH is tied to that same depth, so a
     block cannot be taller than the hole it sits in and never has to be scaled to get
     there. Equal slot widths had become a proxy for something it no longer implied, and
     an expensive one: it is what forced phases 6 and 7 down to a single crevasse.

     Asserting the plug size directly is strictly stronger, because it checks the
     outcome the old comment described instead of a stand-in for it. It also guards the
     thing that actually went wrong twice: a plug scaled to fill its slot had its
     silhouette clipped, so phase 1's triangle arrived as a trapezoid.

     It is a test of its own because it FINISHES the phase, and the allocation test
     above needs the phase still running after it. */
  test('every repair plug lands at the size it was cut', async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page, { speed: 900, fast: 4 });
    for (const phase of [5, 6]) {
      await enterPhase(page, phase);
      const fits = await page.evaluate(async () => {
        const g = window.iceAgeGame;
        let guard = 0;
        while (guard++ < 600) {
          const G = g.debug();
          if (!G.l1) break;
          if (G.state === 'PHASE_ACTIVE' && G.l1.unfilled.length) g._cut(G.l1.unfilled[0]);
          if (G.state === 'PHASE_DONE') break;
          await new Promise(r => requestAnimationFrame(r));
        }
        return (g.debug().gapsThisPhase || []).flatMap(x => (x.pieces || []).map(q => q.fit));
      });
      const label = ' (phase ' + (phase + 1) + ')';
      expect(fits.length, 'one plug per answer' + label).toBe(3);
      for (const f of fits) {
        expect(f, 'a plug was rescaled on the way in: ' + JSON.stringify(fits) + label)
          .toBeCloseTo(1, 3);
      }
    }
  });
});

/* =========================== the hanging row =========================== */

test.describe('the hanging row', () => {
  test.setTimeout(240_000);

  /* Five and six options are new. The row has to stay inside the stage, keep clear
     air between neighbours, and above all keep every chunk out of the band a falling
     chunk could drop on the character. */
  test('no row clips, overlaps, or reaches the character — at every option count', async ({ page }) => {
    await boot(page, { speed: 900, fast: 4 });
    const total = await phaseCount(page);
    expect(total).toBe(7);

    for (let i = 0; i < total; i++) {
      await enterPhase(page, i);
      const row = await page.evaluate(() => {
        const G = window.iceAgeGame.debug();
        const bounds = pts => {
          let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
          for (const p of pts) {
            x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
            y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
          }
          return { x0, x1, y0, y1 };
        };
        return G.l1.shapes.map(s => {
          const b = bounds(s.pts);
          return {
            kind: s.kind, x: s.x, y: s.y, sides: s.pts.length,
            left: s.x + b.x0, right: s.x + b.x1,
            top: s.y + b.y0, bottom: s.y + b.y1
          };
        }).sort((a, b) => a.left - b.left);
      });

      const label = ` (phase ${i + 1}, ${row.length} options)`;
      for (const s of row) {
        // clear of the character: a cut chunk falls toward the crevasse, never back
        expect(Math.abs(s.x - 430), s.kind + ' distance from the mammoth' + label)
          .toBeGreaterThan(300);
        // inside the stage on every side
        expect(s.left, s.kind + ' left edge' + label).toBeGreaterThan(0);
        expect(s.right, s.kind + ' right edge' + label).toBeLessThan(1920);
        expect(s.top, s.kind + ' top edge' + label).toBeGreaterThan(0);
        // and well clear of the snow line, so it reads as hanging
        expect(s.bottom, s.kind + ' bottom edge' + label).toBeLessThan(890 - 100);
        // big enough that the sides can still be counted
        expect(s.right - s.left, s.kind + ' width' + label).toBeGreaterThan(120);
      }
      // no two chunks overlap, and the ropes above them are separated too
      for (let k = 1; k < row.length; k++) {
        expect(row[k].left, row[k].kind + ' overlaps ' + row[k - 1].kind + label)
          .toBeGreaterThan(row[k - 1].right);
        expect(Math.abs(row[k].x - row[k - 1].x), 'rope separation' + label)
          .toBeGreaterThan(80);
      }
    }
  });

  test('the crossing cannot be jumped, and every piece spans its own hole', async ({ page }) => {
    /* THE CROSSING, NOT EACH GAP — and that is a change of claim, not a relaxed
     * threshold.
     *
     * This used to require each crevasse to exceed 400px, because a jump carries about
     * 460 and one fixed 620px hole was the whole crossing. A ditch is now cut to the
     * width of the piece that bridges it, which is 133-200px depending on how many
     * options the row holds — so the old assertion fails by design, and raising it
     * would only force the geometry back.
     *
     * What still has to be true is that the crossing is IMPASSABLE — and the honest
     * assertion for that is NOT a width. A first attempt at this measured the span
     * from the first near lip to the last far lip and required it to beat a jump,
     * which fails on a single-ditch phase for a good reason: that span is one 200px
     * ditch, and 200px genuinely is jumpable. The geometry is not what stops the
     * player crossing.
     *
     * What stops them is that the JUMP IS DISABLED for the whole of a puzzle. So that
     * is what is asserted — the actual mechanism rather than an invented consequence
     * of it.
     *
     * And the new invariant the redesign rests on: every option must be at least as
     * wide as the hole, or a correct answer drops through the gap it was meant to
     * bridge. That is the assertion that would have caught the two ways this went
     * wrong while it was being built — a ditch sized from the row box instead of the
     * finished piece, and a floor that outgrew the piece in the six-option phases. */
    await boot(page, { speed: 900, fast: 4 });
    const total = await phaseCount(page);
    for (let i = 0; i < total; i++) {
      await enterPhase(page, i);
      const r = await page.evaluate(() => {
        const G = window.iceAgeGame.debug();
        const gs = G.gapsThisPhase;
        const hang = (G.l1 && G.l1.shapes || []).filter(s => s.state === "hang");
        return {
          gaps: gs.map(g => ({ w: g.x1 - g.x0, throat: g.throat || (g.x1 - g.x0), near: g.x0 - G.worldX, slots: g.slots.length })),
          jumpEnabled: G.jumpEnabled,
          narrowestPiece: hang.length ? Math.min(...hang.map(s => s.w)) : 0
        };
      });
      expect(r.gaps.length, `phase ${i + 1} crevasse count`).toBeGreaterThan(0);

      // the crossing cannot be jumped because jumping is off, which is the real rule
      expect(r.jumpEnabled, `phase ${i + 1} jump is disabled`).toBe(false);

      for (const g of r.gaps) {
        // one or two polygons per hole: the 3-answer phases bridge one wide ditch with two
        expect(g.slots, `phase ${i + 1} slots per crevasse`).toBeGreaterThanOrEqual(1);
        expect(g.slots, `phase ${i + 1} slots per crevasse`).toBeLessThanOrEqual(2);
        // the near lip is past the character, who stops at the edge
        expect(g.near, `phase ${i + 1} near lip`).toBeGreaterThan(430 + 200);
        // and the narrowest option still reaches across the THROAT, where it wedges —
        // the mouth above it is deliberately wider (L1.mouth), which is the visible gap
        expect(r.narrowestPiece, `phase ${i + 1} piece spans its share of the throat`)
          .toBeGreaterThanOrEqual(g.throat / g.slots);
        expect(g.w, `phase ${i + 1} mouth is wider than the throat`).toBeGreaterThan(g.throat);
      }
    }
  });
});
