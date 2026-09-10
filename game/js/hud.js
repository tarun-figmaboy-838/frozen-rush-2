/* HUD controller — owns every DOM element outside the canvas and mirrors the
   engine's HUD state onto it. The engine never touches the DOM itself. */

import { fitBubble } from './bubble.js';

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
      sub: root.getElementById('instruction-sub'),
      complete: root.getElementById('complete'),
      replay: root.getElementById('btn-replay'),
      /* oops and retry are gone from the markup: a crash recovers by itself now and
         there is no failure panel. The lookups are not kept "just in case" — every
         use of them went with them, and a lookup with no user is how a dead element
         gets resurrected by the next person reading this file. */
      rotate: root.getElementById('rotate')
    };
    this.paused = false;
    this.lastMessage = null;
    this._onResize = () => this.checkOrientation();
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
    const m = this._plain ? null : /^(.*?\bthe\s+)([a-z]+?)(s?)([.!]?)$/i.exec((message || '').trim());
    el.textContent = '';
    let n = 0;
    /* IN STEP WITH THE VOICE, like the dialogue: when the question is spoken the reveal is
       spread across the clip. The engine hands the seconds over in the HUD state. */
    const words = (message || '').trim().split(/\s+/).filter(Boolean).length || 1;
    // spread across the whole spoken line, measured on the last word (see Tutorial.setWords)
    const step = this._voDur > 0 ? Math.min(0.55, Math.max(0.07, (this._voDur * 0.82) / Math.max(1, words - 1))) : 0.07;
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
    if (!m) { for (const w of (message || '').trim().split(/\s+/)) word(w, 'iw', true); return; }
    for (const w of m[1].trim().split(/\s+/)) word(w, 'iw', true);
    word((m[2] + m[3]).toUpperCase(), 'iw key', true);
    word(m[4], 'iw', false);                                  // the sentence keeps its full stop
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
    /* THE SECOND LINE. Only the later Part 2 crossings set one — it names the property
       being asked about and, where two shapes match, says so. Hidden the rest of the
       time rather than left empty, so it takes no space on the board when unused. */
    if (this.el.sub) {
      const sub = h.sub || '';
      this.el.sub.textContent = sub;
      this.el.sub.hidden = !sub;
    }
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
