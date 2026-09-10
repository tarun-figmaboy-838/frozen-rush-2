/*!
 * juice.js — cartoon game feel. Squash, pop, shake, dust, hitstop.
 *
 * The whole design constraint is that this must not fight your game. It never
 * writes to `element.style.transform`, never wraps your nodes, and never takes
 * over your loop. Every effect is a Web Animations API animation with
 * `composite: 'add'`, which means the browser composes it *on top of* whatever
 * transform your render loop is already setting, sixty times a second.
 *
 * Your loop keeps writing `el.style.transform = 'translate(...)'`. Juice adds
 * `scale(1.2) rotate(3deg)` over it. Nothing conflicts, and when the effect
 * ends there is no residue — every keyframe starts and finishes at identity.
 *
 *   <script src="sfx.js"></script>     <!-- optional; combos use it if present -->
 *   <script src="juice.js"></script>
 *
 *   Juice.stage(document.getElementById('game'));   // once, for screen effects
 *
 *   Juice.pop(el);                    // collect, appear
 *   Juice.impact(el, { power: 1.4 }); // land, hit: squash + dust + shake + sound
 *   Juice.trample(el);                // the heavy one
 *   Juice.celebrate(el);              // confetti + fanfare
 *
 * No dependencies. No build step. ~11 KB.
 */
(function (global) {
  'use strict';

  var doc = global.document;

  /* ------------------------------------------------------------------ *
   * Config
   * ------------------------------------------------------------------ */

  var cfg = {
    intensity: 1,          // global multiplier on every amplitude
    particles: true,
    sound: true,           // route combos through SFX when it is loaded
    reducedMotion: 'auto', // 'auto' | true | false
    maxParticles: 320
  };

  var stageEl = null;
  var timeScale = 1;
  var live = new Set ? new Set() : null;   // tracked animations, for hitstop
  var liveList = [];                        // fallback for no Set

  function track(a) {
    if (!a) return a;
    if (live) { live.add(a); a.finished.then(clear, clear); function clear() { live.delete(a); } }
    else { liveList.push(a); }
    if (timeScale !== 1) a.playbackRate = timeScale;
    return a;
  }

  function each(fn) {
    if (live) live.forEach(fn);
    else for (var i = 0; i < liveList.length; i++) fn(liveList[i]);
  }

  /* ------------------------------------------------------------------ *
   * Capability and accessibility
   * ------------------------------------------------------------------ */

  // Additive composition is what makes this safe. Detect it rather than
  // assume it: without it we still run colour, opacity and particle effects,
  // but transform effects would overwrite the game's own transform, so they
  // are skipped instead of breaking the game.
  var ADDITIVE = (function () {
    if (!doc || !doc.createElement('div').animate) return false;
    try {
      var probe = doc.createElement('div');
      var a = probe.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.01)' }],
        { duration: 1, composite: 'add' }
      );
      var ok = a.effect.getKeyframes()[0].composite === 'add' ||
               a.effect.getComposite  === undefined;
      a.cancel();
      return ok !== false;
    } catch (e) { return false; }
  })();

  var warned = false;
  function needAdditive() {
    if (ADDITIVE) return true;
    if (!warned && global.console) {
      warned = true;
      console.warn('Juice: this browser lacks additive animation composition. ' +
                   'Transform effects are skipped so they cannot overwrite your ' +
                   'game\'s own transforms. Particles and flashes still run.');
    }
    return false;
  }

  var reduced = false;
  if (global.matchMedia) {
    var mq = global.matchMedia('(prefers-reduced-motion: reduce)');
    reduced = mq.matches;
    if (mq.addEventListener) mq.addEventListener('change', function (e) { reduced = e.matches; });
  }

  /**
   * Amplitude scaler. Reduced motion damps rather than disables: a child who
   * needs less movement still needs to know their tap registered.
   */
  function amp(v) {
    var r = cfg.reducedMotion === true || (cfg.reducedMotion === 'auto' && reduced);
    return v * cfg.intensity * (r ? 0.35 : 1);
  }
  function isReduced() {
    return cfg.reducedMotion === true || (cfg.reducedMotion === 'auto' && reduced);
  }

  /* ------------------------------------------------------------------ *
   * Easings
   * ------------------------------------------------------------------ */

  var EASE = {
    // Overshoot and settle. This is what makes something feel alive rather
    // than merely animated.
    back:     'cubic-bezier(0.34, 1.56, 0.64, 1)',
    // Pull back before going. Anticipation.
    anticipate: 'cubic-bezier(0.36, 0, 0.66, -0.56)',
    out:      'cubic-bezier(0.22, 1, 0.36, 1)',
    inOut:    'cubic-bezier(0.65, 0, 0.35, 1)',
    linear:   'linear'
  };

  function play(el, keyframes, options) {
    if (!el || !el.animate) return null;
    var o = options || {};
    if (o.transform !== false && !needAdditive()) return null;
    var a = el.animate(keyframes, {
      duration: o.duration || 300,
      easing: o.easing || EASE.out,
      delay: o.delay || 0,
      composite: 'add',
      fill: 'none'
    });
    return track(a);
  }

  /* ------------------------------------------------------------------ *
   * Element effects
   * ------------------------------------------------------------------ */

  /** Volume-preserving squash: wider means shorter. Reads as physical. */
  function sq(y) { return 'scale(' + (1 / Math.sqrt(y)).toFixed(4) + ', ' + y.toFixed(4) + ')'; }

  var FX = {

    /** Scale up and settle past the target. The default "something happened". */
    pop: function (el, o) {
      o = o || {};
      var s = 1 + amp(o.scale == null ? 0.28 : o.scale);
      return play(el, [
        { transform: 'scale(1)', offset: 0 },
        { transform: 'scale(' + s + ')', offset: 0.42 },
        { transform: 'scale(1)', offset: 1 }
      ], { duration: o.duration || 340, easing: EASE.back });
    },

    /** Compress vertically then rebound. Landing, being hit, taking weight. */
    squash: function (el, o) {
      o = o || {};
      var d = amp(o.amount == null ? 0.3 : o.amount);
      return play(el, [
        { transform: 'scale(1, 1)', offset: 0 },
        { transform: sq(1 - d), offset: 0.22 },
        { transform: sq(1 + d * 0.45), offset: 0.55 },
        { transform: 'scale(1, 1)', offset: 1 }
      ], { duration: o.duration || 400, easing: EASE.out });
    },

    /** The opposite: stretch tall. Launching, being pulled. */
    stretch: function (el, o) {
      o = o || {};
      var d = amp(o.amount == null ? 0.3 : o.amount);
      return play(el, [
        { transform: 'scale(1, 1)', offset: 0 },
        { transform: sq(1 + d), offset: 0.3 },
        { transform: 'scale(1, 1)', offset: 1 }
      ], { duration: o.duration || 340, easing: EASE.out });
    },

    /** Jelly wobble. Secondary motion, no net displacement. */
    wobble: function (el, o) {
      o = o || {};
      var r = amp(o.angle == null ? 7 : o.angle);
      return play(el, [
        { transform: 'rotate(0deg)', offset: 0 },
        { transform: 'rotate(' + r + 'deg)', offset: 0.15 },
        { transform: 'rotate(' + (-r * 0.8) + 'deg)', offset: 0.35 },
        { transform: 'rotate(' + (r * 0.5) + 'deg)', offset: 0.55 },
        { transform: 'rotate(' + (-r * 0.25) + 'deg)', offset: 0.75 },
        { transform: 'rotate(0deg)', offset: 1 }
      ], { duration: o.duration || 620, easing: EASE.out });
    },

    /** Shake in place. Damage, refusal, "no". */
    shake: function (el, o) {
      o = o || {};
      var d = amp(o.distance == null ? 8 : o.distance);
      // Must start AND end at zero. Starting at full amplitude snaps the
      // element sideways on frame one instead of shaking it from rest.
      var k = [{ transform: 'translateX(0px)', offset: 0 }], n = 8;
      for (var i = 1; i < n; i++) {
        var f = 1 - i / n;
        k.push({
          transform: 'translateX(' + ((i % 2 ? d : -d) * f).toFixed(2) + 'px)',
          offset: i / n
        });
      }
      k.push({ transform: 'translateX(0px)', offset: 1 });
      return play(el, k, { duration: o.duration || 380, easing: EASE.linear });
    },

    /** A shove in a direction that springs back. */
    nudge: function (el, o) {
      o = o || {};
      var dx = amp(o.x || 0), dy = amp(o.y || 0);
      return play(el, [
        { transform: 'translate(0, 0)', offset: 0 },
        { transform: 'translate(' + dx + 'px, ' + dy + 'px)', offset: 0.3 },
        { transform: 'translate(0, 0)', offset: 1 }
      ], { duration: o.duration || 420, easing: EASE.back });
    },

    /** Arc up and land with a squash. */
    hop: function (el, o) {
      o = o || {};
      var h = amp(o.height == null ? 26 : o.height);
      return play(el, [
        { transform: 'translateY(0) scale(1,1)', offset: 0 },
        { transform: 'translateY(0) ' + sq(0.86), offset: 0.12 },
        { transform: 'translateY(' + (-h) + 'px) ' + sq(1.1), offset: 0.42 },
        { transform: 'translateY(0) ' + sq(0.9), offset: 0.78 },
        { transform: 'translateY(0) scale(1,1)', offset: 1 }
      ], { duration: o.duration || 620, easing: EASE.inOut });
    },

    /** Full comic spin. */
    spin: function (el, o) {
      o = o || {};
      var turns = o.turns == null ? 1 : o.turns;
      return play(el, [
        { transform: 'rotate(0deg)', offset: 0 },
        { transform: 'rotate(' + (360 * turns) + 'deg)', offset: 1 }
      ], { duration: o.duration || 620, easing: EASE.inOut });
    },

    /** Woozy sway. After a bonk. */
    dizzy: function (el, o) {
      o = o || {};
      var r = amp(o.angle == null ? 12 : o.angle);
      return play(el, [
        { transform: 'rotate(0deg) translateY(0)', offset: 0 },
        { transform: 'rotate(' + r + 'deg) translateY(2px)', offset: 0.25 },
        { transform: 'rotate(' + (-r) + 'deg) translateY(-1px)', offset: 0.5 },
        { transform: 'rotate(' + (r * 0.6) + 'deg) translateY(2px)', offset: 0.75 },
        { transform: 'rotate(0deg) translateY(0)', offset: 1 }
      ], { duration: o.duration || 900, easing: EASE.inOut });
    },

    /** Celebration wiggle: scale plus rotation. */
    tada: function (el, o) {
      o = o || {};
      var r = amp(o.angle == null ? 8 : o.angle);
      var s = 1 + amp(0.16);
      return play(el, [
        { transform: 'scale(1) rotate(0deg)', offset: 0 },
        { transform: sq(0.9) + ' rotate(0deg)', offset: 0.1 },
        { transform: 'scale(' + s + ') rotate(' + (-r) + 'deg)', offset: 0.3 },
        { transform: 'scale(' + s + ') rotate(' + r + 'deg)', offset: 0.5 },
        { transform: 'scale(' + s + ') rotate(' + (-r * 0.6) + 'deg)', offset: 0.7 },
        { transform: 'scale(1) rotate(0deg)', offset: 1 }
      ], { duration: o.duration || 820, easing: EASE.out });
    },

    /** Sag and recover. Failure, deflation. */
    droop: function (el, o) {
      o = o || {};
      var d = amp(o.amount == null ? 0.22 : o.amount);
      return play(el, [
        { transform: 'scale(1,1) translateY(0) rotate(0deg)', offset: 0 },
        { transform: sq(1 - d) + ' translateY(' + amp(5) + 'px) rotate(' + amp(-4) + 'deg)', offset: 0.45 },
        { transform: sq(1 - d * 0.7) + ' translateY(' + amp(4) + 'px) rotate(' + amp(-3) + 'deg)', offset: 0.75 },
        { transform: 'scale(1,1) translateY(0) rotate(0deg)', offset: 1 }
      ], { duration: o.duration || 900, easing: EASE.inOut });
    },

    /** Pull back, then go. Anticipation is most of what sells an action. */
    anticipate: function (el, o) {
      o = o || {};
      var d = amp(o.amount == null ? 0.14 : o.amount);
      return play(el, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: sq(1 - d), offset: 0.55 },
        { transform: sq(1 + d * 0.5), offset: 0.8 },
        { transform: 'scale(1,1)', offset: 1 }
      ], { duration: o.duration || 380, easing: EASE.anticipate });
    },

    /** Brightness pop. Safe without additive support — filter, not transform. */
    flash: function (el, o) {
      o = o || {};
      if (!el || !el.animate) return null;
      var a = el.animate([
        { filter: 'brightness(1)' },
        { filter: 'brightness(' + (1 + amp(o.amount == null ? 0.9 : o.amount)) + ')', offset: 0.15 },
        { filter: 'brightness(1)' }
      ], { duration: o.duration || 260, easing: EASE.out, fill: 'none' });
      return track(a);
    }
  };

  /* ------------------------------------------------------------------ *
   * Screen effects
   * ------------------------------------------------------------------ */

  function stage(el) {
    if (el) { stageEl = el; ensureCanvas(); }
    return stageEl || (doc && doc.body);
  }

  function shakeScreen(o) {
    o = o || {};
    var host = stage();
    if (!host || isReduced() && cfg.reducedMotion !== false) {
      if (isReduced()) return null;   // screen shake is the one thing to drop
    }
    var d = amp(o.power == null ? 10 : o.power * 10);
    var n = Math.max(5, Math.round(d));
    var k = [{ transform: 'translate(0px, 0px)', offset: 0 }];
    for (var i = 1; i < n; i++) {
      var f = 1 - i / n;
      var ang = Math.random() * Math.PI * 2;
      k.push({
        transform: 'translate(' + (Math.cos(ang) * d * f).toFixed(2) + 'px, ' +
                                  (Math.sin(ang) * d * f).toFixed(2) + 'px)',
        offset: i / n
      });
    }
    k.push({ transform: 'translate(0px, 0px)', offset: 1 });
    return play(host, k, { duration: o.duration || 320, easing: EASE.linear });
  }

  function punchZoom(o) {
    o = o || {};
    var host = stage();
    return play(host, [
      { transform: 'scale(1)', offset: 0 },
      { transform: 'scale(' + (1 + amp(o.amount == null ? 0.03 : o.amount)) + ')', offset: 0.25 },
      { transform: 'scale(1)', offset: 1 }
    ], { duration: o.duration || 360, easing: EASE.out });
  }

  function flashScreen(o) {
    o = o || {};
    var host = stage();
    if (!host || !doc) return null;
    var f = doc.createElement('div');
    f.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:9998;' +
                      'background:' + (o.color || '#fff') + ';opacity:0';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(f);
    var a = f.animate(
      [{ opacity: 0 }, { opacity: amp(o.opacity == null ? 0.5 : o.opacity), offset: 0.1 }, { opacity: 0 }],
      { duration: o.duration || 260, easing: EASE.out }
    );
    a.finished.then(function () { f.remove(); }, function () { f.remove(); });
    return a;
  }

  /**
   * Freeze on impact. The most under-used trick in game feel: a few frames of
   * stillness at the moment of contact reads as weight.
   *
   * This always stops juice animations. To stop *gameplay* too, multiply your
   * own delta by `Juice.timeScale` in your loop — one line, and the punch goes
   * from decorative to physical.
   */
  function hitstop(ms) {
    var d = Math.max(0, ms == null ? 70 : ms);
    if (isReduced()) d = Math.min(d, 40);
    timeScale = 0;
    each(function (a) { try { a.playbackRate = 0; } catch (e) {} });
    setTimeout(function () {
      timeScale = 1;
      each(function (a) { try { a.playbackRate = 1; } catch (e) {} });
    }, d);
    return d;
  }

  /* ------------------------------------------------------------------ *
   * Particles — one canvas, not N DOM nodes.
   * ------------------------------------------------------------------ */

  var cv = null, g2d = null, parts = [], raf = 0;

  function ensureCanvas() {
    if (!cfg.particles || !doc) return null;
    var host = stage();
    if (!host) return null;
    if (cv && cv.parentNode === host) return cv;

    cv = doc.createElement('canvas');
    // Never intercept input. An overlay that forgets this is the classic way
    // to make a game "stop responding" while still looking correct.
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;' +
                       'pointer-events:none;z-index:9999';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(cv);
    g2d = cv.getContext('2d');
    sizeCanvas();
    if (global.ResizeObserver) new ResizeObserver(sizeCanvas).observe(host);
    else if (global.addEventListener) global.addEventListener('resize', sizeCanvas);
    return cv;
  }

  function sizeCanvas() {
    if (!cv) return;
    var dpr = global.devicePixelRatio || 1;
    var r = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Convert page coordinates, or an element, to canvas-local coordinates. */
  function at(target, ox, oy) {
    var host = stage();
    var hr = host.getBoundingClientRect();
    if (target && target.getBoundingClientRect) {
      var r = target.getBoundingClientRect();
      return { x: r.left - hr.left + r.width / 2 + (ox || 0),
               y: r.top - hr.top + r.height / 2 + (oy || 0) };
    }
    return { x: (target && target.x || 0) - hr.left, y: (target && target.y || 0) - hr.top };
  }

  function emit(list) {
    if (!ensureCanvas() || !global.requestAnimationFrame) return;
    if (parts.length + list.length > cfg.maxParticles) {
      parts.splice(0, parts.length + list.length - cfg.maxParticles);
    }
    for (var i = 0; i < list.length; i++) parts.push(list[i]);
    if (!raf) raf = requestAnimationFrame(step);
  }

  var lastT = 0;
  function step(ts) {
    var dt = lastT ? Math.min(0.05, (ts - lastT) / 1000) : 0.016;
    lastT = ts;
    dt *= timeScale;   // particles freeze with the hitstop

    g2d.clearRect(0, 0, cv.width, cv.height);

    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }

      p.vy += p.grav * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;

      var k = p.life / p.max;
      g2d.globalAlpha = Math.min(1, k * 1.6);
      g2d.save();
      g2d.translate(p.x, p.y);
      g2d.rotate(p.rot);

      if (p.kind === 'rect') {
        g2d.fillStyle = p.color;
        var w = p.size, h = p.size * 0.55;
        g2d.fillRect(-w / 2, -h / 2, w, h * (0.4 + 0.6 * Math.abs(Math.cos(p.rot))));
      } else if (p.kind === 'star') {
        g2d.fillStyle = p.color;
        star(g2d, p.size * (0.6 + 0.4 * k));
      } else if (p.kind === 'puff') {
        g2d.globalAlpha *= 0.55;
        g2d.fillStyle = p.color;
        g2d.beginPath();
        g2d.arc(0, 0, p.size * (1.8 - k), 0, Math.PI * 2);
        g2d.fill();
      } else if (p.kind === 'text') {
        g2d.globalAlpha = Math.min(1, k * 2);
        g2d.font = '700 ' + p.size + 'px "Space Grotesk", system-ui, sans-serif';
        g2d.textAlign = 'center';
        g2d.fillStyle = p.color;
        g2d.fillText(p.text, 0, 0);
      } else {
        g2d.fillStyle = p.color;
        g2d.beginPath();
        g2d.arc(0, 0, p.size * (0.4 + 0.6 * k), 0, Math.PI * 2);
        g2d.fill();
      }
      g2d.restore();
    }
    g2d.globalAlpha = 1;

    raf = parts.length ? requestAnimationFrame(step) : (lastT = 0);
  }

  function star(c, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var rad = i % 2 ? r * 0.45 : r;
      var a = (Math.PI / 5) * i - Math.PI / 2;
      c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad);
    }
    c.closePath(); c.fill();
  }

  var PALETTE = ['#ffd166', '#ff8fa3', '#7ae1c3', '#8ab4ff', '#ffb3f0', '#fff3b0'];

  function mk(x, y, o) {
    return {
      x: x, y: y,
      vx: o.vx, vy: o.vy,
      grav: o.grav == null ? 900 : o.grav,
      drag: o.drag == null ? 0.985 : o.drag,
      size: o.size, color: o.color,
      rot: o.rot || 0, spin: o.spin || 0,
      kind: o.kind || 'dot',
      text: o.text,
      life: o.life, max: o.life
    };
  }

  var P = {
    /** Radial scatter. Collecting, breaking, hitting. */
    burst: function (target, o) {
      o = o || {};
      var p = at(target, o.offsetX, o.offsetY);
      var n = Math.round(amp(o.count == null ? 14 : o.count));
      var sp = amp(o.speed == null ? 260 : o.speed);
      var out = [];
      for (var i = 0; i < n; i++) {
        var a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
        var v = sp * (0.55 + Math.random() * 0.75);
        out.push(mk(p.x, p.y, {
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
          size: 3 + Math.random() * 4,
          color: o.color || PALETTE[(Math.random() * PALETTE.length) | 0],
          life: 0.5 + Math.random() * 0.4
        }));
      }
      emit(out);
    },

    /** Ground puffs. Landing, stomping, running. */
    dust: function (target, o) {
      o = o || {};
      var r = target && target.getBoundingClientRect ? target.getBoundingClientRect() : null;
      var host = stage().getBoundingClientRect();
      var p = r ? { x: r.left - host.left + r.width / 2, y: r.bottom - host.top }
                : at(target, o.offsetX, o.offsetY);
      var n = Math.round(amp(o.count == null ? 9 : o.count));
      var sp = amp(o.speed == null ? 140 : o.speed);
      var out = [];
      for (var i = 0; i < n; i++) {
        var side = i % 2 ? 1 : -1;
        out.push(mk(p.x + side * Math.random() * 12, p.y - Math.random() * 4, {
          vx: side * sp * (0.4 + Math.random()), vy: -Math.random() * 90,
          grav: 120, drag: 0.93,
          size: 5 + Math.random() * 7,
          color: o.color || '#ffffff',
          kind: 'puff',
          life: 0.45 + Math.random() * 0.3
        }));
      }
      emit(out);
    },

    /** Seeing stars. Pairs with bonk. */
    stars: function (target, o) {
      o = o || {};
      var p = at(target, o.offsetX, o.offsetY == null ? -24 : o.offsetY);
      var n = Math.round(amp(o.count == null ? 5 : o.count));
      var out = [];
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.5;
        out.push(mk(p.x, p.y, {
          vx: Math.cos(a) * amp(110), vy: Math.sin(a) * amp(110),
          grav: 220, drag: 0.97,
          size: 8 + Math.random() * 5,
          color: o.color || '#ffd166',
          kind: 'star', spin: (Math.random() - 0.5) * 8,
          life: 0.7 + Math.random() * 0.3
        }));
      }
      emit(out);
    },

    confetti: function (target, o) {
      o = o || {};
      var p = at(target, o.offsetX, o.offsetY);
      var n = Math.round(amp(o.count == null ? 34 : o.count));
      var out = [];
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
        var v = amp(300) * (0.5 + Math.random());
        out.push(mk(p.x, p.y, {
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          grav: 720, drag: 0.99,
          size: 7 + Math.random() * 6,
          color: PALETTE[(Math.random() * PALETTE.length) | 0],
          kind: 'rect', rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12,
          life: 1.0 + Math.random() * 0.7
        }));
      }
      emit(out);
    },

    sparkle: function (target, o) {
      o = o || {};
      var p = at(target, o.offsetX, o.offsetY);
      var n = Math.round(amp(o.count == null ? 10 : o.count));
      var out = [];
      for (var i = 0; i < n; i++) {
        out.push(mk(p.x + (Math.random() - 0.5) * 40, p.y + (Math.random() - 0.5) * 40, {
          vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 60,
          grav: -30, drag: 0.96,
          size: 2 + Math.random() * 3,
          color: o.color || '#fff3b0',
          life: 0.5 + Math.random() * 0.5
        }));
      }
      emit(out);
    },

    /** Floating label: "+10", "Nice!". */
    popText: function (target, text, o) {
      o = o || {};
      var p = at(target, o.offsetX, o.offsetY == null ? -18 : o.offsetY);
      emit([mk(p.x, p.y, {
        vx: (Math.random() - 0.5) * 20, vy: -amp(150),
        grav: 190, drag: 0.98,
        size: o.size || 22,
        color: o.color || '#fff3b0',
        kind: 'text', text: String(text),
        life: o.duration || 1.0
      })]);
    }
  };

  /* ------------------------------------------------------------------ *
   * Combos — one call, one trigger, visual and sound together.
   *
   * Firing the effect and the cue from the same place is what keeps them in
   * sync. Two call sites drift, and drift is exactly what reads as "cheap".
   * ------------------------------------------------------------------ */

  function sfx(name, opts) {
    if (!cfg.sound || !global.SFX) return;
    global.SFX.play(name, opts);
  }

  var COMBO = {
    /** Landing or being hit. Weight, in one call. */
    impact: function (el, o) {
      o = o || {};
      var power = o.power == null ? 1 : o.power;
      FX.squash(el, { amount: 0.28 * power });
      P.dust(el, { count: 8 * power, speed: 140 * power });
      if (power >= 0.9) shakeScreen({ power: 0.5 * power, duration: 260 });
      if (power >= 1.2) hitstop(50 * power);
      sfx(o.sound || 'land', { volume: Math.min(1, 0.7 * power) });
    },

    /** Head meets object. */
    bonk: function (el, o) {
      o = o || {};
      FX.squash(el, { amount: 0.22 });
      FX.dizzy(el, { duration: 800 });
      P.stars(el);
      sfx(o.sound || 'bonk');
    },

    /** Picking something up. Escalates on a streak if SFX is present. */
    collect: function (el, o) {
      o = o || {};
      FX.pop(el, { scale: 0.32 });
      P.burst(el, { count: 12 });
      P.sparkle(el, { count: 6 });
      if (o.label != null) P.popText(el, o.label);
      if (cfg.sound && global.SFX) {
        if (o.streak === false) global.SFX.play(o.sound || 'coin');
        else global.SFX.escalate(o.sound || 'coin');
      }
    },

    /** Success, level complete. */
    celebrate: function (el, o) {
      o = o || {};
      FX.tada(el);
      P.confetti(el, { count: 36 });
      sfx(o.sound || 'levelUp');
    },

    /** Failure, with the comic timing that makes it land instead of sting. */
    fail: function (el, o) {
      o = o || {};
      FX.droop(el);
      FX.wobble(el, { angle: 4 });
      sfx(o.sound || 'sadTrombone');
    },

    /**
     * The heavy one. Anticipation, then the stomp: deep squash, dust ring,
     * screen shake, hitstop, sound. Anticipation is what makes it land.
     */
    trample: function (el, o) {
      o = o || {};
      var wind = o.anticipation == null ? 220 : o.anticipation;
      var power = o.power == null ? 1.3 : o.power;

      FX.anticipate(el, { amount: 0.18, duration: wind });
      if (cfg.sound && global.SFX) global.SFX.play('ratchet', { volume: 0.5 });

      setTimeout(function () {
        FX.squash(el, { amount: 0.42 * power, duration: 460 });
        P.dust(el, { count: 16, speed: 230 * power });
        P.burst(el, { count: 8, speed: 180, color: '#ffffff' });
        shakeScreen({ power: 0.9 * power, duration: 340 });
        hitstop(80);
        if (cfg.sound && global.SFX) {
          global.SFX.sequence([{ sound: 'land', volume: 1 }, 0.02, { sound: 'splat', volume: 0.7 }]);
        }
      }, wind);
    },

    /** Entering the scene. */
    appear: function (el, o) {
      o = o || {};
      FX.pop(el, { scale: 0.45, duration: 460 });
      P.sparkle(el, { count: 8 });
      sfx(o.sound || 'pop');
    },

    /** Rejected input, wrong answer. */
    refuse: function (el, o) {
      o = o || {};
      FX.shake(el, { distance: 9 });
      sfx(o.sound || 'wrong');
    }
  };

  /* ------------------------------------------------------------------ *
   * Public surface
   * ------------------------------------------------------------------ */

  var Juice = {
    stage: stage,
    configure: function (o) {
      for (var k in o) if (k in cfg) cfg[k] = o[k];
      return cfg;
    },

    // element
    pop: FX.pop, squash: FX.squash, stretch: FX.stretch, wobble: FX.wobble,
    shake: FX.shake, nudge: FX.nudge, hop: FX.hop, spin: FX.spin,
    dizzy: FX.dizzy, tada: FX.tada, droop: FX.droop,
    anticipate: FX.anticipate, flash: FX.flash,

    // screen
    shakeScreen: shakeScreen, flashScreen: flashScreen,
    punchZoom: punchZoom, hitstop: hitstop,

    // particles
    burst: P.burst, dust: P.dust, stars: P.stars, confetti: P.confetti,
    sparkle: P.sparkle, popText: P.popText,

    // combos
    impact: COMBO.impact, bonk: COMBO.bonk, collect: COMBO.collect,
    celebrate: COMBO.celebrate, fail: COMBO.fail, trample: COMBO.trample,
    appear: COMBO.appear, refuse: COMBO.refuse,

    /** Multiply your loop's delta by this so hitstop reaches gameplay. */
    get timeScale() { return timeScale; },
    /** True when transform effects are safe. False means they are being skipped. */
    get additive() { return ADDITIVE; },
    get reducedMotion() { return isReduced(); },

    /** Stop everything and clear particles. For scene transitions. */
    clear: function () {
      each(function (a) { try { a.cancel(); } catch (e) {} });
      if (live) live.clear(); else liveList.length = 0;
      parts.length = 0;
      if (cv && g2d) g2d.clearRect(0, 0, cv.width, cv.height);
    },
    easings: EASE
  };

  global.Juice = Juice;
  if (typeof module !== 'undefined' && module.exports) module.exports = Juice;

})(typeof window !== 'undefined' ? window : this);
