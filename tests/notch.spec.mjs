/* THE NOTCH, IN TWO STATES (temporary, pending feedback). Before the answer the gap shows a
   generic faceted break that resembles no option; after the right piece seats it resolves to
   the exact answer outline and the plug fills it. Held on the data, on the leak check, and on
   the one-source rule: the instruction's noun and the target kind must agree. */
import { test, expect } from '@playwright/test';
import { boot, force, waitState, cut } from './helpers.mjs';

const NOUN = k => /triangle/i.test(k) ? 'triangle' : /quadrilateral/i.test(k) ? 'quadrilateral' : /pentagon/i.test(k) ? 'pentagon'
  : /hexagon/i.test(k) ? 'hexagon' : /heptagon/i.test(k) ? 'heptagon' : /octagon/i.test(k) ? 'octagon' : k;

test.describe('the notch', () => {
  test.setTimeout(120_000);
  /* The notch is an experiment behind CFG.levelOne.notch and is OFF after review (the plain neck
     looked natural, the faceted break did not). Its behaviour tests run only when it is on; the
     one-source-of-truth test always runs. */
  let mode = 'off';
  test.beforeEach(async ({ page }) => {
    await boot(page);
    mode = await page.evaluate(async () => { const m = await import('/js/engine.js'); return m.CFG.levelOne.notch || 'off'; });
  });

  test('every question names the shape its slots are cut for (one source of truth)', async ({ page }) => {
    const phases = await page.evaluate(async () => { const m = await import('/js/engine.js'); return m.CFG.levelOne.phases.map(p => ({ instruction: p.instruction, targets: p.targets })); });
    for (const p of phases) {
      const m = /\bthe\s+([a-z]+?)(s?)[.!]?$/i.exec(p.instruction);
      expect(m, p.instruction).not.toBeNull();
      for (const t of p.targets) expect(NOUN(t), `${p.instruction} vs ${t}`).toBe(m[1].toLowerCase());
    }
  });

  test('before the answer the break is faceted and gives nothing away; every slot knows its answer', async ({ page }) => {
    test.skip(mode !== 'reveal', 'the notch experiment is off');
    await boot(page, { fast: 2 });
    await force(page, 'GLACIER_BREAK_1');
    await waitState(page, 'PHASE_ACTIVE', 40_000);
    await page.waitForFunction(() => { const L = window.iceAgeGame.debug().l1; return L && L.shapes.some(s => s.state === 'hang' && s.y > 400); }, null, { timeout: 20_000 });
    const r = await page.evaluate(() => {
      const g = window.iceAgeGame, G = g.debug(); const slot = G.l1.slots[0];
      return { kind: slot.kind, wanted: G.l1.unfilled[0], hasNotch: !!slot.notch, reveal: g._notchReveal(0), leak: g._notchLeak(0), throat: slot.x1 - slot.x0,
               wTop: g._notchWidth(0, 10), wMid: g._notchWidth(0, 40) };
    });
    expect(r.hasNotch).toBe(true);
    expect(r.kind).toBe(r.wanted);
    expect(r.reveal).toBe(0);
    // mean depth difference from the answer's outline, over the answer's depth: not the answer
    expect(r.leak, 'the break must not be the answer').toBeGreaterThan(0.1);
    expect(Math.abs(r.wTop - r.throat), 'the top of the hole is the width of the piece').toBeLessThan(r.throat * 0.12);
    expect(r.wMid, 'a seated break, not a flat box: still open at 40px').toBeGreaterThan(r.throat * 0.3);
  });

  test('the right piece goes to the slot cut for it, and the break resolves to its outline', async ({ page }) => {
    test.skip(mode === 'off', 'the notch experiment is off');
    await boot(page, { fast: 2 });
    await force(page, 'GLACIER_BREAK_1');
    await waitState(page, 'PHASE_ACTIVE', 40_000);
    await page.waitForFunction(() => { const L = window.iceAgeGame.debug().l1; return L && L.shapes.some(s => s.state === 'hang' && s.y > 400); }, null, { timeout: 20_000 });
    const want = await page.evaluate(() => window.iceAgeGame.debug().l1.unfilled[0]);
    await cut(page, want);
    await waitState(page, ['PHASE_SUCCESS', 'PHASE_DONE', 'PHASE_RUN'], 20_000);
    await page.waitForFunction(() => { const G = window.iceAgeGame.debug(); return (G.gapsThisPhase || []).some(g => g.pieces && g.pieces.length); }, null, { timeout: 20_000 });
    await page.waitForFunction(() => window.iceAgeGame._notchReveal(0) >= 1, null, { timeout: 5_000 });
    const r = await page.evaluate(() => {
      const g = window.iceAgeGame, G = g.debug();
      const gap = G.gapsThisPhase.find(x => x.pieces && x.pieces.length);
      const piece = gap.pieces[0]; const slot = gap.slots.find(s => s.kind === piece.kind);
      return { pieceKind: piece.kind, slotKind: slot && slot.kind, sameX: slot ? Math.abs(piece.cx - (slot.x0 + slot.x1) / 2) : 1e9,
               notchFit: slot && slot.notch && slot.notch.fit, pieceFit: piece.fit, leak: g._notchLeak(0) };
    });
    expect(r.slotKind).toBe(r.pieceKind);
    expect(r.sameX).toBeLessThan(1);
    expect(Math.abs(r.notchFit - r.pieceFit), 'the notch and the plug share one fit').toBeLessThan(0.001);
    expect(r.leak, 'resolved to the answer outline').toBeLessThan(0.02);
  });
});
