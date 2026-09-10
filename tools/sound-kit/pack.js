/*!
 * pack.js — play sampled audio through the sfx.js mix.
 *
 * Handles two kinds of clip from one store:
 *   Pack.play(name)    sound effects  -> sfxBus   (ducked under speech)
 *   Pack.speak(name)   voice-over     -> voiceBus (ducks everything else)
 *
 * Dependency-free. Decodes each file once into an AudioBuffer, then plays
 * from memory with no latency.
 *
 *   <script src="sfx.js"></script>
 *   <script src="pack.js"></script>
 *
 *   await Pack.load('assets/audio/manifest.json');
 *   await Pack.load('assets/vo/manifest.json');     // additive
 *   Pack.play('coin');
 *   await Pack.speak('now_measure_the_angle');      // effects duck for it
 *
 * Note: fetch() cannot read files over file://. Serve the folder — the Live
 * Server extension, or `npx serve`, or `python3 -m http.server`.
 */
(function (global) {
  'use strict';

  var AC = global.AudioContext || global.webkitAudioContext;

  var ctx = null;
  var sfxOut = null, voiceOut = null;
  var buffers = {};         // name -> AudioBuffer
  var meta = {};            // name -> manifest entry
  var speaking = [];        // live voice sources
  var loadedAny = false;

  function graph() {
    if (ctx) return ctx;
    if (global.SFX && typeof global.SFX.voiceBus === 'function') {
      global.SFX.unlock();
      ctx = global.SFX.context;
      sfxOut = global.SFX.bus();
      voiceOut = global.SFX.voiceBus();
    } else {
      // Standalone fallback. No ducking without sfx.js — there is nothing
      // to duck.
      ctx = new AC();
      sfxOut = ctx.createGain();
      sfxOut.gain.value = 0.6;
      sfxOut.connect(ctx.destination);
      voiceOut = sfxOut;
    }
    return ctx;
  }

  /* ------------------------------------------------------------------ *
   * Loading
   * ------------------------------------------------------------------ */

  /**
   * Load a manifest and decode everything it lists. Call more than once to
   * merge several manifests (effects and voice-over, say) into one store.
   *
   * @param {string} manifestUrl
   * @param {{concurrency?: number, onProgress?: function}} [opts]
   * @returns {Promise<string[]>} names that decoded successfully
   */
  function load(manifestUrl, opts) {
    opts = opts || {};
    var base = manifestUrl.replace(/[^/]*$/, '');
    var limit = opts.concurrency || 6;

    graph();

    return fetch(manifestUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('manifest: ' + r.status + ' ' + r.statusText);
        return r.json();
      })
      .then(function (list) {
        var names = Object.keys(list);
        var queue = names.slice();
        var done = 0;
        var ok = [];

        for (var i = 0; i < names.length; i++) meta[names[i]] = list[names[i]];

        function worker() {
          var name = queue.shift();
          if (!name) return Promise.resolve();
          return one(base + list[name].file)
            .then(function (buf) { buffers[name] = buf; ok.push(name); })
            .catch(function (e) {
              if (global.console) console.warn('Pack: "' + name + '" failed — ' + e.message);
            })
            .then(function () {
              done++;
              if (opts.onProgress) opts.onProgress(done, names.length, name);
              return worker();
            });
        }

        var workers = [];
        for (var w = 0; w < Math.min(limit, names.length); w++) workers.push(worker());
        return Promise.all(workers).then(function () {
          loadedAny = true;
          return ok;
        });
      });
  }

  function one(url) {
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
        return r.arrayBuffer();
      })
      .then(function (arr) {
        // Safari still wants the callback form, so accept either shape.
        return new Promise(function (resolve, reject) {
          var p = ctx.decodeAudioData(arr, resolve, reject);
          if (p && typeof p.then === 'function') p.then(resolve, reject);
        });
      });
  }

  /* ------------------------------------------------------------------ *
   * Playback
   * ------------------------------------------------------------------ */

  function start(name, dest, opts) {
    var buf = buffers[name];
    if (!buf) return null;
    graph();
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    opts = opts || {};

    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!opts.loop;

    var vary = opts.vary == null ? 0.04 : opts.vary;
    src.playbackRate.value = (opts.rate == null ? 1 : opts.rate) *
                             (1 + (Math.random() * 2 - 1) * vary);

    var g = ctx.createGain();
    g.gain.value = opts.volume == null ? 1 : opts.volume;

    src.connect(g);
    g.connect(dest);
    src.start(ctx.currentTime + (opts.delay || 0));
    return src;
  }

  /** A sound effect. Routed to the effects bus, so speech ducks it. */
  function play(name, opts) {
    var src = start(name, sfxOut, opts);
    if (!src && global.console) console.warn('Pack: no sound "' + name + '"');
    return src;
  }

  /**
   * A voice clip. Routed to the speech bus and never ducked; effects and
   * music duck under it for its whole length.
   *
   * The duck is held by the clip, not by a timer — overlapping speech keeps
   * it down until the last clip ends, and stopSpeaking() releases cleanly.
   *
   * @returns {Promise<void>} resolves when the clip finishes
   */
  function speak(name, opts) {
    opts = opts || {};
    // Voice should not be pitch-jittered; a wobbling narrator is worse than
    // a repetitive one.
    if (opts.vary == null) opts.vary = 0;

    var src = start(name, voiceOut, opts);
    if (!src) {
      if (global.console) console.warn('Pack: no voice clip "' + name + '"');
      return Promise.resolve();
    }

    var release = (global.SFX && global.SFX.duck)
      ? global.SFX.duck()
      : function () {};

    var entry = { src: src, release: release };
    speaking.push(entry);

    return new Promise(function (resolve) {
      src.onended = function () {
        var i = speaking.indexOf(entry);
        if (i >= 0) speaking.splice(i, 1);
        release();
        resolve();
      };
    });
  }

  /** Cut all speech short and let the effects bus back up. */
  function stopSpeaking() {
    var live = speaking.slice();
    speaking.length = 0;
    for (var i = 0; i < live.length; i++) {
      try { live[i].src.onended = null; live[i].src.stop(); } catch (e) {}
      live[i].release();
    }
  }

  global.Pack = {
    load: load,
    play: play,
    speak: speak,
    stopSpeaking: stopSpeaking,
    isSpeaking: function () { return speaking.length > 0; },
    has: function (name) { return !!buffers[name]; },
    list: function () { return Object.keys(buffers); },
    info: function (name) { return meta[name] || null; },
    duration: function (name) { return buffers[name] ? buffers[name].duration : 0; },
    isLoaded: function () { return loadedAny; },
    /** Sample if it loaded, else the synth. Lets game code predate the assets. */
    playOrSynth: function (name, opts) {
      if (buffers[name]) return play(name, opts);
      if (global.SFX) global.SFX.play(name, opts);
      return null;
    }
  };

})(typeof window !== 'undefined' ? window : this);
