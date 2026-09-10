/* Entry point.
   Boots the canvas engine, the DOM HUD and the cover/character-select front end,
   and exposes a few optional URL overrides for playtesting:

     index.html?speed=380      run speed in px/s (300–900)
     index.html?sound=0        start muted
     index.html?reduced=1      reduced-motion mode (less shake, fewer particles)
     index.html?skip=1         skip the cover/select screens and run immediately
     index.html?tutorial=0     never show the first-play tutorial
     index.html?tutorial=1     always show it, however many times it has been seen
     index.html?fast=4         fast-forward: simulation steps per rendered frame (1–8).
                               Steps the simulation rather than scaling dt, so physics
                               is identical to normal play — it just spends less wall
                               clock. Every pause in the game is a fixed duration in
                               milliseconds, so ?speed cannot shorten a playthrough.
*/

import { createGame, assetUrl } from './engine.js';
import { Hud } from './hud.js';
import { Frontend } from './frontend.js';
import { Tutorial } from './tutorial.js';

const canvas = document.getElementById('game-canvas');
const hud = new Hud(document);

const params = new URLSearchParams(location.search);
const num = (key, min, max, fallback) => {
  const v = Number(params.get(key));
  return Number.isFinite(v) && v >= min && v <= max ? v : fallback;
};
const flag = (key, fallback) => {
  const v = params.get(key);
  if (v === null) return fallback;
  return v !== '0' && v !== 'false';
};

const options = {
  speed: num('speed', 300, 900, 520),
  fast: num('fast', 1, 8, 1),
  sound: flag('sound', true),
  reduced: flag('reduced', false)
};

let front = null;

let tut = null;
let lastComplete = false;

/* THE TUTORIAL RUNS EVERY TIME, and the remembering is gone on purpose.
 *
 * It was suppressed after the first play, held in localStorage. That is the
 * conventional choice and it was the wrong one here, for a reason that showed up the
 * moment anyone tried to look at it: once the flag is set the tutorial is invisible
 * and there is no way back to it from inside the game — so a returning player, a
 * second child on the same browser, a classroom machine, or anyone reviewing the
 * build gets dropped straight into gameplay with no explanation and no clue that a
 * tutorial exists at all. A stored flag also makes the feature untestable by hand:
 * it works once and then appears broken forever.
 *
 * It is six short steps with a Skip in the corner, so the cost of showing it again is
 * one tap; the cost of hiding it is a player who never learns the cut. ?tutorial=0
 * suppresses it, which is what the test suite passes.
 */
const tutFlag = params.get('tutorial');
const wantTutorial = tutFlag !== '0' && tutFlag !== 'false';

/* THE BACKBUFFER AT SCREEN RESOLUTION. The stage is CSS-fitted to the window; the canvas
   behind it renders at (stage CSS width x devicePixelRatio) / 1920 times its 1920x1080
   layout, rounded to a quarter and capped at 2, so a hi-DPI laptop or a 4K screen gets
   real pixels instead of a stretched 1080p. ?rs=N forces it (the tests use it). */
const stageEl = document.getElementById('stage');
const wantScale = () => {
  const forced = Number(params.get('rs'));
  if (Number.isFinite(forced) && forced >= 1 && forced <= 2) return forced;
  const r = stageEl ? stageEl.getBoundingClientRect() : null;
  const cssW = r && r.width ? r.width : window.innerWidth;
  const k = cssW * (window.devicePixelRatio || 1) / 1920;
  return Math.min(2, Math.max(1, Math.round(k * 4) / 4));
};

/* WARM THE TYPE AND THE PRESSED PICTURES. Baloo 2 is only fetched when text first uses it,
   and the first text a player sees is the tutorial bubble — so the first sentence flashed
   in a fallback face for a moment. document.fonts.load starts the fetch now, behind the
   cover. The two pressed button pictures used to be <link rel=preload>, which Chrome
   warns about on every load because they are not painted within seconds; an Image()
   fetch is the same warm-up without the warning. */
if (document.fonts && document.fonts.load) {
  for (const w of [600, 700, 800, 900]) document.fonts.load(w + ' 20px "Baloo 2"').catch(() => {});
}
/* Nothing to warm here any more: the PLAY button is a single take, so there is no second
   picture that has to be in the cache before the first press. */

/* THE HD CHARACTER SET IS FOR TABLETS AND LAPTOPS, NOT PHONES. A 3x phone's stage is dense
   enough to qualify by scale alone, and that is exactly where six 3780x2880 sheets are a
   problem: a small device that cannot decode them was left with no character at all. So the
   set needs a dense screen AND a stage at least 1000 CSS px wide (every phone is under that,
   tablets and laptops are over) AND, where the browser says, at least 4 GB. ?hd=1/0 forces
   it. The scale itself still follows the screen, so a phone's canvas stays crisp. */
const wantHd = () => {
  const forced = params.get('hd');
  if (forced === '1') return true;
  if (forced === '0') return false;
  // a forced scale is a request for that whole path: ?rs=2 means the hd set too, on any stage
  if (params.has('rs')) return Number(params.get('rs')) >= 1.15;
  const r = stageEl ? stageEl.getBoundingClientRect() : null;
  const cssW = r && r.width ? r.width : window.innerWidth;
  const mem = navigator.deviceMemory;                 // Chrome only; undefined elsewhere
  return wantScale() >= 1.15 && cssW >= 1000 && !(mem && mem < 4);
};

const game = createGame(canvas, {
  renderScale: wantScale(),
  /* True while the stage cannot be seen: the rotate prompt covers it in portrait. The engine
     skips PAINTING while this holds; the simulation keeps running (see the frame loop). */
  hidden: () => { const el = document.getElementById('rotate'); return !!(el && !el.hidden); },
  hdArt: wantHd(),
  renderScaleForced: params.has('rs'),   // a forced scale is a request; the fps guard leaves it alone
  onReady: () => {
    if (flag('skip', false)) { game.begin(); startTutorial(); return; }
    /* THE COVER IS ALREADY UP (see below); the art has finished loading, so PLAY goes live.
       Before this the cover itself waited for the whole art set — five to six seconds of
       blank page on the deployment before anything appeared at all. */
    if (front) front.setLoading(false);
  },
  onHud: state => {
    hud.update(state);
    /* The Ouch panel used to be fed the explorer's own hurt frames from here. Both
       the panel and the frame pump are gone: the crash animation plays on the CANVAS
       now, from the delivered knockout sheet, which is where it always belonged.

       The WIN panel does still want a picture of the character, and it is filled once
       on the transition rather than every HUD tick — onHud fires on every state change
       and re-setting the same background image on each of them is work for nothing. */
    if (front && !!state.complete !== lastComplete) {
      lastComplete = !!state.complete;
      /* Nothing to fill: the win panel has no hero picture any more. The character on
         the CANVAS behind it is celebrating next to the friend who was waiting, which
         is the picture that matters, and a still copy of him on the panel competed
         with it — as well as covering the pair of them. */
    }
  }
});

/* THE TUTORIAL'S OWN TICK, on its own animation frame rather than inside onHud.

   Two reasons, and both are the kind that only show up once it is wired the other
   way. onHud fires from the engine update, which the tutorial PAUSES — so driving it
   from there would stop it dead on its first explaining step, with nothing left
   running to resume it. And onHud only fires when its state object CHANGES, so it is
   not a per-frame signal at all.

   This loop keeps running while the simulation is frozen, which is exactly the
   point, and the tutorial reads what it needs from debug() itself. */
function startTutorial() {
  if (!wantTutorial || tut) return;
  tut = new Tutorial(document, game);
  tut.begin();
  let last = performance.now();
  const tick = now => {
    if (!tut || tut.done) { tut = null; return; }
    /* THE TUTORIAL'S CLOCK IS REAL TIME, capped only against a tab switch.
     *
     * It was capped at 50ms a frame, which is the right cap for a SIMULATION — a big step
     * tunnels a collider through a rock. The tutorial simulates nothing; it times words
     * against a voice-over, and the voice plays on the audio clock, which is real seconds
     * whatever the frame rate. So on a slow renderer the two came apart: measured on a
     * headless run at about 8fps, the sentences arrived at a quarter speed while the
     * recording ran on, and the second half of a line appeared as the voice finished
     * saying it. 0.25s still swallows the jump a backgrounded tab produces (rAF stops, so
     * the first frame back can be seconds) without slowing the reading on any device that
     * renders at four frames a second or better. */
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    /* AND IF THE TUTORIAL EVER THROWS, THE GAME MUST NOT BE LEFT FROZEN.
       This layer PAUSES the simulation while a line is read, so an exception escaping
       update() does not merely stop the tutorial — it stops the animation frame that would
       have resumed the game, and the player is left looking at a still screen with no way
       out. Found for real: a say() that threw took the whole loop down on the first line.
       That specific hole is plugged where it happened, and this is the failsafe behind it:
       whatever goes wrong, the tutorial is finished properly — which resumes the game and
       clears its overlay — and the fault is reported rather than swallowed silently. */
    try {
      tut.update(dt);
    } catch (err) {
      console.error('the tutorial stopped on an error; the game continues without it', err);
      try { tut.finish(); } catch (e) { game.setPaused(false); }
      tut = null;
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* THE HAND ONLY OVER A ROPE. The canvas keeps an arrow; when the pointer is over a rope
   that can be cut right now, the stage gets .on-rope and the stylesheet swaps in the
   browser's hand. Decided on pointermove, not per frame: it only has to be right when
   the pointer moves, and reading the debug state on a move is far cheaper than a rAF
   loop for something most players (touch) never see at all. The reach is generous —
   it is an invitation, not the hit test, which lives in the engine. */
{
  const stage = document.getElementById('stage');
  const REACH = 130;
  const overRope = e => {
    let G; try { G = game.debug(); } catch (err) { return false; }
    if (!G || G.state !== 'PHASE_ACTIVE' || !G.l1 || !stage) return false;
    const r = stage.getBoundingClientRect();
    if (!r.width) return false;
    const sx = (e.clientX - r.left) / r.width * 1920, sy = (e.clientY - r.top) / r.height * 1080;
    const k = G.zoom || 1;
    const px = k > 1.0005 ? G.zoomVX + (sx - G.zoomVX) / k : sx;
    const py = k > 1.0005 ? G.zoomVY + (sy - G.zoomVY) / k : sy;
    for (const s of G.l1.shapes) {
      if (s.state !== 'hang') continue;
      const ax = s.anchorX === undefined ? s.x : s.anchorX;
      if (py < s.y - (s.h || 200) / 2 + 40 && Math.abs(px - ax) < REACH) return true;
    }
    return false;
  };
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (stage) stage.classList.toggle('on-rope', overRope(e));
  }, { passive: true });
  canvas.addEventListener('pointerleave', () => { if (stage) stage.classList.remove('on-rope'); });
}

game.setOptions(options);

/* THE COVER SHOWS AT ONCE, with PLAY held until the art has loaded. The cover needs only
   its own picture and the PLAY art, which the stylesheet fetches on its own, so there is no
   reason to sit on a blank page while the sheets and sounds arrive behind it. */
if (!flag('skip', false)) {
  front = new Frontend(document, game);
  front.init({ onStart: () => { game.begin(); startTutorial(); } });
  front.setLoading(true);
}
/* Re-pick the backbuffer scale when the window changes (a zoom, a monitor swap, a rotate).
   The art set stays as chosen at boot; only the pixel count follows. */
{
  let refitTimer = 0;
  const refit = () => { clearTimeout(refitTimer); refitTimer = setTimeout(() => game.setRenderScale(wantScale()), 120); };
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', refit);
}
// decode the recordings now, not on the first tap: a cue that is still loading when it is
// first needed falls back to a different sound, which is what made the fit sound vary
game.warmAudio();

/* JUICE on the controls only. The world is canvas and has its own squash, dust and
   hit-stop; juice.js is for the DOM: the JUMP button hops when pressed, a stamp pops as
   it lands, the ending banner does a tada, Play again nudges when ignored. Sound and
   particles stay off — the engine's audio and particle layers are the single owners. */
if (window.Juice) {
  try { Juice.stage(document.getElementById('stage')); Juice.configure({ sound: false, particles: false, intensity: 0.9 }); }
  catch (e) { /* no juice: the controls still work, they just do not bounce */ }
}

hud.bind({
  onPause: paused => game.setPaused(paused),
  onReplay: () => game.restart(),
  // TEMPORARY review control: end the tutorial if it is up, then jump to the ending
  onSkipEnd: () => { if (tut) { tut.finish(); tut = null; } game.skipToEnd(); },
  // returns the new state so the HUD can swap the glyph without asking again
  onSound: () => game.toggleSound(),
  // re-states the objective; it never reveals which chunk is the answer
  onHint: () => game.replayInstruction()
});

/* No keydown listener here any more. It existed to flash the JUMP button so a keyed
   jump looked like a pressed control; with the button gone the engine's own key
   handler (Space / ArrowUp / W) is the whole of it. */

/* Auto-pause when the tab loses focus so the character is never mid-jump on return.

   AND SILENCE IT. Pausing only stopped the simulation: the AudioContext kept running
   and the music element kept playing, so a backgrounded tab went on making noise from
   a game that was frozen — which on a phone means the music plays over whatever the
   child switched to, and the tab keeps a decoder alive for no reason. Both are
   suspended here and resumed together with the simulation. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !hud.paused) { game.setPaused(true); game.suspendAudio(); }
  else if (!document.hidden && !hud.paused) { game.setPaused(false); game.resumeAudio(); }
});

window.addEventListener('beforeunload', () => {
  game.destroy();
  hud.destroy();
  if (tut) tut.destroy();
  if (front) front.destroy();
});

// Handy for debugging from the console; harmless in production.
window.iceAgeGame = game;
