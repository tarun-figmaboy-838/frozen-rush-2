/* THE VOICE, AND THE ORDER OF THE CROSSING. The owner recorded all sixteen lines as one take;
   the game cuts it into windows and speaks each at its moment, with the words revealing in step.
   And the crossing's order: the hole, then "Oh no!", then the teaching line ON THE PLANK while
   the pieces come down, then the question, then the hand. */
import { test, expect } from '@playwright/test';
import { boot, force, waitState } from './helpers.mjs';
import { readFileSync } from 'node:fs';

test.describe('the voice and the crossing order', () => {
  test.setTimeout(300_000);

  test('fourteen windows, inside the take, none overlapping, one per scripted line', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const m = await import('/js/engine.js');
      const V = m.CFG.vo;
      const ac = new AudioContext();
      const buf = await ac.decodeAudioData(await (await fetch('/' + V.src)).arrayBuffer());
      return { src: V.src, dur: +buf.duration.toFixed(2), lines: Object.entries(V.lines) };
    });
    expect(r.src).toBe('assets/audio/vo-lines.mp3');
    /* FOURTEEN, not sixteen. 'win-title' and 'win-sub' were cut with the ending banner that
       showed them — the ending is the dance and the camera pushes in on it, so nothing speaks
       over the top. The seconds of audio are still in the take; no window points at them. */
    expect(r.lines.length, 'fourteen lines').toBe(14);
    const ordered = r.lines.slice().sort((a, b) => a[1][0] - b[1][0]);
    let prevEnd = 0;
    for (const [id, [at, dur]] of ordered) {
      expect(at, `${id} starts inside the take`).toBeGreaterThanOrEqual(0);
      expect(at + dur, `${id} ends inside the take`).toBeLessThanOrEqual(r.dur + 0.01);
      expect(dur, `${id} is a real line`).toBeGreaterThan(0.4);
      expect(at, `${id} overlaps the line before it`).toBeGreaterThanOrEqual(prevEnd - 0.001);
      prevEnd = at + dur;
    }
    // every id in the table is a line in the script, and every scripted line has a window
    const doc = readFileSync('docs/VO-SCRIPT.md', 'utf8');
    for (const [id] of r.lines) expect(doc, `${id} is not in the script`).toContain(id.replace(/^sign-/, 'sign-').replace(/^tut-/, 'tut-'));
  });

  test('the take loads and a line plays, and each word lands where it is spoken', async ({ page }) => {
    await boot(page, { sound: true, tutorial: true, skipScreens: true });
    await page.evaluate(() => window.iceAgeGame.sfx('ui'));         // unlocks the context
    await page.waitForFunction(() => window.iceAgeGame._voice().ready, null, { timeout: 60_000 });
    // 14 since the ending stopped speaking: win-title and win-sub went with the banner
    expect((await page.evaluate(() => window.iceAgeGame._voice())).lines).toBe(14);
    const r = await page.evaluate(async () => {
      const m = await import('/js/engine.js');
      /* THE SECOND SENTENCE, not the whole line. The box shows one sentence at a time now
         (Tutorial.beats), so the whole line is never in it; this used to wait for the whole
         line and timed out. The second sentence is the one worth measuring: it carries the
         line's key word and most of its clip, and its words have to arrive across ITS share
         of the recording — the tail of the clip — not be up before the voice reaches them. */
      const want = 'He needs to find his friend.';
      const t0 = Date.now();
      while (Date.now() - t0 < 120000 && document.getElementById('tut-text').textContent.trim() !== want) await new Promise(res => setTimeout(res, 80));
      await new Promise(res => setTimeout(res, 200));
      const el = document.getElementById('tut-text');
      const ws = [...el.querySelectorAll('.w')];
      const delays = ws.map(w => parseFloat(getComputedStyle(w).animationDelay));
      /* w0 is the index, into the LINE's baked onsets, of this sentence's first word —
         published by setWords precisely so a check like this compares like with like. */
      const w0 = Number(el.dataset.w0);
      const onsets = m.CFG.vo.lines['tut-1-meet'][2];
      return { words: ws.length, delays, w0, onsets, shown: el.textContent.trim() };
    });
    expect(r.shown, 'the second sentence is up on its own').toBe('He needs to find his friend.');
    expect(r.words, 'the sentence is set word by word').toBe(6);
    expect(r.w0, 'and it knows which word of the line it starts at').toBe(3);

    /* THE GAPS ARE THE RECORDING'S GAPS. setWords anchors the reveal to where the voice has
       actually reached when the sentence is written, so the leading words can be clamped to
       0 — the voice is already past them and they belong on screen at once. Everything after
       that clamped prefix must sit exactly where it is spoken. */
    const spoken = r.onsets.slice(r.w0, r.w0 + r.words);
    expect(spoken.length, 'the take has an onset for every word of the sentence').toBe(r.words);

    /* ONE ANCHOR EXPLAINS EVERY WORD. setWords writes delay = max(0, onset - base), where
       base is where the voice had actually reached when the sentence was written. So for
       every word that is not clamped to zero, onset - delay must come back to the SAME base
       — that is the whole of "each word lands where it is spoken", and unlike a gap check it
       also covers the first unclamped word, whose gap the anchor legitimately eats into. */
    const bases = [];
    for (let i = 0; i < r.words; i++) if (r.delays[i] > 0) bases.push(spoken[i] - r.delays[i]);
    expect(bases.length, 'most of the sentence is still ahead of the voice when it is written')
      .toBeGreaterThan(2);
    const spread = Math.max(...bases) - Math.min(...bases);
    /* 60ms: onsets are baked at a 10ms hop and delays are rounded into CSS. Nothing a
       listener could hear, and far tighter than the ~240ms the old estimate allowed. */
    expect(spread, 'every word points at the same moment in the recording: ' + bases.map(b => b.toFixed(3)).join(' '))
      .toBeLessThan(0.06);

    const base = bases[0];
    /* The anchor only ever runs FORWARD from the sentence's first word — it is where the
       voice got to, so it cannot be earlier than where the sentence began. */
    expect(base, "the anchor is at or after the sentence first word").toBeGreaterThan(spoken[0] - 0.06);
    // and a word is clamped to zero only when the voice really is already past it
    for (let i = 0; i < r.words; i++) {
      if (r.delays[i] === 0) expect(spoken[i], 'word ' + (i + 1) + ' is only pinned up front if it is already spoken').toBeLessThan(base + 0.06);
    }
    // the reveal finishes inside the clip it is spoken over, never after it
    expect(r.delays[r.words - 1], 'the last word lands before the voice leaves the sentence')
      .toBeLessThan(spoken[r.words - 1] - spoken[0] + 0.06);
  });

test('a word appears when it is spoken, and holds when the voice does', async ({ page }) => {
    await boot(page, { sound: true, tutorial: true, skipScreens: true });
    await page.evaluate(() => window.iceAgeGame.sfx('ui'));            // unlocks the context
    await page.waitForFunction(() => window.iceAgeGame._voice().ready, null, { timeout: 60_000 });
    await page.waitForFunction(() => document.querySelectorAll('.tut-text .w').length > 0, null, { timeout: 60_000 });

    /* TWO CLOCKS, COMPARED. The recording reports where it is; the words are revealed by CSS
       on wall clock. Nothing here reads the delays this code wrote — that would only prove
       the assignment happened. What is counted is how many words the RECORDING has reached
       against how many the SCREEN has started, which is the thing a player sees. */
    const trail = await page.evaluate(async () => {
      const g = window.iceAgeGame, id = 'tut-1-meet';
      const all = g.voWords(id);
      if (!all) return { noTimings: true };
      const rows = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 5000) {
        const at = g.voAt(id);
        const ws = [...document.querySelectorAll('.tut-text .w')];
        if (at >= 0 && ws.length) {
          const started = ws.filter(w => {
            const a = w.getAnimations()[0];
            if (!a) return true;
            return (a.currentTime || 0) >= (a.effect.getComputedTiming().delay || 0);
          }).length;
          /* counted INSIDE the sentence on screen: w0 is which word of the line it starts at */
          const w0 = +(document.querySelector('.tut-text').dataset.w0 || 0);
          const spoken = all.slice(w0, w0 + ws.length).filter(v => v <= at + 0.001).length;
          rows.push({ at, spoken, started, of: ws.length });
        }
        await new Promise(r => setTimeout(r, 60));
      }
      return { rows };
    });
    expect(trail.noTimings, 'the take has per-word timings baked').toBeFalsy();
    expect(trail.rows.length, 'the line was sampled while it played').toBeGreaterThan(8);

    /* The reveal may never RUN AHEAD of the voice: a word on screen that has not been said
       is the fault this replaced (an even step outruns the long words). Behind is allowed by
       at most one word — each word takes 460ms to arrive, so at any instant the newest one
       is still landing. Counted within the sentence on screen, which is what the beat holds. */
    let ahead = 0, behind = 0;
    for (const r of trail.rows) {
      const spokenHere = r.spoken;
      if (r.started > spokenHere + 1) ahead++;
      if (spokenHere - r.started > 1) behind++;
    }
    console.log('WORD SYNC samples=' + trail.rows.length + ' ahead=' + ahead + ' behind=' + behind);
    expect(ahead, 'the text never gets ahead of the voice').toBe(0);
    expect(behind / trail.rows.length, 'and rarely more than one word behind it').toBeLessThan(0.34);

  });

  test('a pause stops the words with the voice, and both go on together', async ({ page }) => {
    await boot(page, { sound: true, tutorial: true, skipScreens: true });
    await page.evaluate(() => window.iceAgeGame.sfx('ui'));
    await page.waitForFunction(() => window.iceAgeGame._voice().ready, null, { timeout: 60_000 });
    await page.waitForFunction(() => document.querySelectorAll('.tut-text .w').length > 0, null, { timeout: 60_000 });

    /* PAUSED WHILE A LINE IS STILL BEING SPOKEN — the only moment this can be tested. The
       words are revealed by CSS on wall clock and the voice by the audio clock, so a pause
       that stops one and not the other lands the rest of the sentence out of step. The
       reveal is parked from what the audio reports about itself, so this asks the audio
       too: -1 means it is genuinely not running, not merely holding a stale position.

       The SAME span is timed before and after. Sampling ':last-child' across a sentence
       change measures two different elements and reports a drift that is really a swap. */
    const held = await page.evaluate(async () => {
      const g = window.iceAgeGame;
      const span = document.querySelector('.tut-text .w:last-child');
      const anim = span && span.getAnimations()[0];
      if (!anim) return { noAnim: true };
      g.setPaused(true); g.suspendAudio();
      await new Promise(r => setTimeout(r, 400));       // long enough for a tick to park it
      const a = anim.currentTime || 0;
      const waiting = document.querySelector('.tut-text').classList.contains('waiting');
      const voice = g.voAt(g.debug().tutVoId || 'tut-1-meet');
      await new Promise(r => setTimeout(r, 800));
      const b = anim.currentTime || 0;
      g.setPaused(false); g.resumeAudio();
      return { drift: b - a, waiting, voice };
    });
    console.log('PAUSED ' + JSON.stringify(held));
    expect(held.noAnim, 'a word was animating to begin with').toBeFalsy();
    expect(held.voice, 'the voice reports that it is not running').toBe(-1);
    expect(held.waiting, 'so the reveal is parked').toBe(true);
    expect(Math.abs(held.drift), 'and the words do not move during the pause').toBeLessThan(20);

    // and it comes back
    await page.waitForFunction(() => !document.querySelector('.tut-text').classList.contains('waiting'),
      null, { timeout: 20_000 });
  });

  test('a phase question is spoken once, and its id comes from its own sentence', async ({ page }) => {
    await boot(page, { sound: true, fast: 1 });
    const ids = await page.evaluate(async () => {
      const m = await import('/js/engine.js'), g = window.iceAgeGame;
      return m.CFG.levelOne.phases.map(p => ({ text: p.instruction, id: g.signVoId(p.instruction), known: !!m.CFG.vo.lines[g.signVoId(p.instruction)] }));
    });
    expect(ids.length).toBe(7);
    for (const p of ids) expect(p.known, `${p.text} -> ${p.id} has no recorded line`).toBe(true);
    // and it is not spoken twice for the same phase
    await force(page, 'GLACIER_BREAK_1');
    await waitState(page, 'PHASE_ACTIVE', 120_000);
    const said = await page.evaluate(() => window.iceAgeGame.debug().saidQuestion);
    expect(said).toBe('sign-triangle');
  });

  test('every question is actually spoken, first and last included', async ({ page }) => {
    /* THE FIRST ONE WAS NOT. The only call was on entering PHASE_ACTIVE, and in the tutorial the
       teaching line still had the plank at that moment, so "Cut the TRIANGLE." — the first
       question in the game — was never said. Measured over a playthrough: fifteen of sixteen. */
    await boot(page, { sound: true, fast: 2 });
    await page.evaluate(() => window.iceAgeGame.sfx('ui'));
    await page.waitForFunction(() => window.iceAgeGame._voice().ready, null, { timeout: 60_000 });
    const seen = [];
    for (const phase of [0, 3, 6]) {
      await page.evaluate(p => { const g = window.iceAgeGame, G = g.debug(); G.phase = p; G.saidQuestion = ''; g._force('GLACIER_BREAK_1'); }, phase);
      await waitState(page, 'PHASE_ACTIVE', 120_000);
      await page.waitForFunction(() => !!window.iceAgeGame.debug().saidQuestion, null, { timeout: 30_000 });
      seen.push(await page.evaluate(() => ({ id: window.iceAgeGame.debug().saidQuestion,
                                             heard: window.iceAgeGame._voice().said.slice(-1)[0] })));
    }
    expect(seen.map(s => s.id)).toEqual(['sign-triangle', 'sign-hexagon', 'sign-hexagons']);
    // and nothing was skipped for want of a window, a mute or an unloaded take
    for (const s of seen) expect(s.heard, `${s.id} was not heard: ${s.heard}`).toBe(s.id);
  });

  test('the crossing runs in order: the hole, the line on the plank, then the question, then the hand', async ({ page }) => {
    await boot(page, { tutorial: true, skipScreens: true, fast: 1 });
    const plank = () => page.evaluate(() => {
      const el = document.getElementById('instruction'), t = document.getElementById('instruction-text');
      return (el && !el.hidden && !el.classList.contains('leaving')) ? { text: t.textContent.trim(), banner: el.classList.contains('banner') } : { text: '', banner: false };
    });
    // through the jump
    await page.waitForFunction(() => /Tap to jump/.test(document.getElementById('tut-text').textContent), null, { timeout: 200_000 });
    await page.evaluate(async () => {
      const g = window.iceAgeGame; const t0 = Date.now();
      while (Date.now() - t0 < 200000 && !/GLACIER_BREAK_1|PHASE_/.test(g.debug().state)) {
        const G = g.debug(); const L = g._obstacles().list.filter(o => !o.passed);
        if (L.length && L[0].x - G.worldX < 640 && L[0].x - G.worldX > 380 && g.mammothState() === 'RUN') g.jump();
        await new Promise(r => setTimeout(r, 40));
      }
    });
    // "Oh no!" comes with nothing on the plank
    await page.waitForFunction(() => /path is broken/.test(document.getElementById('tut-text').textContent), null, { timeout: 200_000 });
    expect((await plank()).text, 'the plank is empty while the hole is described').toBe('');
    // then the teaching line, as a banner, with its own words (no key-word capitals)
    await page.waitForFunction(() => { const t = document.getElementById('instruction-text'); const el = document.getElementById('instruction'); return el && !el.hidden && /Use the right ice piece/.test(t.textContent); }, null, { timeout: 200_000 });
    const banner = await plank();
    expect(banner.banner, 'it is the banner state').toBe(true);
    expect(banner.text).toBe('Use the right ice piece to fix the path.');
    // then the plank hands back to the question, and only then does the hand sweep
    await page.waitForFunction(() => /Cut the/.test(document.getElementById('instruction-text').textContent), null, { timeout: 200_000 });
    const q = await plank();
    expect(q.text).toBe('Cut the TRIANGLE.');
    expect(q.banner, 'the question is not a banner').toBe(false);
    await page.waitForFunction(() => { const h = document.getElementById('tut-hand'), l = document.getElementById('tutorial'); return h && !h.hidden && l && !l.hidden; }, null, { timeout: 60_000 });
    // and the plank is empty again once the crossing is mended
    await page.evaluate(() => { const g = window.iceAgeGame; g._cut(g.debug().l1.unfilled[0]); });
    await waitState(page, ['PHASE_DONE', 'PHASE_RUN'], 60_000);
    await page.waitForFunction(() => !window.iceAgeGame.debug().signSay, null, { timeout: 20_000 });
    expect((await page.evaluate(() => window.iceAgeGame.debug().signSay))).toBe('');
  });

  test("two lines asked for close together are both heard whole, one after the other", async ({ page }) => {
    /* The bug the owner heard: a line asked for while another was speaking STOPPED it, so at a
       crossing the question ("Cut the TRIANGLE.") and the teaching sentence clipped each other.
       Now the second waits. Measured: the voice is on for the sum of both windows, not the first
       0.6 s of one plus the whole of the other. */
    await boot(page, { sound: true });
    await page.evaluate(() => window.iceAgeGame.sfx("ui"));
    /* READY *AND* RUNNING. ctx.resume() is asynchronous, and `ready` can already be true from
       the bytes having decoded — so a say() issued the instant `ready` turned true could land
       while the context was still suspended and be logged as "tut-6-use:ctx-suspended". That
       is a race in this harness, not the thing the test is about (two lines close together,
       both heard whole), so the context is waited for like everything else. */
    await page.waitForFunction(() => { const v = window.iceAgeGame._voice(); return v.ready && v.ctx === "running"; }, null, { timeout: 60_000 });
    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame; const m = await import("/js/engine.js");
      const marks = []; let was = false; const t0 = performance.now();
      g.say("tut-6-use");
      setTimeout(() => g.say("sign-triangle"), 600);
      while (performance.now() - t0 < 9000) {
        const s = g._voice().saying;
        if (s !== was) { marks.push({ t: performance.now() - t0, on: s }); was = s; }
        if (marks.length >= 2 && !s && performance.now() - t0 > 5500) break;
        await new Promise(r => requestAnimationFrame(r));
      }
      const L = m.CFG.vo.lines;
      return { marks, both: L["tut-6-use"][1] + L["sign-triangle"][1], log: g._voice().said.slice(-3).map(x => x.replace(/:ctx-w+$/, "")) };
    });
    const on = r.marks.filter(m => m.on).map((m, i, a) => (r.marks[r.marks.indexOf(m) + 1] || { t: 9000 }).t - m.t);
    const voiced = on.reduce((a, b) => a + b, 0) / 1000;
    expect(r.log, "the second line waited, then spoke").toEqual(["tut-6-use", "sign-triangle:after", "sign-triangle"]);
    expect(voiced, "both lines heard whole: " + voiced.toFixed(2) + "s of " + r.both.toFixed(2)).toBeGreaterThan(r.both * 0.9);
  });
});
