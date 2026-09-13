/* HUD controller — owns every DOM element outside the canvas and mirrors the
   engine's HUD state onto it. The engine never touches the DOM itself. */

import { fitBubble } from './bubble.js';

/* THE WORD THE QUESTION IS ABOUT, which is set apart in capitals and blue.
 *
 * This was /^(.*?\bthe\s+)([a-z]+?)(s?)([.!]?)$/i — everything up to "the", then ONE
 * word, then the full stop. Right for Part 1, whose questions were "Cut the TRIANGLE.";
 * wrong for every question this game now asks, because Part 2's curriculum puts an
 * adjective in front of the noun. Measured across the nine: EIGHT of them failed to
 * match and were rendered with no highlight at all. Only "Draw all the diagonals."
 * still worked, which is why it went unnoticed — the one line anybody spot-checked.
 *
 * It is the same assumption that made voIdFor() silent for the six rope crossings, and
 * it is fixed the same way: allow any number of words between "the" and the noun, and
 * highlight the LAST of them.
 *
 * Exported because the tests assert what the board renders and were carrying their own
 * copy of the old pattern — two copies of a rule is how they drifted apart in the first
 * place. A tutorial sentence is never run through this (see `_plain`/signBanner): the
 * key-word treatment is for questions. */
export const KEY_WORD = /^(.*?\bthe\s+(?:[a-z]+\s+)*)([a-z]+?)(s?)([.!]?)$/i;

export class Hud {
  /** A stage point where the zoomed canvas actually draws it. */
  static toView(view, p) {
    const k = view && view.k || 1;
    if (k <= 1.0005) return p;
    return { x: view.x + (p.x - view.x) * k, y: view.y + (p.y - view.y) * k };
  }

  constructor(root = document) {
    this.el = {
      /* hint / sound / pause are gone from the markup. The lookups stay because every
         use of them is already guarded — press() ignores a missing button, and the
         label helpers skip a null — so the pause panel's own controls keep working if
         anything ever opens it again. */
      pause: root.getElementById('btn-pause'),
      sound: root.getElementById('btn-sound'),
      sound2: root.getElementById('btn-sound2'),
      hint: root.getElementById('btn-hint'),
      restart: root.getElementById('btn-restart'),
      resume: root.getElementById('btn-resume'),
      paused: root.getElementById('paused'),
      hand: root.getElementById('hand-hint'),
      /* No jump button any more (see index.html): the stage is the control. The lookup
         is gone with it rather than kept guarded — a lookup with no user is how a dead
         element gets wired back up by the next person reading this file. */
      skipEnd: root.getElementById('btn-skip-end'),   // TEMPORARY review control
      instruction: root.getElementById('instruction'),
      pill: root.getElementById('instruction-pill'),
      text: root.getElementById('instruction-text'),
      /* No `sub` lookup: the second line on the board was removed (see index.html).
         A lookup with no user is how a dead element gets wired back up by the next
         person reading this file — the same rule the pause and hint lookups above
         are kept under, and they at least still have callers. */
      complete: root.getElementById('complete'),
      replay: root.getElementById('btn-replay'),
      /* oops and retry are gone from the markup: a crash recovers by itself now and
         there is no failure panel. The lookups are not kept "just in case" — every
         use of them went with them, and a lookup with no user is how a dead element
         gets resurrected by the next person reading this file. */
      rotate: root.getElementById('rotate'),
      trail: root.getElementById('trail'),
      trailRail: root.getElementById('trail-rail'),
      trailMomo: root.getElementById('trail-momo')
    };
    this.paused = false;
    this.lastMessage = null;
    /* THE JOURNEY CARD'S OWN STATE. `_steps` is how many platforms have been built (0
       until the engine says how many crossings there are), `_at` the platform Momo was
       last put on. -1 rather than 0, so the FIRST crossing is a real change and gets
       the card's arrival rather than being silently already-correct. `_goal` is the
       cave, kept because it is looked at on every change. */
    this._steps = 0;
    this._at = -1;
    this._goal = null;
    /* The board's one type size is measured in pixels, so it is only valid for the stage
       it was measured at — and only for the face it was measured in. A resize invalidates
       it, and so does Baloo 2 arriving after the first paint: measured in the fallback
       face the longest question needs a different ratio than it does in the real one. */
    this._onResize = () => { this._fit = null; this.checkOrientation(); this.fitInstruction(); };
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { this._fit = null; this.fitInstruction(); }).catch(() => {});
    }
  }

  /* ---------- the journey card ----------

     Nine platforms, a cave, and Momo on the platform being played. ONE number drives
     all of it — how many crossings are behind the learner — and that number comes from
     the engine (pushHud publishes `step` and `steps`). There is deliberately no second
     copy of the progress here: everything below is derived from those two integers on
     the frame they change.

       index <  step   ->  done      bright, cyan-lit
       index === step  ->  now       cyan rim, pulsing, Momo on it
       index >  step   ->  next      muted, desaturated
       step === steps  ->  the journey is over; the cave lights

     The DOM is built once for the count the engine reports rather than written out
     nine times in the markup, so adding or removing a crossing needs no change here
     and none in index.html. */

  /** Build the row for `n` crossings. Cheap to call again — it returns unless the
      count has actually changed, so the first HUD push builds it and every later one
      does nothing. */
  buildTrail(n) {
    const rail = this.el.trailRail;
    if (!rail || n <= 0 || n === this._steps) return;
    this._steps = n;
    this._at = -1;
    rail.textContent = '';
    /* PLATFORM, LINK, PLATFORM, LINK ... PLATFORM, LINK, CAVE. One link between every
       pair, and one more between the last platform and the cave, so the chain runs
       unbroken from the first step to the destination. The links carry the progress —
       there is no separate bar — so link i is the stretch from platform i to i+1. */
    for (let i = 0; i < n; i++) {
      const img = document.createElement('img');
      img.className = 'trail-node next';
      img.alt = '';
      img.src = 'assets/progress/step-locked.webp';
      rail.appendChild(img);
      const link = document.createElement('i');
      link.className = 'trail-link';
      rail.appendChild(link);
    }
    const goal = document.createElement('img');
    goal.className = 'trail-goal';
    goal.alt = '';
    goal.src = 'assets/progress/step-goal.webp';
    rail.appendChild(goal);
    this._goal = goal;
    /* Momo is a child of the row and was cleared with it — see index.html for why he
       has to be parented here and not to the card. */
    if (this.el.trailMomo) rail.appendChild(this.el.trailMomo);
  }

  /** Every platform, in order. The cave is a sibling in the same row, so it has to be
      filtered out rather than indexed past. */
  _nodes() {
    const rail = this.el.trailRail;
    return rail ? [...rail.querySelectorAll('.trail-node')] : [];
  }

  /** Put Momo on platform `i`, and run the fill out to meet him. `hop` arcs him across;
      without it he is simply placed, which is what a rebuild or a resize wants. */
  _momoTo(i, hop) {
    const momo = this.el.trailMomo;
    const nodes = this._nodes();
    if (!momo || !nodes.length) return;
    const node = nodes[Math.min(i, nodes.length - 1)];
    if (!node) return;
    /* MEASURED OFF THE PLATFORM, not computed from --node and --gap. The two would
       agree today and drift the first time either is touched, and a mammoth standing
       between two platforms is worse than no mammoth. offsetLeft is relative to the
       row, which is the offset parent of both him and the fill. */
    const mid = node.offsetLeft + node.offsetWidth / 2;
    momo.style.setProperty('--at', mid + 'px');
    momo.classList.toggle('idle', !hop);
    if (hop) {
      // restarted by hand: re-adding a class an element already has replays nothing
      momo.classList.remove('hop');
      void momo.offsetWidth;
      momo.classList.add('hop');
      momo.addEventListener('animationend', () => {
        momo.classList.remove('hop');
        momo.classList.add('idle');
      }, { once: true });
    }
  }

  /** One spark of ice over platform `i`, on the frame it is won. */
  _spark(i) {
    const rail = this.el.trailRail;
    const node = this._nodes()[i];
    if (!rail || !node) return;
    const s = document.createElement('div');
    s.className = 'trail-spark';
    s.style.left = (node.offsetLeft + node.offsetWidth / 2) + 'px';
    s.style.top = (node.offsetTop + node.offsetHeight / 2) + 'px';
    rail.appendChild(s);
    s.addEventListener('animationend', () => s.remove(), { once: true });
  }

  /** `done` crossings are behind the learner, out of `total`. `visible` is whether the
      card belongs on screen at all (it does not on the cover or the ending); `asking`
      is whether a question is up, which slides it out of the way rather than removing
      it — the two are different things and used to be the same one. */
  setTrail(done, total, visible, asking) {
    const wrap = this.el.trail;
    if (!wrap) return;
    this.buildTrail(total);
    if (!this._steps) return;

    if (!visible) { wrap.hidden = true; return; }
    if (wrap.hidden) {
      /* FIRST SHOW: put it off-stage, lay it out, then let it slide in. Revealed on the
         spot it would simply appear, which is the thing every other arrival in this
         game is written to avoid. Two frames, because `hidden` -> laid out -> animated
         cannot happen in one. */
      wrap.hidden = false;
      wrap.classList.add('away');
      this._at = -1;
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (!wrap.hidden) wrap.classList.toggle('away', !!this._asking);
        }));
      }
    }
    /* THE BOARD AND THE CARD SHARE THE LEFT BAND and are never shown together: the
       card slides out to the left as the question arrives and comes back when it
       leaves. That is what lets it sit on the board's own line (see the CSS) instead
       of being squeezed onto the one below. */
    this._asking = !!asking;
    if (!wrap.classList.contains('away') || !asking) wrap.classList.toggle('away', !!asking);

    const at = Math.min(done, this._steps);   // the platform in play; === steps when finished
    if (at === this._at) return;
    const first = this._at < 0;
    const won = !first && at > this._at;      // a crossing was just completed

    const nodes = this._nodes();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const want = i < at ? 'done' : i === at ? 'now' : 'next';
      if (n.classList.contains(want)) continue;
      n.classList.remove('done', 'now', 'next');
      n.classList.add(want);
      n.src = 'assets/progress/step-' + (want === 'next' ? 'locked' : want) + '.webp';
      /* THE ONE JUST WON gets the overshoot and the spark. Only on a real advance —
         restoring the card after a resize must not fire nine of them. */
      if (want === 'done' && won && i === at - 1) {
        n.classList.remove('just');
        void n.offsetWidth;
        n.classList.add('just');
        n.addEventListener('animationend', () => n.classList.remove('just'), { once: true });
        this._spark(i);
      }
    }

    /* THE CHAIN. Link i is the stretch from platform i to platform i+1, so it is walked
       once the learner has passed platform i — and the last one, to the cave, only when
       the journey is over. This is the progress bar: there is no separate fill. */
    const links = this.el.trailRail ? [...this.el.trailRail.querySelectorAll('.trail-link')] : [];
    links.forEach((l, i) => l.classList.toggle('done', i < at));

    /* THE CAVE WARMS AS IT IS APPROACHED and lights when it is reached. A cave glowing
       from crossing one has stopped meaning anything by crossing nine. */
    if (this._goal) {
      this._goal.classList.toggle('near', at >= this._steps - 1 && at < this._steps);
      this._goal.classList.toggle('lit', at >= this._steps);
    }

    this._at = at;
    /* After a rebuild the images may not have loaded, so the row's width is not final;
       measure on the next frame as well as now, and the second one wins. */
    this._momoTo(at, won);
    if (first && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => this._momoTo(at, false));
    }
  }

  /* Pick an icon by NAME. The mask URLs live in the stylesheet: a url() inside a
     custom property is resolved against the sheet that consumes it, not the
     document, so setting them inline resolved every glyph to /css/assets/... and
     404'd. A data attribute cannot go wrong that way. */
  setGlyph(btn, name) { if (btn) btn.dataset.icon = name; }

  /** Pause and Resume are one control, so it swaps glyph rather than moving. */
  pauseLabel(isPaused) {
    this.setGlyph(this.el.pause, isPaused ? 'play' : 'pause');
    if (this.el.pause) this.el.pause.setAttribute('aria-label', isPaused ? 'Resume' : 'Pause');
  }

  /** Sound state on both copies of the control, HUD and pause panel. */
  soundLabel(on) {
    for (const b of [this.el.sound, this.el.sound2]) {
      if (!b) continue;
      this.setGlyph(b, on ? 'sound-on' : 'sound-off');
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
    }
  }

  /* There is no verdict mark any more. A tick and a cross used to be positioned here,
     over the crossing; a right answer now throws confetti from the engine's own
     particle layer and a wrong one gets no mark at all — see cutShape(). */

  /* The idle hand. Positioned in stage coordinates converted to percentages, so it
     lands on the rope at any viewport size rather than at a fixed pixel offset. */
  updateHand(h) {
    const el = this.el.hand;
    if (!el) return;
    /* ONE HAND, EVER. The tutorial puts its own hand on the rope for the cut step
       and this idle hint fires after 13s of no input — which the tutorial spends
       waiting for exactly that swipe. So both were up together, two hands on two
       different animations demonstrating the same gesture. The tutorial’s is the
       one that stays: it is placed on the rope the step is about, and it is the
       hand the player was already being taught to follow. */
    if (this._tutHand === undefined) {
      const d = el.ownerDocument || document;
      this._tutHand = d.getElementById('tut-hand');
      this._tutLayer = d.getElementById('tutorial');
    }
    const tutoring = this._tutHand && !this._tutHand.hidden &&
                     this._tutLayer && !this._tutLayer.hidden;
    if (!h.handHint || tutoring) { if (!el.hidden) el.hidden = true; return; }
    // the demonstration hand points at a rope, so it moves with the view as well
    const p = Hud.toView(h.view, h.handHint);
    el.style.left = (p.x / 1920 * 100).toFixed(2) + '%';
    el.style.top = (p.y / 1080 * 100).toFixed(2) + '%';
    if (el.hidden) el.hidden = false;
  }

  /* THE ENDING'S BANNER. The coins are gone (see index.html): the words are the reward, so all
     this does is fit the speech shape to the box they need. */
  showWin(h) {
    /* The banner's shape is drawn for the box the words need — the same bubble as the
       tutorial's, without a tail (nobody in particular is saying it). Once now, and again
       after the pop-in has settled, because the box measures differently mid-bounce. */
    /* NO ENDING BANNER TO FIT. It was a drawn speech shape sized to its words; the whole
       panel was removed so the dance is what the ending shows. */
    if (window.Juice) {
      clearInterval(this._nudge);
      this._nudge = setInterval(() => {
        if (!this.el.complete || this.el.complete.hidden) { clearInterval(this._nudge); return; }
        try { Juice.nudge(this.el.replay); } catch (e) { clearInterval(this._nudge); }
      }, 3800);
    }
  }

  /* THE POLYGON'S NAME IS SET APART IN THE SENTENCE — "Cut the TRIANGLE", "Cut all the
     QUADRILATERALS.": the noun in capitals, heavier and in the game's key-word blue, the full
     stop kept (the owner's own wording). The engine's sentence is untouched (tests and the
     recall path read it); this is how it is shown. A sentence that does not fit the pattern
     is shown whole. */
  /** The sentence, WORD BY WORD so each can ease in (see .instruction-text .iw). The polygon's
      name keeps its `key` class — the tests and the blue styling both look for it — and the full
      stop is its own span with no space before it, so it stays tight against the name. */
  setInstruction(message) {
    const el = this.el.text;
    if (!el) return;
    const m = this._plain ? null : KEY_WORD.exec((message || '').trim());
    el.textContent = '';
    let n = 0;
    /* IN STEP WITH THE VOICE, like the dialogue: when the question is spoken the reveal is
       spread across the clip. The engine hands the seconds over in the HUD state. */
    const words = (message || '').trim().split(/\s+/).filter(Boolean).length || 1;
    // spread across the whole spoken line, measured on the last word (see Tutorial.setWords)
    /* WITHOUT A VOICE THE REVEAL WAS 0.21 SECONDS. The stagger falls back to 0.07s a
       word, so a four-word question finished revealing in 0.21s while each word's own
       ease is 420ms — every word was still animating when the last one started, which
       reads as one pop rather than as a sentence arriving. The whole point of the
       word-at-a-time treatment was invisible.
       0.16 spreads a four-word line over about half a second and a seven-word one over
       a second, which is close to the pace a recording would set. When there IS a
       recording voDur wins, exactly as before — this only changes the silent case. */
    const step = this._voDur > 0 ? Math.min(0.55, Math.max(0.07, (this._voDur * 0.82) / Math.max(1, words - 1))) : 0.16;
    const word = (text, cls, space) => {
      if (!text) return;
      if (space && el.childNodes.length) el.appendChild(document.createTextNode(' '));
      const s = document.createElement('span');
      s.className = cls;
      s.style.setProperty('--i', n++);
      s.style.setProperty('--wd', step.toFixed(3) + 's');
      s.textContent = text;
      el.appendChild(s);
    };
    if (!m) {
      for (const w of (message || '').trim().split(/\s+/)) word(w, 'iw', true);
      this.fitInstruction();
      return;
    }
    for (const w of m[1].trim().split(/\s+/)) word(w, 'iw', true);
    word((m[2] + m[3]).toUpperCase(), 'iw key', true);
    word(m[4], 'iw', false);                                  // the sentence keeps its full stop
    this.fitInstruction();
  }

  /* THE SENTENCE IS FITTED TO THE BOARD — the board is never fitted to the sentence.
   *
   * It used to be the other way round: the plank was shrink-to-fit, so its width was
   * whatever the words needed. The middle of the plank is ONE PIECE OF ART stretched
   * across that width (plank-m, 1498x478, see the background rules), so the wood grain
   * and the snow along the top were scaled horizontally by however long the question
   * happened to be. Measured across the nine: between 1.40x and 2.50x, a different
   * amount every time. That is the "squeezed, not natural" report — the grain smears,
   * the snowdrifts stretch into streaks, and because it changes per question the sign
   * never reads as the same physical object twice.
   *
   * A real sign is one plank. So the plank is now a fixed width (see the CSS) and the
   * TYPE gives way instead, which is what signwriting has always done: the stretch is
   * one constant value for every question, and a long sentence is simply set smaller on
   * the same board.
   *
   * Measured rather than guessed, because the font is loaded late and its metrics are
   * not knowable from the string: the words are laid out at full size, the overflow is
   * read off the layout, and --fit scales the type down only if there is one. Most
   * questions need no scaling at all and get --fit 1.
   *
   * scrollWidth, not getBoundingClientRect: the words animate in on a transform and a
   * measured rect would be whatever the scale was on that frame. scrollWidth is layout,
   * which transforms do not touch.
   */
  /* ONE SIZE FOR EVERY QUESTION, NOT ONE SIZE PER QUESTION.
   *
   * This used to measure the sentence that happened to be up and scale the type to it.
   * Each question fitted its own board, so the type was a different size on nearly every
   * crossing — "Cut the convex polygon." set large, "Draw 2 diagonals from the same
   * vertex." set small — and the sign changed character as you played. That is the
   * "text size is not constant in whole game" report, and it is the same fault the plank
   * itself had before it was given a fixed width: something that should be one physical
   * object being rebuilt to suit each string.
   *
   * So the fit is now measured ACROSS EVERY QUESTION THE GAME CAN ASK, once, and the
   * smallest one wins. The longest sentence is the one that sets the type size, exactly
   * as a signwriter would lay out a set of signs; every shorter question is set at that
   * same size with more clear wood either side. Nothing ever overflows, because the
   * sentence that defines the size is by construction the one that fits worst.
   *
   * The corpus comes from setQuestions() (main.js passes it from CFG), so a question
   * added later is measured with the rest and cannot silently push a line off the plank.
   * With no corpus it falls back to fitting the current sentence, which is what a
   * banner line — a different element with its own width — still does.
   */
  /* TWO BOARDS, MEASURED SEPARATELY. The six rope crossings sit in the left band, where
     the plank is 33 stage units — all the option row leaves room for. Part 2's three sit
     in the middle, where there is no option row and the plank is 40u. Different widths
     hold different sentences, so each is fitted to its own longest and the two land at
     the same type size rather than one being shrunk to the other's constraint.
     @param {{band?: string[], centered?: string[]}} sets */
  setQuestions(sets) {
    const clean = a => (a || []).filter(s => typeof s === 'string' && s.trim());
    this._questions = { band: clean(sets && sets.band), centered: clean(sets && sets.centered) };
    this._fit = null;
    this.fitInstruction();
  }

  /** Widest-sentence fit for the board as it is currently classed. */
  _measureFit(mode) {
    const el = this.el.text, pill = this.el.pill;
    const cs = getComputedStyle(pill);
    const avail = pill.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (!(avail > 0)) return null;
    /* NINETY-FOUR PER CENT OF THE SPACE, NOT ALL OF IT. Filling it exactly means the
       sentence that sets the size ends up flush against the caps with no clear wood at
       all. Leaving a margin in the fit gives every line some wood either side. */
    const fitFor = need => (need > 0 ? (avail * 0.94) / need : 1);
    const lines = this._questions && this._questions[mode];
    if (!lines || !lines.length) return fitFor(el.scrollWidth);
    /* MEASURED IN A PROBE, NOT IN THE LIVE ELEMENT.
     *
     * The first version wrote each sentence into #instruction-text and put the real words
     * back afterwards. That is synchronous and never paints, but it does mean the board
     * briefly HOLDS a sentence it is not showing — and anything that reads the DOM from
     * outside this call (a test, an assistive tool, a MutationObserver) can be handed it.
     * The plank is the one element in the game whose contents are an assertion about what
     * the learner is being asked, so it is not the place to scribble.
     *
     * The probe is a clone with the same class inside the same pill, so it inherits every
     * font rule including --k, and it is measured in the REAL face — Baloo 2 loads late
     * and a detached element with fallback metrics would size the board to the wrong one.
     * visibility:hidden keeps it out of the picture; absolute keeps it out of the layout. */
    const probe = el.cloneNode(false);
    probe.removeAttribute('id');
    probe.removeAttribute('aria-live');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;' +
                          'white-space:nowrap;pointer-events:none;';
    probe.style.setProperty('--fit', '1');
    pill.appendChild(probe);
    let worst = 1;
    try {
      for (const s of lines) {
        probe.textContent = s;
        worst = Math.min(worst, fitFor(probe.scrollWidth));
      }
    } finally {
      probe.remove();
    }
    return worst;
  }

  fitInstruction() {
    const el = this.el.text, pill = this.el.pill, root = this.el.instruction;
    if (!el || !pill) return;
    /* A banner is a different board — wider, and its own type size (see the .banner
       rules) — so it keeps fitting the line it is showing. Only the question board,
       the one the player sees on all nine crossings, is held constant. */
    const banner = !!(root && root.classList.contains('banner'));
    const mode = (root && root.classList.contains('centered')) ? 'centered' : 'band';
    this._fit = this._fit || {};
    if (!banner && this._fit[mode] != null) { el.style.setProperty('--fit', this._fit[mode]); return; }
    el.style.setProperty('--fit', '1');
    /* Deferred one frame: called straight after the words are appended, the pill has
       not been laid out at the new content yet and clientWidth is the previous
       question's. */
    const run = () => {
      const raw = banner ? (() => {
        const cs = getComputedStyle(pill);
        const avail = pill.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const need = el.scrollWidth;
        return (avail > 0 && need > 0) ? (avail * 0.94) / need : null;
      })() : this._measureFit(mode);
      if (raw == null) return;
      /* A floor at 0.62. Below that the type is too small to be the thing you look at,
         and a sentence that cannot fit even then should be shortened rather than shrunk. */
      const fit = Math.max(0.62, Math.min(1, raw)).toFixed(3);
      if (!banner) this._fit[mode] = fit;
      el.style.setProperty('--fit', fit);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else run();
  }

  /** @param {{onPause:Function,onReplay:Function,onStamp?:Function}} handlers */
  bind(handlers) {
    this.handlers = handlers;

    // pointerdown (not click) so a tap registers on the same frame it lands.
    // preventDefault also suppresses the browser's own :active state, so the
    // pressed look has to be driven by a class or the button never appears to move.
    // TEMPORARY review control: jump to the ending. Guarded like every other lookup.
    if (this.el.skipEnd && handlers.onSkipEnd) this.el.skipEnd.addEventListener('click', () => handlers.onSkipEnd());

    /* NOTHING HERE BINDS A JUMP. The jump is a tap on the stage, which the engine reads
       off the canvas itself — there is no DOM control to press, to swap art on, to
       restart a ring on, or to keep in step with the keyboard. */

    // every icon button gets the same press feedback, so the whole cluster behaves
    // as one family
    const press = (btn, fn) => {
      if (!btn) return;
      btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.classList.add('pressed'); if (window.Juice) { try { Juice.pop(btn, { power: 0.6 }); } catch (err) { /* no juice */ } } });
      const off = () => btn.classList.remove('pressed');
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
      window.addEventListener('pointerup', off);
      btn.addEventListener('click', fn);
    };

    const setPaused = v => {
      this.paused = v;
      this.pauseLabel(v);
      if (this.el.paused) this.el.paused.hidden = !v;
      handlers.onPause(v);
    };
    press(this.el.pause, () => setPaused(!this.paused));
    press(this.el.resume, () => setPaused(false));
    press(this.el.restart, () => { setPaused(false); handlers.onReplay(); });

    const toggleSound = () => {
      const on = handlers.onSound ? handlers.onSound() : true;
      this.soundLabel(on);
    };
    press(this.el.sound, toggleSound);
    press(this.el.sound2, toggleSound);

    // the hint re-states the objective; it never points at the answer
    press(this.el.hint, () => {
      if (handlers.onHint) handlers.onHint();
      if (this.el.hint) this.el.hint.classList.remove('nudge');
    });

    this.el.replay.addEventListener('click', () => {
      this.paused = false;
      this.pauseLabel(false);
      if (this.el.paused) this.el.paused.hidden = true;
      handlers.onReplay();
    });

    /* NO "TRY AGAIN" BINDING, and no keyboard/pointer tracking behind it. Both belonged
       to the Ouch card: the binding to its button, and the two capture-phase listeners to
       a `_kbd` flag that decided whether opening the card should focus that button. The
       card is gone (a crash plays out and the run resumes on its own — see OBSTACLE_HIT),
       so the button has no element, the flag had no reader, and the listeners ran on every
       key and pointer press for the whole session to maintain it. The engine's
       retryObstacle() is untouched: it is called by the engine itself, not from here. */

    // the banner's drawn shape follows its box when the window changes
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    this.checkOrientation();
  }

  /** Portrait phones get a rotate prompt rather than a squashed 16:9 stage. */
  checkOrientation() {
    const portrait = window.innerHeight > window.innerWidth * 1.05 && window.innerWidth < 900;
    this.el.rotate.hidden = !portrait;
  }

  /** Called by the engine only when its HUD state actually changes. */
  update(h) {
    /* `h.helper` is gone from the payload. It was a second instruction line, removed
       on request, and G.helper had been pinned to the empty string ever since — so
       `h.helper || h.instruction` was provably just h.instruction. */
    const message = h.instruction || '';

    /* SHOWN WHENEVER THERE IS SOMETHING TO SAY, not only when the line CHANGES.
     *
     * This was a diff-driven state machine: it acted only when `message` differed from
     * the last one it had seen. That leaves the element stuck if anything hides it by
     * any other route, because the message has not changed so nothing puts it back.
     * Observed exactly that — engine state PHASE_ACTIVE with "Cut the triangle." in
     * G.instruction, and the element sitting at `class="instruction leaving"`,
     * `hidden=true`, with the right text inside it. The one thing telling the learner
     * what to look for was invisible for the whole phase.
     *
     * The re-assert costs a couple of property reads per HUD push and cannot get
     * stuck: if there is a message and the element is not showing it, it shows it.
     * The entrance animation is still only restarted for a genuinely NEW line, so a
     * re-assert does not make the pill flash. */
    /* THE TRAIL, from the two numbers the engine publishes. Shown for the whole of the
       journey and hidden on the cover, the tutorial and the ending — the ending has a
       celebration of its own and does not need a scoreboard over it. */
    /* The card is on screen for the whole journey, and slides out of the left band
       whenever the question board is in it — `message` is the same value that decides
       whether the board shows at all, a few lines below, so the two can never disagree
       about which of them owns the band. */
    this.setTrail(h.step || 0, h.steps || 0,
                  !!h.steps && !h.complete && !!h.playing, !!message);

    const el = this.el.instruction;
    this._voDur = h.voDur || 0;          // paces the word reveal, see setInstruction
    /* A BANNER IS A SENTENCE, NOT A QUESTION. The key-word treatment takes the noun after "the"
       and sets it in capitals and blue — right for "Cut the TRIANGLE.", wrong for the teaching
       line, where it produced "Use the right ice piece to fix the PATH." */
    this._plain = !!h.signBanner;
    // a tutorial sentence is a wide banner; a question sits in its left band (see the CSS)
    if (el) el.classList.toggle('banner', !!h.signBanner);
    /* PART 2 CENTRES THE QUESTION. Part 1's plank lives in the left band to stay clear
       of the hanging row; Part 2's crossing has one block, brought to the middle of the
       stage, so the left band is not where the eye is and a sign parked there reads as
       abandoned. A class on the same element — same board, same type, moved. */
    if (el) el.classList.toggle('centered', !!h.signCentre);
    const outOfSync = message && (el.hidden || el.classList.contains('leaving'));
    if (message !== this.lastMessage || outOfSync) {
      const isNewLine = message !== this.lastMessage;
      this.lastMessage = message;
      if (message) {
        clearTimeout(this._leaveT);
        this.setInstruction(message);
        el.hidden = false;
        el.classList.remove('leaving');
        /* RESTART THE DROP ONLY FOR A NEW LINE, NEVER FOR A RE-ASSERT — and never while one
           is still running. Two things can ask for the panel in quick succession: the staged
           intro handing the plank from the tutorial's teaching line to the phase's question,
           and a rapid tap or a scene change arriving on top of that. Restarting mid-fall
           snaps the plank back above the frame and drops it again, which is the overlapping
           animation this guards. The drop is 760ms (signDrop in style.css); inside that
           window a new line changes the words and keeps the fall it is already making. */
        const now = performance.now();
        if (isNewLine && !(this._dropAt && now - this._dropAt < 760)) {
          this._dropAt = now;
          this.el.pill.style.animation = 'none';
          void this.el.pill.offsetWidth;
          this.el.pill.style.animation = '';
        }
      } else {
        // slide away instead of vanishing on a display:none flip
        this.el.instruction.classList.add('leaving');
        clearTimeout(this._leaveT);
        this._leaveT = setTimeout(() => {
          if (this.el.instruction.classList.contains('leaving')) this.el.instruction.hidden = true;
        }, 300);
      }
    }

    this.updateHand(h);
    if (this._soundWas !== h.soundOn) { this._soundWas = h.soundOn; this.soundLabel(h.soundOn); }
    // the hint asks for attention only once the learner has been stuck a while
    if (this.el.hint) this.el.hint.classList.toggle('nudge', !!h.hintNudge);

    // TEMPORARY review control: up whenever the game is playable and not yet complete
    if (this.el.skipEnd) { const show = !!h.skippable; if (this.el.skipEnd.hidden === show) this.el.skipEnd.hidden = !show; }

    if (this.el.complete.hidden === h.complete) {
      this.el.complete.hidden = !h.complete;
      if (h.complete) this.showWin(h);
    }

    /* NO FAILURE PANEL TO SYNC. This block showed the Ouch card and, when it opened,
       focused TRY AGAIN so a keyboard player could press Space straight away. Both are
       gone with the card: a crash plays out and the run resumes at the nearest
       checkpoint by itself, so there is nothing to open and nothing to focus. */
  }

  destroy() {
    clearTimeout(this._leaveT);
    clearTimeout(this._flashT);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
  }
}
