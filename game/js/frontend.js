/* Cover -> gameplay.
 *
 * There used to be a character-select stage between the two, for choosing between the
 * mammoth and a polar bear cub. With one explorer it became a screen that asks a
 * question with one answer — a tap the player has to make before the game will start,
 * teaching nothing and delaying everything — so PLAY now hands straight over to the run.
 *
 * What is left is the cover, and the hero image in the Ouch panel. Both animate the
 * character from its real run sheet rather than from a separate portrait: a sprite sheet
 * is a horizontal strip of N cells, so sizing the background to N x 100% and stepping
 * background-position-x plays it in the DOM. That keeps the screens using the exact same
 * artwork as the game, with nothing to keep in sync.
 */
export class Frontend {
  constructor(root, game) {
    this.game = game;
    this.root = root;
    this.el = {
      cover: root.getElementById('cover'),
      play: root.getElementById('btn-play'),
      loadingNote: root.getElementById('cover-loading')
    };
    this.state = 'ENTERING';
    this._timers = [];
  }

  /** @param {{onStart:Function}} handlers */
  init(handlers) {
    this.handlers = handlers;
    this.bind();
    this.el.cover.hidden = false;
    this.state = 'IDLE';
  }

  /** While the art is still loading: PLAY is shown but held, with a small note under it. */
  setLoading(v) {
    this.loading = !!v;
    this.el.cover.classList.toggle('loading', this.loading);
    if (this.el.play) this.el.play.setAttribute('aria-disabled', this.loading ? 'true' : 'false');
    if (this.el.loadingNote) this.el.loadingNote.hidden = !this.loading;
  }

  bind() {
    const press = (btn, fn) => {
      if (!btn) return;
      // pointerdown + preventDefault kills :active, so drive the pressed look here
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        btn.classList.add('pressed');
      });
      const up = () => btn.classList.remove('pressed');
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
      window.addEventListener('pointerup', up);
      btn.addEventListener('click', fn);
    };

    press(this.el.play, () => this.start());

    this._onKey = e => {
      if (this.el.cover.hidden) return;
      if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); this.start(); }
    };
    window.addEventListener('keydown', this._onKey);
  }

  /** Use the game's own sound palette, so the screens and the game agree. */
  sfx(name) { if (this.game.sfx) this.game.sfx(name); }

  /** The cover slides away and the run begins. */
  start() {
    if (this.loading) return;                 // the art is not in yet; the note says so
    if (this.state === 'READY') return;
    this.state = 'READY';
    this.sfx('ui');

    this.el.cover.classList.add('leaving');
    this.wait(400, () => {
      this.el.cover.hidden = true;
      this.el.cover.classList.remove('leaving');
      this.state = 'EXITING';
      if (this.handlers && this.handlers.onStart) this.handlers.onStart();
    });
  }

  /* NO PANEL HERO, AND NO FRAME PUMP FOR ONE. Two of these lived here and both are gone
     with the panels they filled: showHurt/hideHurt stepped sheet frames onto the Ouch
     card's hero on a setInterval, and showWin held one idle frame on the ending card's.
     The Ouch card went (a crash plays out and recovers by itself), and the ending card
     has no hero either — the real character is on the CANVAS behind it, celebrating next
     to the friend who was waiting, and a second still copy of him on the panel competed
     with that as well as covering the pair of them. `frameAt`, the sprite-strip-as-DOM-
     background helper both used, went with them: nothing outside the renderer animates
     the character any more, which is where that job belongs. */

  wait(ms, fn) { const t = setTimeout(fn, ms); this._timers.push(t); return t; }

  destroy() {
    // only wait() fills _timers, and only ever with setTimeout ids — the second sweep
    // with clearInterval was for the frame pumps above, which are gone
    this._timers.forEach(clearTimeout);
    window.removeEventListener('keydown', this._onKey);
  }
}
