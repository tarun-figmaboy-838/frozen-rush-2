/* THE TEXT FITS, AND NOTHING IS HALF EMPTY. Asked for: the instruction panel and the dialogue
   box must fit their text with no dead space. The sign is nowrap, so the check is that every
   phase sentence sits inside the plank's safe box; the bubble wraps, so the check is that the
   box hugs the widest line it wrapped to and the air above and below the words matches. */
import { test, expect } from '@playwright/test';
import { boot, force, waitState } from './helpers.mjs';

test.describe('the text fits its panel', () => {
  test.setTimeout(120_000);

  test('every instruction sentence sits inside the plank, on one line, centred', async ({ page }) => {
    await boot(page, { fast: 2 });
    const sentences = await page.evaluate(async () => (await import('/js/engine.js')).CFG.levelOne.phases.map(p => p.instruction));
    expect(sentences.length).toBeGreaterThan(0);
    await force(page, 'GLACIER_BREAK_1');
    /* WAIT FOR THE QUESTION, not merely for the intro. The intro now arrives in beats and the
       sign is held back until its own beat (see engine PHASE_INTRO), so measuring during beat 0
       reads an empty panel. PHASE_ACTIVE has the sign up and stays put until the puzzle is
       solved, which is what makes the measuring below deterministic. (Pausing instead was tried
       and is wrong: the HUD is pushed from the game loop, so a paused game never picks up the
       next sentence.) */
    await waitState(page, 'PHASE_ACTIVE', 60_000);
    for (const s of sentences) {
      const m = await page.evaluate(async sen => {
        const G = window.iceAgeGame.debug();
        G.instruction = sen; G.instrHold = 999999;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const pill = document.getElementById('instruction-pill'), tx = document.getElementById('instruction-text');
        const pr = pill.getBoundingClientRect(), tr = tx.getBoundingClientRect();
        const cs = getComputedStyle(pill);
        const pad = { l: parseFloat(cs.paddingLeft), r: parseFloat(cs.paddingRight), t: parseFloat(cs.paddingTop), b: parseFloat(cs.paddingBottom) };
        const stage = document.getElementById('stage').getBoundingClientRect();
        return {
          shown: tx.textContent, lines: tx.getClientRects().length,
          overflow: tx.scrollWidth - tx.clientWidth,
          spillL: (pr.left + pad.l) - tr.left, spillR: tr.right - (pr.right - pad.r),
          spillT: (pr.top + pad.t) - tr.top, spillB: tr.bottom - (pr.bottom - pad.b),
          offCentre: Math.abs((tr.left + tr.right) / 2 - (pr.left + pr.right) / 2),
          stageFrac: pr.width / stage.width, textW: tr.width
        };
      }, s);
      const noun = /\bthe\s+([a-z]+)/i.exec(s);
      expect(m.shown.toLowerCase(), s).toContain(noun[1].toLowerCase());
      expect(m.lines, `${s}: one line`).toBe(1);
      expect(m.overflow, `${s}: nothing clipped`).toBeLessThanOrEqual(1);
      for (const k of ['spillL', 'spillR', 'spillT', 'spillB']) expect(m[k], `${s}: ${k} inside the wood`).toBeLessThanOrEqual(1);
      expect(m.offCentre, `${s}: centred on the plank`).toBeLessThan(4);
      expect(m.stageFrac, `${s}: the plank stays off the stage edges`).toBeLessThan(0.9);
      expect(m.textW, `${s}: the words are actually laid out`).toBeGreaterThan(40);
    }
  });

  test('the dialogue box hugs its words, with matching air above and below', async ({ page }) => {
    await boot(page, { tutorial: true, skipScreens: true });
    const measure = () => page.evaluate(() => {
      const b = document.getElementById('tut-bubble'), tx = document.getElementById('tut-text');
      const cs = getComputedStyle(b), stt = getComputedStyle(tx);
      const pad = { l: parseFloat(cs.paddingLeft), r: parseFloat(cs.paddingRight), t: parseFloat(cs.paddingTop), b: parseFloat(cs.paddingBottom) };
      const sr = document.getElementById('stage').getBoundingClientRect(), br = b.getBoundingClientRect();
      const ws = [...tx.querySelectorAll('.w')].map(w => ({ l: w.offsetLeft, r: w.offsetLeft + w.offsetWidth, t: w.offsetTop }));
      const tops = [...new Set(ws.map(w => w.t))];
      const widest = Math.max(0, ...tops.map(t => { const g = ws.filter(w => w.t === t); return Math.max(...g.map(x => x.r)) - Math.min(...g.map(x => x.l)); }));
      const c = document.createElement('canvas').getContext('2d');
      c.font = stt.fontWeight + ' ' + stt.fontSize + ' ' + stt.fontFamily;
      const m = c.measureText('Hxdp');
      const fs = parseFloat(stt.fontSize), lh = parseFloat(stt.lineHeight);
      const asc = m.fontBoundingBoxAscent || fs * 0.9, desc = m.fontBoundingBoxDescent || fs * 0.3, cap = m.actualBoundingBoxAscent || fs * 0.72;
      const hl = (lh - (asc + desc)) / 2;
      return {
        text: tx.textContent, nLines: tops.length, boxW: b.offsetWidth, widest,
        deadX: b.offsetWidth - pad.l - pad.r - widest,
        airTop: pad.t + hl + (asc - cap), airBottom: pad.b + hl + desc,
        // the width fitBubble GAVE the shape: its rect carries the pop scale and the wobble's rotation
        svgW: parseFloat(document.getElementById('tut-shape').style.width) || 0,
        overflowY: tx.scrollHeight - tx.clientHeight, fontPx: fs,
        outLeft: sr.left - br.left, outRight: br.right - sr.right, stageW: sr.width
      };
    });
    /* SETTLED, NOT MID-POP. The box arrives through a 380ms scale animation and the words rise
       one after another, so a measurement taken on the frame the sentence appears catches the
       shape layer part-way through being fitted. */
    const line = async re => {
      await page.waitForFunction(r => { const l = document.getElementById('tutorial'), tx = document.getElementById('tut-text'); return !!(l && !l.hidden && tx && new RegExp(r).test(tx.textContent)); }, re, { timeout: 40_000 });
      await page.waitForTimeout(700);
    };

    await line('This is Momo');
    const first = await measure();          // the first sentence of line 1, on its own
    await line('Help Momo cross');
    const second = await measure();

    for (const m of [first, second]) {
      expect(m.widest, `${m.text}: words laid out`).toBeGreaterThan(40);
      // 20 is the top of hugWords' slack ladder: the smallest width that keeps the line count
      expect(m.deadX, `${m.text}: no empty yellow beside the words`).toBeLessThanOrEqual(20);
      expect(m.deadX, `${m.text}: and the box is not narrower than its words`).toBeGreaterThanOrEqual(-2);
      expect(m.outLeft, `${m.text}: no edge off the left of the stage`).toBeLessThanOrEqual(1);
      expect(m.outRight, `${m.text}: no edge off the right of the stage`).toBeLessThanOrEqual(1);
      expect(m.boxW, `${m.text}: and it does not swallow the stage`).toBeLessThanOrEqual(m.stageW * 0.78);
      expect(m.overflowY, `${m.text}: nothing clipped`).toBeLessThanOrEqual(1);
      expect(Math.abs(m.airTop - m.airBottom), `${m.text}: air above vs below`).toBeLessThanOrEqual(Math.max(2, m.fontPx * 0.06));
      expect(Math.abs(m.svgW - m.boxW), `${m.text}: the yellow follows the box`).toBeLessThanOrEqual(2);
    }
  });

  test('a line finishes before anything moves on: all its words, its voice, then a pause', async ({ page }) => {
    /* The whole of line 1 plus the start of line 2 is about eight seconds of real time, and
       this runs it at whatever speed the host renders — give it room rather than reporting a
       slow machine as a broken gate. */
    test.setTimeout(180_000);
    /* The rule (asked for): a tutorial line is not finished when its last word appears and it
       is not finished when the voice stops — it is finished when BOTH have happened, and then
       it is held complete on screen for a reading pause. Nothing may advance before that, the
       game stays frozen through it, and no idle hint may start.

       Measured on line 1, which is the one that carries two sentences and the longest clip. */
    await boot(page, { tutorial: true, skipScreens: true, sound: true });
    await page.evaluate(() => window.iceAgeGame.sfx('ui'));            // the gesture the context needs
    const r = await page.evaluate(async () => {
      const g = window.iceAgeGame, tx = () => document.getElementById('tut-text');
      const layer = () => document.getElementById('tutorial');
      const shown = () => (!layer() || layer().hidden || !tx()) ? '' : tx().textContent.trim();
      const seen = []; let last = null, voOn = false, voEnd = -1, everUnpaused = false, everHand = false;
      const t0 = performance.now();
      while (performance.now() - t0 < 90000) {
        await new Promise(res => requestAnimationFrame(res));
        const t = (performance.now() - t0) / 1000;
        const s = shown(), v = g._voice();
        if (s !== last) { seen.push({ t, s }); last = s; }
        if (v.saying) voOn = true;
        if (voOn && !v.saying && voEnd < 0) voEnd = t;
        // while line 1 is up the world must be frozen and no hand may appear
        if (s && /Momo|friend/.test(s)) { if (!g.isPaused()) everUnpaused = true; if (g.debug().handHint) everHand = true; }
        // line 1's two sentences, then whatever replaces them — that third event is the gate
        if (seen.filter(x => x.s).length >= 3 && voEnd > 0) break;
      }
      return { seen: seen.map(x => ({ t: +x.t.toFixed(2), s: x.s })), voEnd: +voEnd.toFixed(2), everUnpaused, everHand,
               ctx: g._voice().ctx };
    });
    const first = r.seen.find(x => x.s === 'This is Momo.');
    const second = r.seen.find(x => x.s === 'He needs to find his friend.');
    const next = r.seen.find(x => x.t > (second ? second.t : 0) && x.s !== 'He needs to find his friend.');
    expect(first, 'the first sentence is shown on its own').toBeTruthy();
    expect(second, 'then the second, on its own').toBeTruthy();
    expect(second.t, 'the second follows the first').toBeGreaterThan(first.t);
    /* THE READING PAUSE, when there was a voice to wait for. Without one — muted, blocked,
       or a machine too slow to reach the end of the line inside the budget — the pause cannot
       be measured here, and the test says so rather than passing on an assumption. What is
       still checked in that case is the part that does not need audio: the sentences arrived
       in order, the world stayed frozen, and no hint appeared. */
    if (r.ctx === 'running' && r.voEnd > 0 && next) {
      expect(next.t - r.voEnd, 'the finished line is held after the voice stops').toBeGreaterThanOrEqual(0.9);
    } else {
      console.log('reading pause NOT MEASURED here (voice ctx=' + r.ctx + ', voEnd=' + r.voEnd + ', a third event seen: ' + !!next + ')');
    }
    expect(r.everUnpaused, 'the world is frozen for the whole of the line').toBe(false);
    expect(r.everHand, 'and no idle hint starts over it').toBe(false);
  });

  test('rapid taps cannot skip a line, duplicate a step, or move the game on', async ({ page }) => {
    /* A child taps because a finger is on the screen. Twelve taps during a line must change
       nothing at all: not the sentence, not the step, not the clock. */
    await boot(page, { tutorial: true, skipScreens: true });
    await page.waitForFunction(() => /This is Momo/.test(document.getElementById('tut-text').textContent), null, { timeout: 60_000 });
    const before = await page.evaluate(() => ({ st: window.iceAgeGame.state(), t: window.iceAgeGame.debug().t,
                                                text: document.getElementById('tut-text').textContent }));
    const box = await page.locator('#stage').boundingBox();
    for (let i = 0; i < 12; i++) await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.35, { delay: 8 });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ st: window.iceAgeGame.state(), t: window.iceAgeGame.debug().t,
                                               text: document.getElementById('tut-text').textContent,
                                               dialogue: window.iceAgeGame.debug().dialogue }));
    expect(after.st, 'the state did not move').toBe(before.st);
    expect(after.t, 'the game clock did not move: it is frozen').toBeCloseTo(before.t, 2);
    /* STILL ON LINE 1. Not "the same sentence": the line is delivered a sentence at a time and
       the second one arrives on its own clock, which is the line PLAYING, not a tap skipping
       it. What a skip would look like is the tutorial jumping to a later line — so the text
       must still be one of line 1's two sentences. */
    expect(['This is Momo.', 'He needs to find his friend.'],
           'the taps did not jump the tutorial past line 1').toContain(after.text.trim());
    expect(after.dialogue, 'the engine knows a line is up').toBe(true);
  });

  test('muted, and with the voice throwing, the tutorial still shows every line and never hangs', async ({ page }) => {
    /* The completion gate waits for the text AND the voice — so the failure mode to rule out
       is a line that waits for a voice that will never come. It cannot happen by construction
       (api.say returns a LENGTH, or 0 when it will not be heard; nothing subscribes to an
       'ended' event) and this holds that construction from both sides:

         MUTED    - sound off, which is how every test in this suite boots.
         THROWING - say() replaced with a function that throws, which is what a broken decode
                    or a revoked context looks like from the tutorial's side.

       In both cases the lines must still arrive, in order, and the tutorial must still reach
       the ask. A deadlock would show up as the first line staying on screen for ever. */
    test.setTimeout(180_000);
    await boot(page, { tutorial: true, skipScreens: true });        // sound: false by default
    await page.evaluate(() => {
      const g = window.iceAgeGame;
      g.say = () => { throw new Error('audio is gone'); };           // the harshest failure
    });
    const seen = await page.evaluate(async () => {
      const g = window.iceAgeGame, out = []; let last = null;
      const t0 = performance.now();
      while (performance.now() - t0 < 60000) {
        await new Promise(r => requestAnimationFrame(r));
        const l = document.getElementById('tutorial'), tx = document.getElementById('tut-text');
        const s = (!l || l.hidden || !tx) ? '' : tx.textContent.trim();
        if (s && s !== last) { out.push({ t: +((performance.now() - t0) / 1000).toFixed(2), s }); last = s; }
        if (out.length >= 5) break;
      }
      return { out, vo: g._voice().said.slice(0, 4) };
    });
    const lines = seen.out.map(o => o.s);
    // it got past the first sentence, and past the first LINE: no line is waiting on a voice
    expect(lines.length, 'the tutorial kept moving with no audio: ' + JSON.stringify(lines)).toBeGreaterThanOrEqual(4);
    expect(lines[0]).toBe('This is Momo.');
    expect(lines[1]).toBe('He needs to find his friend.');
    expect(lines).toContain('Help Momo cross the Frozen Pass!');
    // and each one was on screen long enough to read, rather than flashing past
    for (let i = 1; i < seen.out.length; i++) {
      expect(seen.out[i].t - seen.out[i - 1].t, 'sentence ' + i + ' was readable').toBeGreaterThan(0.6);
    }
  });

  test("the dialogue's tail stays on the mammoth's head", async ({ page }) => {
    /* Measured off the delivered run sheet: his crown is 362px above the foot line and 86px
       right of his own x (tutorial.js: HEAD_UP / HEAD_RIGHT). The bubble is placed so its
       tail tip touches that point, and it is read from the LIVE player every frame, so it
       holds through his movement and through a change of sheet. */
    await boot(page, { tutorial: true, skipScreens: true });
    await page.waitForFunction(() => /This is Momo/.test(document.getElementById('tut-text').textContent), null, { timeout: 60_000 });
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const st = document.getElementById('stage').getBoundingClientRect();
      const shape = document.getElementById('tut-shape').getBoundingClientRect();
      const box = document.getElementById('tut-bubble').getBoundingClientRect();
      const p = window.iceAgeGame._player();
      const sx = x => (x - st.left) / st.width * 1920, sy = y => (y - st.top) / st.height * 1080;
      return { headX: p.drawX + 86, headY: p.feetY - 362,
               tipX: sx(shape.left + shape.width / 2), tipY: sy(shape.bottom),
               boxTop: sy(box.top), boxBottom: sy(box.bottom), stageW: st.width };
    });
    // the tail's tip lands on the crown, within a few stage px at any stage size
    expect(Math.abs(m.tipX - m.headX), 'the tail is over his head, not beside him').toBeLessThan(24);
    expect(Math.abs(m.tipY - m.headY), 'and it touches the top of it').toBeLessThan(24);
    // and the box sits ABOVE the head, so it cannot cover his eyes
    expect(m.boxBottom, 'the box is clear of his head').toBeLessThanOrEqual(m.headY + 2);
    expect(m.boxTop, 'and it is on the stage').toBeGreaterThan(0);
  });

  test('a line arrives one sentence at a time, never as a paragraph', async ({ page }) => {
    /* Asked for: shorter sentences, in sequence, like comic dialogue. "This is Momo. He needs
       to find his friend." used to land as one block of text — a paragraph in a speech bubble,
       which is the one thing a five-year-old will not read. It is split at its own full stops
       now (Tutorial.beats) and the sentences take the box in turn.

       What is held here is the SEQUENCE: each sentence is on screen by itself, in script order,
       and the two halves are never up together. The words are not changed by the split, so the
       recording and docs/VO-SCRIPT.md still match — a separate test holds that. */
    await boot(page, { tutorial: true, skipScreens: true });
    const seen = await page.evaluate(async () => {
      const out = [];
      const tx = document.getElementById('tut-text'), layer = document.getElementById('tutorial');
      const t0 = performance.now();
      while (performance.now() - t0 < 14000) {
        await new Promise(r => requestAnimationFrame(r));
        if (!layer || layer.hidden || !tx) continue;
        const t = tx.textContent.trim();
        if (t && t !== out[out.length - 1]) out.push(t);
        if (out.includes('He needs to find his friend.') && out.length > 2) break;
      }
      return out;
    });

    const iFirst = seen.indexOf('This is Momo.');
    const iSecond = seen.indexOf('He needs to find his friend.');
    expect(iFirst, 'the first sentence is shown on its own').toBeGreaterThanOrEqual(0);
    expect(iSecond, 'and then the second one is').toBeGreaterThan(iFirst);
    // the whole line never appears as one block, which is the thing that was asked to stop
    expect(seen.some(t => /This is Momo\..*friend/.test(t)), 'the two are never up together').toBe(false);
    // and every sentence that arrives is a short one
    for (const t of seen) expect(t.length, `"${t}" is a sentence, not a paragraph`).toBeLessThan(46);
  });
});
