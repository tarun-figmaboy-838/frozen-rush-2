/* THE FIRST-PLAY TUTORIAL.
 *
 * Teaches the two mechanics the game is made of — jump the rock, cut a rope to mend
 * the path — by spotlighting one thing at a time and then making the player do it.
 *
 * WHY IT IS A DOM LAYER AND NOT DRAWN ON THE CANVAS. The engine never touches the DOM
 * and the HUD never touches the canvas; that separation is what keeps the renderer
 * testable. The speech box, the blur sheet and the hand are text and pictures laid over
 * the game rather than parts of it, so they live on the DOM side; every subject they
 * point at is canvas, addressed in stage coordinates and converted to percentages of the
 * stage exactly as the hand hint already does. (It used to have to point at a DOM control
 * as well — the JUMP button — which is what domSpot and .tut-lift were for. Both are gone
 * with the button: a tap anywhere jumps.)
 *
 * THE RULES IT FOLLOWS, all of which are load-bearing:
 *
 *   ONE THING AT A TIME, WITH THE STAGE TO ITSELF. An instruction that appears while
 *   the objects it describes are still moving loses: the player watches the movement.
 *   So an explaining step PAUSES the game, holds the stage alone, and only releases it
 *   when the player taps.
 *
 *   IT TEACHES BY DOING. The two steps that matter — the jump and the cut — do not
 *   advance on a tap. They unpause and wait for the player to actually perform the
 *   action, then confirm it. A tutorial that advances on taps has taught nothing.
 *
 *   IT NEVER COMPLETES THE TASK. Nothing here jumps, cuts, or moves the game on by
 *   itself.
 *
 *   IT NEVER LEAKS AN ANSWER. The block step spotlights the WHOLE row, never one
 *   option, and its wording is about ropes and blocks, never about which shape fits.
 *   The curriculum is the game's whole purpose and a tutorial that hands over the
 *   first answer costs the first phase its teaching.
 *
 *   NOTHING IS PARKED AT OPACITY 0. Every element rests visible and animates from
 *   there, so a dropped keyframe or a reduced-motion setting cannot leave the layer
 *   permanently invisible while every attribute still reads as intended.
 *
 * Shown on every run. `?tutorial=0` suppresses it, which is what the test suite
 * passes, since almost none of those tests expects a coach mark over the stage.
 */

/* NO STORED "SEEN" FLAG. There was one, and it made the tutorial invisible after a
   single play with no way to bring it back — see the note in main.js. Nothing writes
   it now, and nothing reads it: a key left behind, still being written but no longer
   consulted, is exactly the sort of thing that gets wired back up by accident. */

/* Stage coordinates, because that is the space the engine thinks in: a 1920x1080
   backbuffer letterboxed into whatever the viewport is. Converted to percentages of
   the stage element on the way out, so one set of numbers is correct at every size. */
const W = 1920, H = 1080;
const clampN = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;


import { fitBubble, BUBBLE } from './bubble.js';

/* WHICH RECORDED LINE BELONGS TO WHICH STEP (docs/VO-SCRIPT.md, CFG.vo.lines). */
const VO = {
  meet: 'tut-1-meet', goal: 'tut-2-goal', rock: 'tut-3-watch', jump: 'tut-4-jump',
  gap: 'tut-5-broken', use: 'tut-6-use', fit: 'tut-7-fit'
  // 'cut' is the hand alone and says nothing: the plank's question is spoken by the engine
};

export class Tutorial {
  /**
   * @param {Document} root
   * @param {object} game  the engine handle from createGame()
   */
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.el = {
      layer: root.getElementById('tutorial'),
      veil: root.getElementById('tut-veil'),
      focus: root.getElementById('tut-focus'),
      canvas: root.getElementById('game-canvas'),
      bubble: root.getElementById('tut-bubble'),
      shape: root.getElementById('tut-shape'),
      text: root.getElementById('tut-text'),
      hand: root.getElementById('tut-hand'),
      skip: root.getElementById('tut-skip')
    };
    this.step = -1;
    this.done = false;
    this.t = 0;                    // seconds the current step has been on screen
    this.hold = 0;                 // a follow-up line's remaining time
    this.follow = null;
    this._built = false;
    this._wasPaused = false;
    this.spoke = false; this.voDur = 0; this._wordStep = 0.055;
    /* Where each word of the current line is spoken, in seconds from the line's start, or
       null for a take with none baked. Set with voDur when the step speaks. */
    this.voWords = null; this.voId = null;

    /* THE BOX IS HUGGED TO THE WORDS, so it has to be hugged to the words IN THEIR OWN FONT.
       Baloo 2 is fetched at boot but it arrives when it arrives, and the first tutorial line
       can be on screen before it does. Measured with a cold cache: the box was fitted to the
       fallback face, the webfont then swapped in narrower, and 46px of empty yellow was left
       beside "This is Momo." — intermittent, because it only shows when the font loses the
       race. Clearing the cached height makes the next frame re-measure, in the real face. */
    const d = root && root.fonts;
    if (d && d.ready && d.ready.then) d.ready.then(() => { this._boxH = 0; this._sizeKey = null; }).catch(() => {});
  }

  /* ---- the script ----

     TWO KINDS OF STEP, and the difference decides everything else about them.

     A DESCRIBING step states what something is. It freezes the game, blurs everything
     except the thing it is talking about, holds long enough to be read, and then moves
     on BY ITSELF. There is no hand and nothing to tap: asking a child to confirm they
     have read a sentence is asking the wrong question, and a hand on a step with no
     action to perform teaches that the hand means nothing.

     An ASKING step wants a finger. It lets the game run, shows the hand on the control
     to use, and waits for the player to actually do it — a jump, or a cut. The veil is
     off for these, because the player has to see the scene they are acting in.

     `advance` says which kind it is: a NUMBER of seconds means describing and
     self-advancing; a string names the action to wait for. */
  get steps() {
    /* SEVEN LINES, SHORT AND ACTION-ORIENTED (the owner's script, September 2026). The
       earlier lines explained what the learner could already see ("He runs all by
       himself!", "Blocks of ice are hanging on ropes up here."). These establish Momo, his
       goal and the two controls, and get out of the way:

         1 This is Momo. He needs to find his friend.       describing, frozen, Momo lit
         2 Help Momo cross the Frozen Pass!                 describing, frozen, Momo lit
         3 Watch out!                                       describing, frozen, obstacle lit
         4 Tap to jump over obstacles.                      ASKING: frozen 1.2s to read (a tap then is armed), the box alone in the middle of the stage, no hand, waits for the jump
         5 Oh no! The path is broken.                       describing, frozen, gap lit
         6 Use the right ice piece to fix the path.         ASKING: sweep hand on the right rope, waits for the cut
         7 Perfect fit! Keep going!                         describing, game running, self-advances

       EACH LINE IS DELIVERED A SENTENCE AT A TIME (see beats): 1 arrives as "This is
       Momo." and then "He needs to find his friend.", 5 as "Oh no!" and then "The path is
       broken.", 7 as "Perfect fit!" and then "Keep going!". The text here is the whole
       line because that is what is recorded and what docs/VO-SCRIPT.md lists — the
       splitting happens on the way to the screen, so the three cannot drift apart.

       The pauses are what keep it fair: the obstacle is frozen on screen while 3 is read
       and is jumpable the moment 4 starts; the gap and the blocks are frozen while 5 is
       read. Line 4 folds the old "this is the button" and "tap it now" into one ask, so the
       time from resume to the obstacle is exactly what it was. Line 6 is the ask itself:
       the sweep hand on the rope of the answer says WHICH and HOW, the sentence says WHY. */
    /* THE TAIL GOES ON HIS HEAD, and the head is MEASURED, not guessed.
     *
     * The spot used to be a 165 x 205 oval around his whole body, so the bubble was placed
     * off his silhouette and the tail landed wherever the top of that oval happened to be —
     * over his back, in front of his brow, or in the air beside him depending on the pose.
     *
     * Where the head actually is, read off the delivered run sheet (36 frames of
     * mammoth-run.webp, median of the topmost opaque row and of the head's centre column,
     * converted through the cell geometry the renderer uses — cell 420 x 320, baseGap 27,
     * character scale 1.75, so the drawn cell is 735 x 560):
     *
     *     the crown is 362px ABOVE the foot line
     *     and 86px to the RIGHT of the character's own x
     *
     * Both are taken from the LIVE player every frame — `drawX` carries the forward offset
     * of a leap and `feetY` carries the hop and the crouch — so the anchor tracks him
     * through movement and through a change of sheet, at any stage size, because these are
     * stage units and the stage is letterboxed as a whole.
     *
     * MEDIAN, not per-frame: his head bobs 56px across a run cycle, and a box that chased
     * it would jitter. Anchored to the middle of that bob the box holds still while the
     * tail stays on his head throughout.
     *
     * The oval is small and sits UNDER the box, so the bubble lands just above his crown —
     * the tail tip touches the top of his head and the box never covers his eyes. */
    const HEAD_UP = 362, HEAD_RIGHT = 86;
    /* His head's x on its own, for the one line whose BOX is centred on the stage (the jump
       ask, on the owner's call) but whose tail should still lean toward him. */
    const momoHeadX = () => {
      try {
        const p = this.game._player && this.game._player();
        if (p && typeof p.drawX === 'number') return p.drawX + HEAD_RIGHT;
      } catch (e) { /* he is not up yet */ }
      return 430 + HEAD_RIGHT;
    };
    const momo = () => {
      let feet = 840, x = 430;
      try {
        const p = this.game._player && this.game._player();
        if (p && typeof p.feetY === 'number') feet = p.feetY;
        if (p && typeof p.drawX === 'number') x = p.drawX;
      } catch (e) { /* fall back to where he stands */ }
      const hx = x + HEAD_RIGHT, hy = feet - HEAD_UP;
      const ry = 58;
      return { x: hx, y: hy + ry, rx: 86, ry, aimX: hx, world: true };
    };
    return [
      {
        id: 'meet',
        at: g => ['RUN_SEGMENT_1', 'JUMP_CHALLENGE_1'].includes(g.state),
        spot: momo,
        text: 'This is Momo. He needs to find his friend.',
        focus: 'mammoth',
        advance: 0, pause: true
      },
      {
        id: 'goal',
        at: g => ['RUN_SEGMENT_1', 'JUMP_CHALLENGE_1'].includes(g.state),
        spot: momo,
        text: 'Help Momo cross the Frozen Pass!',
        focus: 'mammoth',
        advance: 0, pause: true
      },
      {
        /* The obstacle is described with the game stopped, so it can be looked at before
           anything is expected — and it is still there, frozen, when the ask begins. */
        id: 'rock',
        at: g => this.rockAhead(g) !== null,
        spot: g => {
          const sx = this.rockAhead(g);
          return sx === null ? null : { x: sx, y: 780, rx: 150, ry: 140, world: true };
        },
        text: 'Watch out!',
        focus: 'rock',
        advance: 0, pause: true
      },
      {
        /* THE CONTROL IS THE WHOLE SCREEN, and this step says so in words alone, from the
           MIDDLE of it.

           There used to be a JUMP button in the bottom-right corner and this step pointed a
           tapping hand at it. The button is gone (index.html), and so is the hand: a hand
           tapping one spot is the one thing that must NOT be said here, because it teaches
           that the spot is the control when the whole stage is. The box was then put on
           Momo, and moved again on request to the centre of the stage — which is the right
           place for it: "Tap to jump" is an instruction about the whole screen, not a line
           Momo is saying, and a box in the middle of the sky says "anywhere" the way a box
           parked on one character cannot. The tail still leans toward him (aimX), so it is
           plain who does the jumping.

           The spot is a wide, low oval in the open sky above the ice — y 560 is under the
           rope line and above the rock's top (656) — so the box lands in the middle band of
           the picture. The gate is the jump being available at all, not a rock being in
           range: the rock keeps coming while the sentence is read, so a gate on its distance
           would drop the box just as the player needs it. */
        id: 'jump',
        at: g => !!g.jumpEnabled,
        spot: () => ({ x: 960, y: 560, rx: 260, ry: 40, aimX: momoHeadX(), world: true }),
        text: 'Tap to jump over obstacles.',
        /* FROZEN UNTIL THE LINE IS FINISHED, not for a guessed 1.2 seconds: the sentence,
           its voice and the reading pause all complete with the world held still, and only
           then does the run resume and the jump become the thing to do. The rock is frozen
           with everything else, so it is exactly as far away when play resumes as it was
           when the line began and the jump is no harder than it was tuned to be. */
        advance: 'jumped', pause: 'line'
      },
      {
        id: 'gap',
        /* The ice has to have actually broken: g.open runs 0 -> 1 as the ground gives way. */
        /* AND HE HAS STOPPED AND TREMBLED. The owner's sequence: he arrives at the lip, the
           whole tremble plays (notice, look down, tremble, look to the player, settle), and
           THEN the line comes with the gap lit — the reaction first, the words about it
           after. GLACIER_BREAK_1 is the skid, and firing there froze him mid-slide; SHAKE is
           the tremble, and firing during it froze the performance. So: stopped, and no
           longer trembling. */
        /* CROSSING 1 IS THE DIAGONAL LEVEL NOW, so the states this waits for are its
           states. The condition is otherwise unchanged and means the same thing: the
           ice has actually opened, he has stopped, and he is no longer trembling. */
        at: g => (g.gapsThisPhase || []).some(gp => gp && (gp.open || 0) > 0.75) &&
                 ['PHASE_INTRO', 'PHASE_ACTIVE', 'LEVEL_2_INTRO', 'LEVEL_2_OVERVIEW'].includes(g.state) &&
                 (() => { const p = this.game._player && this.game._player(); return !p || p.state !== 'SHAKE'; })(),
        spot: g => {
          const gp = (g.gapsThisPhase || [])[0];
          if (!gp) return null;
          const cx = (gp.x0 + gp.x1) / 2 - g.worldX;
          /* THE HOLE ITSELF, not a halo round it. The old spot was a 185px circle, so the
             bubble's tail stopped 100px above the ice with the hole nowhere near it (asked:
             the dialogue must point at the ditch). The hole's visible top is the ice surface
             (~845 stage px); an oval 62 tall about y 900 puts that edge where the tail tip
             lands, over the middle of the gap. */
          return { x: cx, y: 900, rx: Math.max(150, (gp.x1 - gp.x0) * 0.62), ry: 62, world: true };
        },
        text: 'Oh no! The path is broken.',
        focus: 'gap',
        advance: 0, pause: true
      },
      {
        /* THE ASK. The sweep hand is on the rope of the answer (ropeBox), the engine's demo
           stroke crosses the same rope, and the bubble sits beneath the blocks so it never
           hides the piece it means. */
        /* THE SENTENCE IS ON THE PLANK, not in a bubble (asked for). It is shown there as a wide
           banner with the options and their ropes lit; when it has been read the plank goes back
           to the phase's own question ("Cut the TRIANGLE.") and the hand sweeps the answer's
           rope. So the learner is told WHAT to do, then asked WHICH — in that order. */
        /* IT GOES FIRST, AND IT FINISHES FIRST. The sentence takes the plank the moment the
           plank arrives — while the pieces are still coming down, with them and their ropes lit
           — and holds it for the whole step. Only when it is done does the plank show the phase's
           own question ("Cut the TRIANGLE."), and only then does the hand sweep. Told WHAT to do,
           then asked WHICH (the owner's order; the question used to arrive first because it came
           on the plank's own beat). */
        /* WHAT THE ICE IS FOR, and it is now said about ONE slab rather than a row of
           hanging blocks — crossing 1 is the diagonal level. The sentence changed with
           the mechanic: there is nothing to choose between here, so "use the RIGHT
           piece" would be asking a question the level does not ask. */
        id: 'use',
        at: g => ['PHASE_INTRO', 'PHASE_ACTIVE', 'LEVEL_2_OVERVIEW', 'LEVEL_2_FOCUS'].includes(g.state),
        spot: () => null,
        text: 'Cut this ice block to fix the path.',
        sign: 99, focus: 'blocks',
        advance: 0, pause: false
      },
      {
        /* THE ASK. No words of its own — the plank is doing the asking — just the hand,
           drawing the answer's shape without performing it.

           IT DRAGS BETWEEN TWO CORNERS, because that is the control this crossing uses.
           The old step swept a hand ACROSS a rope, which is the Part 1 gesture and would
           now be teaching the wrong thing entirely. The hand travels one main diagonal of
           the slab; which one it shows does not matter, since all three are correct — and
           it stops short of committing, as every step here does. */
        id: 'cut',
        at: g => !!g.l2 && g.state === 'LEVEL_2_ACTIVE' && this.diagonalBox(g) !== null,
        spot: g => this.diagonalBox(g),
        text: '',
        handOnly: true,
        /* NO DOM HAND HERE, and that is the difference from Part 1's cut step. The
           gesture is a drag down a slanted line, and the hand element travels a
           horizontal CSS translate in its own units — pointing it along a diagonal
           would either stop being responsive or need an animation per angle. The
           ENGINE draws the demonstration instead (drawL2's demo branch): a marching
           dashed line corner to opposite corner with a finger running it, on the
           canvas, where everything else that points at a cut is already drawn and
           where it is resolution-independent for free. `demo` switches it on. */
        demo: true,
        advance: 'cut', pause: false, hand: null
      },
      {
        /* The reward line runs over the celebration and lets go by itself; the game is
           not stopped for it. Only after a RIGHT cut — a wrong one gets the game's own
           answer (the splash, the instruction back), not this. */
        id: 'fit',
        at: g => ['PHASE_SUCCESS', 'PHASE_DONE', 'PHASE_RUN',
                  'LEVEL_2_SUCCESS', 'BRIDGE_2_COMPLETE'].includes(g.state),
        spot: momo,
        text: 'Perfect fit! Keep going!',
        advance: 0, pause: false
      }
    ];
  }

  /* ---- where things are ---- */

  /** The nearest rock still ahead of the character, in stage x, or null. */
  /* WITHIN 1050px (was 1500, then 1200): described from a thousand pixels away the obstacle
     looked like nothing to worry about, and it still read as far at 1200. At 1050 it is right in
     his path while 'Watch out!' is read. The jump ask then freezes 1.2s for reading, and a tap
     DURING that freeze is not thrown away: the engine arms it and jumps when the obstacle is in
     range (api.jump / onDown while paused), so a child who taps at once still clears it. A tap
     after the resume has about 0.8s. The engine's rockAhead mirrors this number. */
  rockAhead(g) {
    const list = this.game._obstacles ? this.game._obstacles().list : [];
    let best = null;
    for (const o of list) {
      if (o.passed || o.hits >= 3) continue;
      const sx = o.x - g.worldX;
      if (sx > 620 && sx < 1050 && (best === null || sx < best)) best = sx;
    }
    return best;
  }

  /** The nearest obstacle ahead, as words: { noun: 'rock'|'log'|'fossil', cap: 'A rock'|... }. */
  /* WHERE THE HAND DRAWS THE DIAGONAL, for crossing 1.
   *
   * Part 1's lesson swept a hand ACROSS a rope. Crossing 1 is the diagonal level now and
   * its control is a drag between two corners, so the hand has to travel a diagonal
   * instead — a sweep across anything here would be teaching the previous game.
   *
   * WHICH diagonal does not matter and that is the point: all three main ones are
   * correct, so showing one gives nothing away that the instruction has not already
   * said. It takes the first (corner 0 to the corner opposite), which for a six-corner
   * slab is always a main diagonal.
   *
   * The box is the diagonal's own span with a little padding, in STAGE coordinates —
   * the slab's `pos` is already stage space and the level does not zoom, so unlike the
   * rope box there is no world-to-stage step to get wrong.
   */
  diagonalBox(g) {
    const L = g.l2;
    if (!L || !L.pts || !L.pts.length || L.pieces) return null;
    // not while it is falling into the river or being lowered back in
    if (L.fall || (L.respawn || 0) > 0) return null;
    const n = L.pts.length;
    const j = n / 2;
    if (!Number.isInteger(j)) return null;            // no opposite corner to aim at
    const at = i => ({ x: L.pos.x + L.pts[i].x * L.scale, y: L.pos.y + L.pts[i].y * L.scale });
    const a = at(0), b = at(j);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    return {
      x: cx, y: cy,
      rx: Math.max(90, Math.abs(b.x - a.x) / 2 + 46),
      ry: Math.max(70, Math.abs(b.y - a.y) / 2 + 46),
      /* The two ends, so the hand can travel the real line rather than a horizontal
         sweep through the middle of a box. */
      from: a, to: b,
      world: false
    };
  }

  ropeBox(g) {
    const hang = ((g.l1 && g.l1.shapes) || []).filter(s => s.state === 'hang');
    if (!hang.length) return null;
    /* THE ROPE OF THE ANSWER, not the middle one. A student copies the hand; on the middle
       rope that copy cut the wrong block two times in three (student playtest). The engine's
       demo stroke (drawCutDemo) aims the same way in this phase, so the two agree. The
       middle rope is only the fallback when nothing is wanted. */
    const want = g.l1.unfilled && g.l1.unfilled[0];
    const sorted = hang.slice().sort((a, b) => a.x - b.x);
    const mid = hang.find(s => s.kind === want) || sorted[Math.floor(sorted.length / 2)];
    const topOfBlock = mid.y - (mid.h || 200) / 2;
    if (topOfBlock < 60) return null;                 // rope still off the top
    /* ON THE DASHES, NOT NEAR THEM. `guide` is the engine's own cut-line point for this
       rope (engine.js: cutGuide), published on the shape every frame — the very point
       the marching dashes are drawn at. This used to re-derive the height with a copy of
       the engine's formula and take x from the ANCHOR, which is where the rope leaves
       the fog, not where it is at the height of the dashes: with the rig swaying, the
       hand sat beside the line it was supposed to be sweeping along. Reading the one
       published number means the hand and the dashes cannot drift apart. */
    const gd = mid.guide || null;
    const ropeY = gd ? gd.y : Math.max(70, topOfBlock - 60);
    const ropeX = gd ? gd.x : (mid.anchorX !== undefined ? mid.anchorX : mid.x);
    /* THE ZONE TO KEEP CLEAR IS THE ROPES AND THE BLOCKS, not the rope alone. With a
       90px box around the rope, a phone's taller bubble could not fit above it and was
       placed "below" — squarely over the blocks, hiding the very block the sentence
       named (student playtest). The zone now runs from the top of the stage to under the
       blocks, so the bubble lands beneath them, over open ice; the hand still aims at the
       rope itself (handY), which is where the swipe has to happen. */
    const bottom = mid.y + (mid.h || 200) / 2 + 12;
    /* UP ON THE ROPE (asked for: the box sat under the blocks, over open ice, and read as
       unrelated to what it was talking about). The subject is now the rope's own cut stretch —
       a compact box at handY, where the hand sweeps — so the placement puts the words just
       above that line with the tail down on it: the sentence and the gesture are in the same
       place. The blocks below stay clear because the box no longer reaches them. */
    /* belowY IS THE FALLBACK. There is only so much sky above a rope: on a desktop stage the
       one-line box fits there, and on a phone-landscape stage it does not — the box would have
       to be clamped onto the top edge with its tail pointing at nothing. So when above does not
       fit, the box goes UNDER THE PIECES (the row's bottom edge) rather than half over them,
       and the tail lands on the piece it names. Either way it never covers the answer. */
    /* The BOX is aimed at the block's anchor (a bubble hanging off the rope's own line
       reads as belonging to that rope), while the HAND is on the cut line itself. */
    const anchor = mid.anchorX !== undefined ? mid.anchorX : mid.x;
    return { x: anchor, y: ropeY, rx: 120, ry: 34,
             aimX: anchor, belowY: bottom,
             handX: ropeX, handY: ropeY, world: true };
  }

  /** A box around every hanging block, in stage coordinates. */
  rowBox(g) {
    const hang = ((g.l1 && g.l1.shapes) || []).filter(s => s.state === 'hang');
    if (!hang.length) return null;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const s of hang) {
      x0 = Math.min(x0, s.x - s.w / 2); x1 = Math.max(x1, s.x + s.w / 2);
      y0 = Math.min(y0, s.y - s.h / 2); y1 = Math.max(y1, s.y + s.h / 2);
    }
    if (y1 < 40) return null;                       // still off the top of the screen
    /* AN OVAL AROUND THE ROW, not a circle enclosing it. The row is much wider than it
       is tall, so one radius big enough to cover its width is enormous vertically —
       1228px across for a 970px row, which is most of the screen. Separate axes hug it. */
    return {
      x: (x0 + x1) / 2, y: (y0 + y1) / 2,
      rx: (x1 - x0) / 2 + 60,
      ry: (y1 - y0) / 2 + 50,
      world: true
    };
  }

  /* NO domSpot, AND NO LIFTED DOM TARGET. This measured an element's rect and returned
     it as a stage-space spot, so a step could point at a control; the JUMP button was the
     only caller, and with the button gone every subject the tutorial has is drawn on the
     canvas and is highlighted by re-rendering it alone (showFocus). The '.tut-lift'
     stacking trick that went with it is gone from the stylesheet too. */

  /* ---- lifecycle ---- */

  begin() {
    if (this._built) return;
    this._built = true;
    if (this.el.skip) this.el.skip.addEventListener('click', () => this.finish());
    /* THE WHOLE STAGE IS THE BUTTON. There is no "Got it" any more: the hand taps on
       the thing being explained, and a tap anywhere acknowledges it. That is both
       simpler and more honest about what the hand is asking for — a child who cannot
       read the sentence yet can still see a finger tapping and copy it, whereas a
       button labelled "Got it" is a claim about reading.

       Pointer events on the layer are switched off for action steps, so a real swipe
       still reaches the canvas. */
    if (this.el.layer) this.el.layer.addEventListener('click', e => {
      if (e.target === this.el.skip) return;
      this.tap();
    });
    this.step = 0;
    this.t = 0;
  }

  /* ---- ONE SENTENCE AT A TIME ----
   *
   * A step's line is a SEQUENCE OF SHORT SENTENCES, shown one after another in the same
   * box, not a paragraph delivered in one go.
   *
   * "This is Momo. He needs to find his friend." arrived as a single two-line block of
   * text, and a block of text is the one thing a five-year-old will not read: it is a
   * paragraph in a speech bubble, which is what a worksheet looks like. A comic gives one
   * thought per panel. So a line is split at its own full stops and each sentence takes
   * the box in turn — "This is Momo." lands, is read, pops out, and "He needs to find his
   * friend." pops in behind it. Each sentence gets its own pop, its own hug to the words
   * and its own beat, which is what makes it read as someone SPEAKING rather than as a
   * caption appearing.
   *
   * THE WORDS THEMSELVES ARE NOT REWRITTEN HERE, and that is deliberate. Every line is
   * recorded in the owner's voice-over as one take (CFG.vo.lines) and listed verbatim in
   * docs/VO-SCRIPT.md; changing a sentence in this file would silently desynchronise the
   * three and a test would rightly fail. Splitting at display time gives the shorter,
   * simpler delivery that was asked for while the script, the recording and the doc stay
   * one thing. A line that has to be genuinely shorter is shortened in the script above,
   * re-recorded, and moved in the doc — all three together.
   *
   * The sentences share the clip when there is a voice, in proportion to their length, so
   * what is on screen is what is being said at that moment.
   */
  beats(text) {
    const key = (text || '') + '|' + (this.voDur || 0);
    if (this._beatKey === key) return this._beatPlan;
    /* Split on the punctuation and KEEP it: "Oh no!" is a beat BECAUSE of the "!", and a
       sentence that arrives without its full stop reads as unfinished. */
    const parts = String(text || '').match(/[^.!?]+[.!?]*/g) || [];
    const lines = parts.map(t => t.trim()).filter(Boolean);
    let plan;
    if (!lines.length) plan = [];
    else if (this.voDur > 0) {
      /* SPOKEN: the clip is shared out by length, so the sentence on screen is the one
         being said. The last keeps the tail of the clip plus a beat, so the box never
         leaves on the final word. */
      /* WHERE THE SENTENCES REALLY FALL, when the take has been measured. A beat starts on
         its first word and ends on the next beat's first word, so the sentence on screen
         changes exactly when the speaker moves on to it. Sharing the clip out by character
         count — what happens without the timings — assumes every character takes the same
         time to say, and "Oh no!" against "The path is broken." is where that shows. */
      const w = this.voWords, counts = lines.map(t => t.trim().split(/\s+/).filter(Boolean).length);
      const need = counts.reduce((a, b) => a + b, 0);
      if (w && w.length === need) {
        let i = 0;
        plan = lines.map((t, k) => {
          const at = w[i];
          i += counts[k];
          const end = i < w.length ? w[i] : this.voDur;
          return { text: t, dur: Math.max(0.7, end - at), at, i0: i - counts[k] };
        });
        plan[plan.length - 1].dur += 0.45;
      } else {
        const total = lines.reduce((a, t) => a + t.length, 0) || 1;
        plan = lines.map(t => ({ text: t, dur: Math.max(0.7, this.voDur * t.length / total) }));
        plan[plan.length - 1].dur += 0.45;
      }
    } else {
      /* SILENT: the reading estimate the script was written to, per sentence — a beat to
         look at it plus ~55ms a character, floored so a two-word beat is not a flash and
         capped so none of them outstays its welcome. */
      plan = lines.map(t => ({ text: t, dur: clampN(1.0 + t.length * 0.055, 1.55, 3.6) }));
    }
    /* AND NO BEAT MAY BE SHORTER THAN ITS OWN REVEAL. The words arrive one after another
       and each takes WORD_IN to land, so a sentence is only complete at
       (words - 1) x step + WORD_IN. Sharing a short clip out by length could hand a beat
       less time than that — and the sentence was then replaced while its last word was
       still animating in, which is exactly the "incomplete dialogue" this round is about.
       The floor is computed with the FASTEST step the reveal will ever use, so it is the
       true minimum; setWords then spreads the words across whatever duration ends up here. */
    for (const b of plan) {
      const words = b.text.trim().split(/\s+/).filter(Boolean).length || 1;
      const floor = (words - 1) * 0.055 + Tutorial.WORD_IN + Tutorial.SETTLE;
      if (b.dur < floor) b.dur = floor;
    }
    this._beatKey = key; this._beatPlan = plan;
    return plan;
  }

  /** Which sentence is showing at t seconds into the step, and how long it has. */
  beatAt(text, t) {
    const plan = this.beats(text);
    if (!plan.length) return { text: '', dur: 0 };
    let acc = 0;
    for (let i = 0; i < plan.length; i++) {
      acc += plan[i].dur;
      if (t < acc || i === plan.length - 1) return plan[i];
    }
    return plan[plan.length - 1];
  }

  /* WHEN IS A LINE FINISHED? Both of these, and then a pause:
       A. every sentence has been on screen for long enough to arrive in full (the beats,
          each of which now contains its own reveal — see beats());
       B. the voice-over has stopped.
     readShown() is A, readTime() is A and B and the reading pause. Nothing in this file
     advances a step, drops a box or hands the plank back on anything else.

     IT NEVER WAITS ON AN AUDIO EVENT. api.say() returns the length of the clip it is going
     to play, or 0 when it will not be heard at all — muted, no context, no file, decode
     failed. So a line with no audio is gated on its text alone and still completes, and a
     clip that dies half way through cannot hang the tutorial: there is no 'ended' listener
     to miss. That is the whole of the audio-failure handling, and it is why it cannot
     deadlock. */
  readShown(text) {
    return this.beats(text).reduce((a, b) => a + b.dur, 0);
  }
  readTime(text) {
    return Math.max(this.readShown(text), this.voDur || 0) + Tutorial.READ_PAUSE;
  }

  /* NO TAP-TO-ADVANCE. A describing step moves on by itself and a tap does nothing.
     Tapping past a sentence is not something a child does deliberately — they tap
     because a finger is on the screen — so honouring it would skip the instruction
     they were about to read. Skip is the deliberate way out, and it is a button. */
  tap() { /* intentionally nothing: see above */ }

  /** The player did the thing an action step was waiting for. */
  didAction(name) {
    if (this.done) return;
    const s = this.steps[this.step];
    if (s && s.advance === name) {
      if (s.follow) { this.follow = s.follow; this.hold = 1.4; }
      this.next();
    }
  }

  next() {
    if (this.game.saySign) this.game.saySign('');      // the plank goes back to its question
    // a drawn demonstration belongs to the step that asked for it and to nothing after it
    if (this.game._l2Demo) this.game._l2Demo(false);
    this.step++;
    this.t = 0;
    this.spoke = false;                                // the new step has not been read aloud yet
    this.voDur = 0; this.voWords = null; this.voId = null;
    /* AND THE WORDS STOP WITH IT. If a line is cut short — skipped, restarted, the sound
       switched off — its reveal must not carry on animating a sentence nobody is saying. */
    if (this.el.text) this.el.text.classList.remove('waiting');
    if (this.step >= this.steps.length) this.finish();
  }

  finish() {
    if (this.game.saySign) this.game.saySign('');
    /* AND THE DRAWN DEMONSTRATION GOES. A tutorial that is skipped, or that throws and
       is finished by the failsafe in main.js, must not leave a dashed line lying across
       the slab for the rest of the level. */
    if (this.game._l2Demo) this.game._l2Demo(false);
    if (this.done) return;
    this.done = true;
    // the tutorial is over: the game must never be left believing a line is still up
    this._presenting = false;
    if (this.game.setDialogue) this.game.setDialogue(false);
    this.resume();
    this.hideFocus();
    if (this.el.layer) this.el.layer.hidden = true;
    this._bubbleKey = null;
  }

  pause(asking) {
    // an ask's freeze may arm a jump for later; a line being read never may (see api.setPaused)
    if (this._wasPaused && this._askingPause === !!asking) return;
    this._wasPaused = true; this._askingPause = !!asking;
    this.game.setPaused(true, { asking: !!asking });
  }
  resume() {
    if (!this._wasPaused) return;
    this._wasPaused = false;
    this.game.setPaused(false);
  }

  /* ---- one tick, called from the host's animation frame ---- */
  /* THE WORLD HAS TO BE ON SCREEN BEFORE ANYTHING IS SAID ABOUT IT.
   *
   * setPaused stops the render as well as the simulation — deliberately, so a paused
   * game holds its last frame — and the tutorial starts on the same tick the run
   * begins. So the very first step froze the game BEFORE a single frame had been
   * drawn, and the spotlight lit a blank canvas: a dark stage with a speech bubble on
   * it, pointing at nothing. Measured as a uniformly dark screenshot, which is the
   * only way this shows up — every element was present, sized and correct.
   *
   * It is also the better teaching order. "He runs all by himself" is a claim about
   * something the player should have watched happen, so waiting a beat for him to
   * actually run is not a workaround for the freeze; it is the instruction landing
   * after its demonstration rather than before it. */
  static WARMUP = 1.1;              // seconds of game time before the first step

  /* THE READING PAUSE, and it is the whole of requirement 1: a line is not finished when
     its last word appears, and it is not finished when the voice stops. It is finished
     when BOTH have happened — and then it is held, still complete on screen, for this
     long before anything is allowed to move on. One second reads comfortably for a child
     at this sentence length; it is one number here so it can be tuned without hunting. */
  static READ_PAUSE = 1.0;

  /* How long a word takes to arrive once its turn comes (.tut-text .w in screens.css).
     The reveal is NOT finished at the last word's DELAY — it is finished 460ms after it,
     and a sentence swapped out in between is a sentence the player never fully saw. */
  static WORD_IN = 0.46;

  /* The gap between the last word landing and the reading pause starting, so the two do
     not run into each other on a slow frame. */
  static SETTLE = 0.12;

  update(dt) {
    if (this.done || this.step < 0) return;
    const g = this.game.debug();

    /* THE TUTORIAL ENDS WHEN THE GAME DOES. Nothing here can teach anything once the
       journey is over, and outliving it made a visible mess: a player who got ahead of
       the script — or past a step whose target never appeared — reached the ending with
       the tutorial still holding a describing step. On screen that was the whole game
       blurred behind the sheet, the ending card and the Play again button over the top
       of it, and the dialogue box parked at the left edge pointing at something that no
       longer existed.

       Checked before any step runs, so no step can execute in a state it was never
       written for. */
    if (g.complete || g.state === 'COMPLETE' || g.state === 'FINAL_RUN') {
      this.finish();
      return;
    }
    if (this.step === 0 && (g.t || 0) < Tutorial.WARMUP) {
      this.resume();
      this.show(null);
      return;
    }

    /* WHAT THE PLAYER ACTUALLY DID, read straight off the game each tick.
     *
     * This was first wired through onHud and that cannot work: onHud fires from the
     * engine update, which an explaining step has PAUSED, and it only fires when its
     * state object changes — so it is neither running nor per-frame at the moments
     * this needs. Reading here means the jump step is satisfied by the character
     * genuinely leaving the ground and the cut step by an attempt being recorded, and
     * neither can be satisfied by tapping past it. */
    const anim = this.game.mammothState && this.game.mammothState();
    if (anim === 'JUMP_AIR' || anim === 'LAND') this.didAction('jumped');
    if ((g.attempts || 0) > 0) this.didAction('cut');

    // the follow-up line ("Nice hop!") runs on its own clock over the next step
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0) this.follow = null;
    }

    const s = this.steps[this.step];
    if (!s) { this.finish(); return; }

    /* NOT READY YET is a normal state, not an error. A step waits for its own moment —
       a rock coming into range, the blocks arriving — and while it waits the game runs
       and the layer shows nothing. */
    if (!s.at(g)) {
      // nothing is presenting while a step waits for its moment
      if (this._presenting) { this._presenting = false; if (this.game.setDialogue) this.game.setDialogue(false); }
      /* A STEP THAT HAS STARTED AND LOST ITS MOMENT IS OVER, not waiting. The game accepts a
         cut about a second before the teaching line on the plank has finished; a quick learner
         who cut the right rope in that second moved the game on to the success — and this
         step's gate then stayed false for ever, so the tutorial sat on it, the ask that
         followed never started, and "Perfect fit!" was never said. Measured in the tutorial
         spec, which cuts the moment the pieces hang. So: a describing step that has begun and
         whose moment has passed is finished; an ask whose action has already been recorded
         (the cut is counted in G.attempts) is satisfied. A step that has not begun still waits. */
      if (this.t > 0 && typeof s.advance === 'number') { this.next(); return; }
      if (s.advance === 'cut' && (g.attempts || 0) > 0) { this.next(); return; }
      this.resume(); this.show(null); return;
    }
    /* A SIGN STEP HAS NO TARGET. Its words are on the plank, so it points at nothing — and the
       missing box used to skip it silently, which left the tutorial stuck on the line before it
       and let the question reach the plank first. */
    const onSignStep = typeof s.sign === 'number';
    const box = onSignStep ? null : s.spot(g);
    if (!onSignStep && !box) { this.resume(); this.show(null); return; }

    this.t += dt;
    /* A NUMBER freezes the game for that many seconds of the step, then lets it run: an ask
       that has to be READ before it can be acted on ("Tap to jump over obstacles.") holds
       the obstacle still for the reading, exactly as the old describing step did, and then
       the run resumes with the hand still asking. `true` freezes for the whole step. */
    /* 'line' freezes until the dialogue has finished AND been read (readTime); a number
       freezes for that many seconds; true freezes for the whole step. */
    const holdFor = s.pause === 'line' ? this.readTime(this.follow || (typeof s.text === 'function' ? s.text(g) : s.text)) : null;
    const frozen = s.pause === true ||
                   (holdFor !== null && this.t < holdFor) ||
                   (typeof s.pause === 'number' && this.t < s.pause);
    // an ask's freeze may arm a jump for later; a line being read may not (see api.setPaused)
    if (frozen) this.pause(typeof s.pause === 'number' || s.pause === 'line'); else this.resume();

    /* DESCRIBING or ASKING — a number of seconds means the former. The veil and the
       frozen copy belong to describing steps; the hand belongs to asking ones. */
    const describing = typeof s.advance === 'number';
    const line = this.follow || (typeof s.text === 'function' ? s.text(g) : s.text);
    /* THE LINE IS SPOKEN AS IT APPEARS, once per step, and the words are revealed in step with
       it (see setWords). The voice's length also sets how long a describing step holds, so a
       line is never taken off the screen mid-sentence. */
    if (!this.spoke && line) {
      this.spoke = true;
      /* A VOICE THAT THROWS IS A VOICE THAT IS NOT THERE — it is not the end of the lesson.
         say() returns a length, or 0 when the line will not be heard, and the completion gate
         is built on that (see readTime). But it can also THROW: a revoked AudioContext, a
         decode that blew up, a host that has torn the audio layer down. Unguarded, that
         exception left update() before it had drawn anything, which killed the animation
         frame that drives this layer — so the tutorial stopped dead on its first line AND the
         game stayed frozen behind it, with no way out. Measured: with say() throwing, not one
         sentence ever appeared. Caught, the line simply has no voice and is gated on its text
         alone, which is the same path muting already takes. */
      let dur = 0;
      try { dur = (this.game.say && this.game.say(VO[s.id] || '')) || 0; }
      catch (e) { dur = 0; }
      this.voDur = dur;
      this.voId = VO[s.id] || null;
      this.voWords = this.voId && this.game.voWords ? this.game.voWords(this.voId) : null;
    }
    /* ONE SENTENCE AT A TIME (see beats). `text` from here down is the sentence showing
       NOW rather than the whole line, and show() pops the box afresh for each one. The plank
       is the exception: a sign step hands its whole line over below, because the plank is a
       written question and not someone speaking. */
    const beat = this.beatAt(line, this.t);
    this._beat = beat;
    const text = beat.text;
    this._beatDur = beat.dur;

    /* THE GAME IS TOLD A LINE IS PRESENTING, and it is the engine that acts on it: while
       this holds, a tap cannot skip the collapse or the card's hold (skipPreRoll) and the
       idle hints do not start counting. One flag, pushed from here, because the engine
       never reads the DOM and the tutorial is the only thing that knows a line is up.
       It covers the reading pause as well — the line is not finished until that is over. */
    this._presenting = !!line && this.t < this.readTime(line);
    /* IN STEP WITH THE VOICE, NOT WITH THE WALL CLOCK.
       The delays on the words are measured off the recording, so they are only right while
       the recording is playing. It might not be yet: AudioManager.say holds a line rather
       than speak over the one before it, the context may still be opening, and pausing the
       game suspends the audio mid-sentence. In every one of those the words would carry on
       alone. So the reveal is parked unless the voice for THIS line reports that it is
       running, and it is the audio that is asked — never this object's own clock.

       A line with no voice at all (muted, a take that failed, a silent playthrough) must
       not be parked forever: with no per-word timings in play the even-step fallback is
       what is on screen and it is allowed to run. */
    const usingVoice = !!(this.voWords && this.voId);
    const speaking = usingVoice ? this.game.voAt(this.voId) >= 0 : true;
    if (this.el.text) this.el.text.classList.toggle('waiting', usingVoice && !speaking);
    if (this.game.setDialogue) this.game.setDialogue(this._presenting);

    /* ON AN ASKING STEP THE WORDS LEAVE AND THE HAND STAYS.

       An asking step waits for the player, which can be a while — and the box was
       sitting over the blocks for all of it, covering the very things being pointed
       at. So the sentence is shown long enough to be read and then goes, leaving the
       hand demonstrating on a clear screen. The step itself carries on waiting.

       A describing step keeps its box for its whole life, because the box IS the step. */
    /* AN ASKING STEP'S WORDS LEAVE PROMPTLY. A describing step keeps its box for its
       whole life, because the box IS the step. An asking step waits for the player,
       which can be as long as they like — so the sentence gets a short read and then
       goes, leaving the hand demonstrating on a clear screen.

       It was readTime + 0.6, which for the longest line was 5.2s. That is far too long
       to sit over the blocks being pointed at, and it never showed up in testing
       because the harness performed the action within a second every time — so the
       box was measured as present and never seen to leave. Short lines on asking steps
       and a 2.4s cap: long enough to read four words, short enough to get out of the
       way before anyone is ready to act. */
    /* A SIGN STEP has no bubble at all: its words are on the plank (see api.saySign below), and
       a box saying the same thing twice is noise. The hand and the lit row stay. */
    /* A HAND-ONLY STEP shows the gesture and nothing else: the plank is carrying the words. */
    if (s.handOnly) {
      if (this.el.bubble) this.el.bubble.hidden = true;
      this.hideFocus();
      /* A step whose demonstration is DRAWN BY THE ENGINE turns it on here rather than
         showing a hand of its own — see the note on the cut step. Kept in step with the
         step itself, and switched off again in finish()/next(), so a tutorial that is
         skipped or that throws can never leave a demo line on the slab. */
      if (s.demo && this.game._l2Demo) this.game._l2Demo(true);
      this.show(this.toView(box, g), '', false, s.hand || null, false, null, true);
      return;
    }
    const onSign = typeof s.sign === 'number';
    if (onSign) {
      this.game.saySign(this.t < s.sign ? line : '', this.voDur);
      if (this.el.bubble) this.el.bubble.hidden = true;
      this.showFocus(s.focus || null);            // the row stays lit for as long as the step does
      this.show(null, '', false, s.hand || null, false, null, true);
      /* AND IT STILL ENDS BY ITSELF. This branch returns before the self-advance at the foot of
         update(), so without this line the plank kept the teaching sentence for the rest of the
         phase: the question never arrived and the panel never left the screen. The sentence holds
         for as long as it is spoken (readTime follows the voice), then next() hands the plank back. */
      if (describing && this.t >= this.readTime(line)) this.next();
      return;
    }
    /* MEASURED ON THE WHOLE LINE, not on the sentence showing: an ask's box has to
       survive long enough for every one of its sentences. 3.2s is the cap on that — long
       enough for two short beats, short enough to be out of the way before anyone is
       ready to act. A describing step keeps its box for its whole life, because the box
       IS the step. */
    /* THE BOX STAYS FOR THE WHOLE LINE, on an ask as well as on a describing step. It used
       to be capped at 3.2s so it did not sit over the blocks while the player thought — but
       a cap can cut a sentence off before it has finished arriving, which is the fault this
       round exists to fix. It now leaves when the line is genuinely finished: every word
       shown, the voice done, and the reading pause spent. */
    const keepBox = describing || this.t < this.readTime(line);
    this.show(this.toView(box, g), text, describing, s.hand || null, keepBox, s.focus || null, s.pause === false);

    // and a describing step moves on once every sentence has been up long enough to read
    if (describing && this.t >= this.readTime(line)) this.next();
  }

  /* THE VIEW TRANSFORM, applied to canvas-space targets only.
   *
   * A phase zooms the canvas by k about a stage point, so a spotlight positioned at a
   * raw stage coordinate no longer sits on the thing it is pointing at — the mammoth,
   * the ditch and the block row all move outward from the focus, by more the further
   * out they are. The radius scales too, or the light stops matching the object.
   *
   * The JUMP button target is measured from a real DOM rect and is already in screen
   * space, so it must NOT be mapped: doing that would move the one target that was
   * correct. That is what `world` marks. */
  toView(box, g) {
    const k = g.zoom || 1;
    if (!box.world || k <= 1.0005) return box;
    const fx = g.zoomVX, fy = g.zoomVY;
    const out = {
      x: fx + (box.x - fx) * k,
      y: fy + (box.y - fy) * k,
      world: box.world
    };
    // both axes scale, or an oval stops matching the row it hugs
    if (box.r !== undefined) out.r = box.r * k;
    if (box.aimX !== undefined) out.aimX = fx + (box.aimX - fx) * k;
    if (box.belowY !== undefined) out.belowY = fy + (box.belowY - fy) * k;
    /* AND THE HAND'S OWN SPOT. It was DROPPED here — the mapped box was rebuilt field by
       field and handX/handY were not among them — so a spot that placed its hand
       somewhere other than the box's centre lost that placement the moment the puzzle
       zoomed, which is every moment the rope hand is ever shown. The hand fell back to
       the box's centre: the block's anchor, not the cut line. */
    if (box.handX !== undefined) out.handX = fx + (box.handX - fx) * k;
    if (box.handY !== undefined) out.handY = fy + (box.handY - fy) * k;
    if (box.rx !== undefined) out.rx = box.rx * k;
    if (box.ry !== undefined) out.ry = box.ry * k;
    return out;
  }

  /* THE WORDS, ONE AT A TIME, WITH ONE OF THEM LOUD.
     Each word is its own span so it can rise into place a beat after the one before —
     the sentence arrives the way a voice says it, not as a block. The KEY word of the
     sentence (anything the writer put in capitals, or one of the game's own nouns and
     verbs) is marked .pow: heavier, deep blue, tilted a few degrees. One accent per
     sentence at most; the rest stays black on yellow, which is what a new reader needs.
     textContent of the result equals the plain text, so the change detection above
     still works. */
  setWords(text) {
    const el = this.el.text;
    if (!el) return;
    /* IN STEP WITH THE VOICE. The words rise one after another; when the line is spoken, the
       whole reveal is spread across the clip (a beat per word, never faster than 55 ms or slower
       than 210 ms) so the text keeps pace with what is being said. Silent, it is the old 55 ms. */
    const words = (text || '').trim().split(/\s+/).filter(Boolean).length || 1;
    /* ACROSS THIS SENTENCE'S SHARE OF THE CLIP. The reveal is measured against the LAST
       word's delay, not the word count, and spread over 82% of the span — so the sentence
       finishes arriving just as the voice finishes saying it. It used to spread across the
       WHOLE line's clip, which was right while the whole line sat in the box at once; now
       that the sentences arrive one at a time (see beats), each has to keep pace with its
       own share of the recording or the second one crawls in after the voice has left it. */
    /* THE LAST WORD HAS TO LAND BEFORE THE SENTENCE LEAVES. The step used to be 82% of the
       beat divided by the word count — which places the last word's DELAY inside the beat
       but lets its 460ms arrival run past the end of it, so on a short beat the sentence was
       swapped out while its final word was still fading in. The room for the animation and a
       settle is taken off first now, so the reveal always completes with time to spare. */
    const span = (this._beatDur || (this.voDur > 0 ? this.voDur : 0));
    const room = span - Tutorial.WORD_IN - Tutorial.SETTLE;
    this._wordStep = (span > 0 && words > 1 && room > 0)
      ? clampN(room / (words - 1), 0.055, 0.55)
      : 0.055;
    /* THE REAL TIMES, WHEN THE TAKE HAS BEEN MEASURED.
       Everything above is the fallback — an even step across the beat, which is what a
       silent playthrough and an unmeasured take still get. When tools/vo-bake-words.mjs has
       written per-word offsets, each word instead gets the moment it is actually spoken,
       relative to the start of its own sentence. That is the whole point of this change:
       "This is Momo." and "He needs to find his friend." are not spoken at the same rate,
       and no single step describes both.

       Offsets are the LINE's; a beat is one sentence of it, so its first word's offset is
       subtracted to make them relative to when this sentence appears. */
    const beat = this._beat;
    const all = this.voWords;
    let at = null;
    if (all && beat && beat.i0 != null && all.length >= beat.i0 + words) {
      /* ANCHORED TO WHERE THE VOICE ACTUALLY IS, not to where this sentence was due.
         The offsets are measured from the start of the LINE, so a sentence's own delays
         are its words minus its first word. That is right only if the sentence is written
         to the screen at the exact moment its first word is spoken, and it never is: the
         beat is swapped on the game's update tick, the browser paints on the next frame,
         and the CSS clock starts there. Measured on a loaded machine the second sentence
         began about 0.3s — one or two words — behind the voice.

         So the anchor is the voice's real position when the words are written. If it has
         already passed this word, the delay is zero and the word is simply there; if it
         has not, the delay is the remaining wait. This also absorbs a resume: the reveal
         is parked while the voice is not running (see the 'waiting' class) and re-anchors
         on the next write, so a pause in the middle of a sentence cannot leave the two
         apart. A take that is not being spoken reports -1 and falls back to the offsets. */
      /* WHICH WORD OF THE LINE THIS SENTENCE STARTS AT, published on the element. Only a
         test reads it, and it needs to: the offsets are the line's, the sentence on screen
         is a slice of it, and comparing a count of one against a count of the other is how
         a sync check quietly measures the wrong thing. */
      el.dataset.w0 = String(beat.i0);
      const now = (this.voId && this.game.voAt) ? this.game.voAt(this.voId) : -1;
      const base = now >= 0 ? Math.max(all[beat.i0], now) : all[beat.i0];
      at = [];
      for (let k = 0; k < words; k++) at.push(Math.max(0, all[beat.i0 + k] - base));
    }
    const KEY = /^(friend|cross|watch|tap|jump|broken|right|fix|perfect|ice|rope|cut|swipe)[!.,?]*$/i;
    /* THE FALLBACK, and it is needed BECAUSE the sentences arrive one at a time. A line
       used to be in the box whole, so its one key word was always somewhere in it. Split
       at its full stops, a sentence can have none: "This is Momo." carries the verb of
       the line in its second half, and it arrived with nothing picked out at all — a flat
       grey sentence where every other one has a word in orange.
       So a sentence with no verb of its own accents the NAME instead, which is the right
       word to lean on the first time a child meets him. Tried second, never first, so
       "Help Momo cross the Frozen Pass!" still leans on `cross` — the owner's list of key
       words is unchanged, this only fills a gap it never had to cover before. */
    const NAME = /^(momo|frozen)[!.,?]*$/i;
    const parts = (text || '').split(/(\s+)/);
    const list = parts.filter(p => p && !/^\s+$/.test(p));       // the words alone, without the gaps
    const loudAt = w => (w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w)) || KEY.test(w);
    /* Decided BEFORE anything is written, because the fallback has to know whether a real
       key word turns up later in the sentence — marking as it went would accent the name
       and then find the verb two words further on. */
    let pow = list.findIndex(loudAt);
    if (pow < 0) pow = list.findIndex(w => NAME.test(w));
    let i = 0, n = 0;
    el.textContent = '';
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p)) { el.appendChild(document.createTextNode(p)); continue; }
      const w = document.createElement('span');
      w.className = n === pow ? 'w pow' : 'w';
      n++;
      const k = i++;
      w.style.setProperty('--i', k);
      if (this._wordStep) w.style.setProperty('--wd', this._wordStep.toFixed(3) + 's');
      if (at && at[k] != null) w.style.setProperty('--wdly', at[k].toFixed(3) + 's');
      else w.style.removeProperty('--wdly');
      w.textContent = p;
      el.appendChild(w);
    }
  }

  /** THE BOX HUGS THE WORDS.
   *
   * `width: max-content` capped by `max-width` hands the box the WHOLE cap as soon as the
   * sentence is longer than it, and `text-wrap: balance` then breaks that sentence into lines
   * far shorter than the cap. Measured on "This is Momo. He needs to find his friend.": a 500px
   * box with a 336px widest line — 82px of empty yellow, which is why the bubble read as
   * half-empty with the words pushed to one side.
   *
   * So the lines are measured and the box is set to the widest of them. Every word is its own
   * inline-block (setWords), so `offsetTop` groups them into lines and offsetLeft/offsetWidth
   * bound each one — LAYOUT geometry, so the pop animation's transforms cannot corrupt it. A
   * narrower box can never pull a word up onto the line above, so the wrap survives the change;
   * `balance` is given one chance to re-break it and the wider result wins.
   *
   * The vertical air is balanced the same way. A line box reserves the font's descent plus
   * half-leading under the baseline and only (ascent - cap height) plus half-leading over a
   * capital, so equal padding leaves MORE space under the last line: measured 47px against
   * 42px. The bottom padding is trimmed by the difference. */
  hugWords(b) {
    const tx = this.el.text;
    if (!b || !tx) return;
    b.style.width = ''; b.style.paddingBottom = '';      // measure the natural wrap, not the last hug
    const cs = getComputedStyle(b);
    const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0, padT = parseFloat(cs.paddingTop) || 0;
    const lines = () => {
      const ws = [];
      for (const w of tx.querySelectorAll('.w')) ws.push({ l: w.offsetLeft, r: w.offsetLeft + w.offsetWidth, t: w.offsetTop });
      const tops = [];
      for (const w of ws) if (!tops.includes(w.t)) tops.push(w.t);
      let widest = 0;
      for (const t of tops) {
        let a = Infinity, z = -Infinity;
        for (const w of ws) if (w.t === t) { if (w.l < a) a = w.l; if (w.r > z) z = w.r; }
        if (z - a > widest) widest = z - a;
      }
      return { widest, n: tops.length };
    };
    /* SLACK, AND THE LINE COUNT IS THE VERDICT. offsetLeft/offsetWidth are integers, so a line
       measured at 226 can really need 226.4 — hugged to exactly 226 the last word wrapped and
       "Watch out!" came out on two lines in a box twice as wide as it needed. So a few pixels
       of slack are tried in turn and the first width that keeps the sentence on no more lines
       than it already has wins; if none does, the inline width is dropped and the CSS cap
       decides, as it did before.

       AND IT REPEATS UNTIL IT SETTLES, because narrowing the box lets `balance` re-break the
       same number of lines more evenly, which makes the widest line narrower again: measured
       "Tap to jump over obstacles." hugging to 429 and then only using 308 of it. Three passes
       is far more than the two any of these sentences take. */
    let cur = lines();
    for (let pass = 0; pass < 3 && cur.widest > 0; pass++) {
      const settled = b.style.width && Math.abs(parseFloat(b.style.width) - (cur.widest + 2 + padL + padR)) < 4;
      if (settled) break;
      const wasWidth = b.style.width;
      let ok = false;
      for (const slack of [2, 5, 10, 18]) {
        b.style.width = Math.ceil(cur.widest + slack + padL + padR) + 'px';
        const after = lines();
        if (after.n <= cur.n) { ok = true; cur = after; break; }
      }
      if (!ok) { b.style.width = wasWidth; break; }
    }
    /* BALANCE A TWO-LINE SENTENCE. `text-wrap: balance` cannot see the words — they are
       inline-block spans — so the wider 760 px cap broke "Use the right ice piece to fix the
       path." into a long first line and "path." alone (seen live). With the line count fixed,
       the box is narrowed in steps to the smallest width that still holds that many lines;
       the widest line of that break is the balanced one, and the hug is applied to it. */
    if (cur.n >= 2 && cur.widest > 0) {
      const startW = parseFloat(b.style.width) || (cur.widest + padL + padR);
      let bestW = startW, best = cur;
      for (let w = startW * 0.94; w > startW * 0.5; w *= 0.94) {
        b.style.width = Math.ceil(w) + 'px';
        const now = lines();
        if (now.n > cur.n) break;
        bestW = w; best = now;
      }
      b.style.width = Math.ceil(best.widest + 4 + padL + padR) + 'px';
      if (lines().n > cur.n) b.style.width = Math.ceil(bestW) + 'px';
    }
    const trim = this.inkTrim(tx);
    if (trim > 0.5) b.style.paddingBottom = Math.max(0, padT - trim) + 'px';
  }

  /** descent - (ascent - cap height) for the words' own font, in px: how much more air a line
      box leaves under a baseline than over a capital. Cached per font size; 0 if the metrics
      are not available, which simply leaves the padding even. */
  inkTrim(tx) {
    const st = getComputedStyle(tx);
    const font = st.fontWeight + ' ' + st.fontSize + ' ' + st.fontFamily;
    if (this._trimFont === font) return this._trim;
    let trim = 0;
    try {
      this._probe = this._probe || document.createElement('canvas');
      const c = this._probe.getContext('2d');
      c.font = font;
      const m = c.measureText('Hxdp');
      const fsz = parseFloat(st.fontSize) || 20;
      const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent, cap = m.actualBoundingBoxAscent;
      trim = (asc && desc && cap) ? desc - (asc - cap) : 0;
      trim = Math.max(0, Math.min(trim, fsz * 0.3));
    } catch (e) { trim = 0; }
    this._trimFont = font; this._trim = trim;
    return trim;
  }

  /* ---- the focus canvas ---- */
  showFocus(kind) {
    const f = this.el.focus;
    if (!f) return;
    const key = kind + ':' + this.step;
    if (this._focusKey !== key) {
      this._focusKey = key;
      try { this.game.renderFocus(f, kind); }
      catch (e) { /* nothing to lift: the sheet and the words still read */ }
    }
    if (f.hidden) f.hidden = false;
  }
  hideFocus() {
    const f = this.el.focus;
    if (f && !f.hidden) f.hidden = true;
    this._focusKey = null;
  }

  /* ---- the layer ---- */
  /** `running`: the step speaks over a game that has NOT been stopped (pause: false) — no veil. */
  show(box, text, describing, gesture, keepBox, focus, running) {
    const L = this.el.layer;
    if (!L) return;
    if (!box) {
      if (!L.hidden) L.hidden = true;
      this.hideFocus();
      return;
    }
    if (L.hidden) L.hidden = false;
    /* THE BLUR IS ONLY FOR STEPS THAT EXPLAIN. An action step needs the player to see
       the whole scene and swipe across a rope in it, so blurring it would fight the
       very thing being asked for — and the cut-out would be a frozen copy over a
       moving game. On those steps the veil and the copy are both off and only the
       words and the hand remain. */
    /* AND NOT FOR A LINE SPOKEN OVER A RUNNING GAME. "Perfect fit! Keep going!" is a
       describing step with pause:false — the run resumes under it — and it was blurring
       the whole moving scene (asked: "why does this stage look blurred?"). A veil belongs
       only to a step that has stopped the game to explain something. */
    if (this.el.veil) this.el.veil.hidden = !describing || !!running;
    if (!describing) this.hideFocus();

    const pc = (v, of) => (v / of * 100).toFixed(2) + '%';
    /* Each axis as a percentage of ITS OWN axis, which is the only way a percentage
       size lands where it was meant to: width against 1920, height against 1080. A box
       that gives rx and ry gets an oval hugging it; one that gives a single r gets a
       circle, because rx and ry come out equal. */
    const rx = box.rx !== undefined ? box.rx : box.r;
    const ry = box.ry !== undefined ? box.ry : box.r;

    /* THE FOCUS: THE SUBJECT, DRAWN ALONE, GLOWING ALONG ITS OWN OUTLINE.
     *
     * A rectangle of the game canvas used to be copied here and lifted over the blur.
     * It brought the sky and ice behind the subject with it, so what sat over the
     * sheet was a patch of picture with a shape of its own — an oval, then a rounded
     * square — and every version read as a spotlight or a panel stuck on the scene.
     *
     * Now the engine re-draws the subject by itself onto the focus canvas
     * (game.renderFocus) and the stylesheet glows that canvas by its alpha. The alpha
     * IS the subject's silhouette, so the glow follows the character's outline, the
     * rock's, the row's — and no background comes with it, because none was drawn.
     *
     * Once per step, not per frame: every step that shows this has frozen the game. */
    if (describing && focus) this.showFocus(focus);
    const b = this.el.bubble;
    /* THE WORDS GO IN FIRST, because the box cannot be placed until its height is
       known and its height depends on how many lines the sentence wraps to. It used to
       be written afterwards, so the placement worked off a guessed 130px half-height
       while the real box measured anywhere from 147 to 213. */
    const fresh = !!(this.el.text && this.el.text.textContent !== text);
    if (b && fresh) {
      this.setWords(text);
      this._boxH = 0;                 // force a re-measure on the new wrap
    }
    if (b) {
      /* IT MUST FIT ON THE STAGE, whichever side it goes.
       *
       * The rule used to be "above if there is room above, otherwise below" and that
       * is only half a rule: a big spotlight has no room above AND no room below, so
       * the fallback pushed the box off the bottom edge and the sentence was cut in
       * half. Measured on the block row: a 1228px light put the box at y 1109 on a
       * 1080 stage.
       *
       * So both sides are computed, each is checked against the stage, and the side
       * with room wins; if neither has room the box is clamped inside and kept on the
       * side with more of it. HALF is the box's own half-height — it is centred on the
       * y it is given, so that much has to be inside the edge at either end. */
      /* MEASURED, AND THE CENTRE IS OFFSET BY IT — which is the fix for the panel
       * sitting on top of the character.
       *
       * The box is positioned by its CENTRE (translate: -50% -50%), and the old code
       * put that centre at `subjectTop - GAP`. That is where its bottom EDGE belongs,
       * so the box hung half its own height down into the subject: for the mammoth,
       * 213px of box centred at y 435 covered everything from 328 to 541 while the
       * character starts around 470. Seventy pixels of panel across his back and head,
       * every time.
       *
       * The height is now read off the laid-out element rather than assumed. 130 was a
       * guess and the real box is 147-213 depending on how the sentence wraps, so even
       * the sign of the error changed with the text. */
      const st = this.root.getElementById('stage');
      /* MEASURED VISIBLE, AND MEASURED PER SENTENCE. The previous asking step hides the box
         once its words have been read (the hand carries on alone), so the next describing
         step used to measure and fit a HIDDEN box: zero wide, and fitBubble drew a 40x30
         sliver with a tail off to one side while the words floated over the blur (seen on
         "Oh no! The path is broken."). Unhide before measuring. And re-measure whenever the
         sentence changes: the first sentence's height was cached for all of them, which
         placed a three-line box as if it were two. */
      /* AND RE-MEASURE WHEN THE BOX COMES BACK. If the sentence changed while the box was
         hidden — an ask drops its words and the next beat arrives behind them — setWords ran
         but the hug did not, because a hidden box measures zero. The box then came back
         wearing the width of the sentence before it. */
      if (b && keepBox && b.hidden) { b.hidden = false; this._boxH = 0; }
      const sizeKey = st ? st.clientWidth + 'x' + st.clientHeight : '';
      /* AND WHEN THE WORDS THEMSELVES CHANGE SIZE UNDER THE BOX.
         The box is fitted to the laid-out sentence — its width AND its bottom padding, which
         is trimmed by the font's own descent so the air above the capitals matches the air
         under the last line. All of that is measured in whatever face is on screen at the
         moment of measuring, and Baloo 2 arrives when it arrives: on a cold cache the first
         line can be fitted to the fallback and then reflow narrower and shorter inside a box
         that no longer matches it (measured: 46px of empty yellow beside "This is Momo.",
         and 5px of mismatched air). fonts.ready alone does not cover it — it can resolve
         before this layer exists — so the trigger is the thing that actually changed: the
         text's own laid-out width. */
      const inkW = this.el.text ? this.el.text.scrollWidth : 0;
      const reflowed = this._hugInkW !== undefined && Math.abs(inkW - this._hugInkW) > 1;
      if (st && b && !b.hidden && (fresh || reflowed || !this._boxH || this._sizeKey !== sizeKey)) {
        this._sizeKey = sizeKey;
        this.hugWords(b);
        this._hugInkW = this.el.text ? this.el.text.scrollWidth : 0;
      }
      /* MEASURED WHENEVER THE BOX CHANGES SIZE, from layout (offsetWidth/Height ignore the
         pop-in transform), back into stage units. Measured once per sentence it went stale:
         the words re-wrapped a frame after the hug, the box grew from 449 to 502 stage px, and
         the edge clamp — still working off 449 — let "piece to fix the path." run 44px off the
         right of the stage on the rightmost block. */
      if (st && b && !b.hidden && (fresh || !this._boxH || b.offsetWidth !== this._measW || b.offsetHeight !== this._measH)) {
        this._measW = b.offsetWidth; this._measH = b.offsetHeight;
        if (b.offsetHeight && st.clientHeight) this._boxH = b.offsetHeight / st.clientHeight * H;
        if (b.offsetWidth && st.clientWidth) this._boxW = b.offsetWidth / st.clientWidth * W;
      }
      const HALF = (this._boxH || 200) / 2;
      /* Room for the tail plus clear air. The tail is ~30 stage px, and a panel that
         merely touches the subject still reads as resting on it. */
      /* THE TIP TOUCHES THE SUBJECT. The gap between the body and the subject IS the tail's
         length (bubble.js: 17% of the body height, 56..110 CSS px, converted to stage units),
         plus 6px of air — so the tip lands on the subject's edge instead of the body sitting
         a fixed 54px away with the tail poking into a halo that is not the thing. */
      const stageK = st && st.clientHeight ? H / st.clientHeight : 1;
      const tailCss = clampN((b.offsetHeight || 120) * BUBBLE.tailLen, BUBBLE.tailLenMin, BUBBLE.tailLenMax);
      const GAP = tailCss * stageK + 6;
      const upY = box.y - ry - GAP - HALF;      // bottom edge clears the subject top
      // below: from the subject's own bottom, or from a box-supplied fallback edge (see ropeBox)
      const dnY = (box.belowY !== undefined ? box.belowY : box.y + ry) + GAP + HALF;
      const upFits = upY - HALF > 0;
      const dnFits = dnY + HALF < H;
      let above, y;
      if (upFits) { above = true; y = upY; }
      else if (dnFits) { above = false; y = dnY; }
      else {
        // neither side fits: take the roomier one and clamp the box onto the stage
        above = (box.y - ry) > (H - (box.y + ry));
        y = clampN(above ? upY : dnY, HALF + 8, H - HALF - 8);
      }
      /* THE BOX IS CLAMPED TO THE STAGE; THE TAIL IS NOT.
       *
       * The box has to stay on screen, so its centre is clamped away from the edges.
       * The tail was pinned to the middle of the box, which means that every time the
       * clamp moved the box the tail stopped pointing at the thing being described —
       * and the further the target was towards an edge, the further out the tail
       * pointed. On the JUMP button, which sits in the bottom-right corner, it was off
       * by hundreds of pixels: an arrow confidently indicating empty ice.
       *
       * So the box is placed under the clamp as before, and then the tail is offset
       * INSIDE it by however much the clamp moved it — which lands the tail on the
       * target whatever the box had to do. Kept clear of the rounded corners, because a
       * tail growing out of a curve looks detached however well it is aimed. */
      /* CLAMPED BY THE BOX'S OWN WIDTH. The margin used to be a flat 320 stage units, which is
         half of a 640-wide box — anything wider hung over the edge, and on a phone the widest
         sentence measured 1286 stage units and lost its first two words off the left of the
         screen. The tail is offset back onto the subject below, so a clamp costs nothing. */
      const halfW = Math.min((this._boxW || 420) / 2 + 12, W / 2);
      let bx = clampN(box.x, halfW, W - halfW);
      /* AND CLEAR OF THE SIGN. The instruction plank lives in the top-left band, and a box
         placed above the ropes shares that band — measured, it covered the last word of "Cut
         the TRIANGLE." The box is pushed right until it clears the plank; the tail is offset
         back onto its aim below, so the pointing does not suffer. */
      const signEl = this.root.getElementById('instruction-pill');
      const panel = this.root.getElementById('instruction');
      if (signEl && panel && !panel.hidden && st) {
        const sr = signEl.getBoundingClientRect(), sb = st.getBoundingClientRect();
        const kx = W / (st.clientWidth || 1), ky = H / (st.clientHeight || 1);
        const sRight = (sr.right - sb.left) * kx, sBottom = (sr.bottom - sb.top) * ky;
        if (y - HALF < sBottom + 8) bx = Math.max(bx, Math.min(sRight + halfW + 10, W - halfW));
      }
      b.style.left = pc(bx, W);
      b.style.top = pc(y, H);
      b.dataset.side = above ? 'above' : 'below';
      /* THE TAIL POINTS AT THE SUBJECT. The box is clamped onto the stage; the tail is
         not — it leaves the edge facing the subject at whatever point along that edge is
         nearest to it, and leans toward it, so it lands on the target however far the
         clamp moved the box. Rebuilt only when the box or the aim changes: fitBubble
         reads the box's layout, which is not something to do sixty times a second. */
      const boxW = this._boxW || 420;
      /* THE TIP, NOT THE BASE, LANDS ON THE AIM. bubble.js sweeps the tail so its tip sits
         0.62 of the tail's base width to the leaning side of where it leaves the body — up
         to 93px. Aiming the BASE at the subject (as this did) put the tip 93px beside it:
         the ditch line pointed at the ice next to the hole, the option line at the air
         beside the block. So the base is set back by that sweep, and the tip lands on the
         aim; the lean runs from the body's centre outward so the base stays inside it. */
      const aimX = box.aimX !== undefined ? box.aimX : box.x;
      const lean = aimX >= bx ? 1 : -1;
      const tipFrac = Math.min(BUBBLE.tailBaseMax / (b.offsetWidth || 400), BUBBLE.tailBase) * 0.62;
      const at = clampN(0.5 + (aimX - bx) / boxW - lean * tipFrac, 0.14, 0.86);
      const key = [above ? 'a' : 'b', at.toFixed(2), lean, text, b.offsetWidth, b.offsetHeight].join('|');
      if (this._bubbleKey !== key && this.el.shape) {
        this._bubbleKey = key;
        // the box ABOVE the subject hangs its tail BELOW, toward the subject, and vice versa
        fitBubble(this.el.shape, b, { side: above ? 'below' : 'above', at, lean });
      }
    }
    /* RESTART THE POP WHEN THE WORDS CHANGE — the text itself is written further up,
       before the placement, because the placement needs its height. A CSS animation
       appears and never again, so without this only the FIRST step of six would arrive
       with any motion and the rest would silently swap their text — a player would not
       notice the box had said something new. */
    /* `fresh` was read BEFORE the words were written above. Comparing again here always
       found them equal, so the pop restarted on the first step only and every later
       sentence swapped in silently — the very fault this block exists to prevent. */
    if (fresh) {
      if (b) { b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; }
      // a bubble arriving pops: the kit's pop, or the local bloop
      if (keepBox && this.game.sfx) { try { this.game.sfx('popIn'); } catch (e) { /* silent is fine */ } }
    }
    /* THE HAND ONLY WHERE A FINGER IS WANTED, and dead centre on the control.

       It used to appear on every step and sit at the lower edge of the focus. Both were
       wrong. A hand on a step with nothing to press teaches that the hand means
       nothing, so it now shows only where the step declares one — the JUMP button and
       the ropes. And it belongs ON the control rather than beside it: offsetting it was
       to stop it covering the mammoth, which is a problem that only existed because it
       was being shown on steps that were describing the mammoth. */
    const hd = this.el.hand;
    if (hd) {
      if (gesture) {
        hd.hidden = false;
        hd.dataset.gesture = gesture;      // CSS picks tap or sweep off this
        hd.style.left = pc(box.handX !== undefined ? box.handX : box.x, W);
        // a spot may keep a taller zone clear than where the hand belongs (see ropeBox)
        hd.style.top = pc(box.handY !== undefined ? box.handY : box.y, H);
      } else if (!hd.hidden) hd.hidden = true;
    }
    // the box goes when it has been read; the hand carries on
    if (b) b.hidden = !keepBox;
    /* THE LAYER NEVER SWALLOWS POINTER EVENTS. Nothing on it needs a tap any more:
       describing steps advance themselves and asking steps want the tap to reach the
       game. Skip has pointer-events of its own, so it still works. Blocking events here
       is what makes a tutorial unfinishable — it would eat the very swipe it asks for. */
    L.style.pointerEvents = 'none';
  }

  destroy() { this.resume(); }
}
