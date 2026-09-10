#!/usr/bin/env node
/**
 * measure-loudness.js — render every sfx.js recipe offline and measure it,
 * so the per-sound trims are derived rather than guessed.
 *
 * Metric: maximum short-term K-weighted loudness over a 100 ms sliding
 * window (ITU-R BS.1770 weighting, ungated). Integrated LUFS needs 400 ms
 * blocks and gating, which is meaningless for a 50 ms click; the sliding
 * peak captures "how loud does this hit" for both a click and an explosion.
 *
 *   node tools/measure-loudness.js            # measure, print table
 *   node tools/measure-loudness.js --trims    # also emit the TRIM literal
 */
'use strict';

const path = require('path');
const { OfflineAudioContext } = require('node-web-audio-api');

const SR       = 48000;   // BS.1770 coefficients below are the 48 kHz set
const SECONDS  = 3;
const REPEATS  = 7;      // averaged, to take the noise out of the calibration
const WINDOW   = 0.100;
const MAX_TRIM = 8.0;     // ceiling on boost; peak guard usually binds first

// Per-family targets. Flat-normalising all thirty to one number would be
// wrong: a UI tick is *supposed* to sit under an explosion. These are mix
// decisions, deliberately spread over 9 dB.
const TARGETS = {
  interface: -27.0,   // click, tick, select — present, never obtrusive
  setup:     -24.0,   // ratchet, anticipate — must sit UNDER the payoff
  movement:  -23.0,   // jump, land, swoosh
  cartoon:   -22.0,   // pop, splat, honk
  comic:     -21.0,   // bonk, cuckoo, ricochet
  reward:    -20.0,   // coin, levelUp, correct
  punchline: -19.0,   // sadTrombone, rimshot, drumroll — the joke lands here
  drama:     -18.0    // explode, gameOver, alarm
};

const FAMILY = {
  coin:'reward', gem:'reward', powerUp:'reward', levelUp:'reward',
  sparkle:'reward', correct:'reward',
  jump:'movement', doubleJump:'movement', boing:'movement',
  swoosh:'movement', slice:'movement', land:'movement',
  pop:'cartoon', bubble:'cartoon', squeak:'cartoon',
  splat:'cartoon', honk:'cartoon', slideWhistle:'cartoon',
  click:'interface', select:'interface', tick:'interface',
  wrong:'interface', error:'interface', menuWhoosh:'interface',
  laser:'drama', explode:'drama', hurt:'drama',
  gameOver:'drama', alarm:'drama', powerDown:'drama',

  sadTrombone:'punchline', rimshot:'punchline', drumroll:'punchline',
  ratchet:'setup', anticipate:'setup',
  bonk:'comic', doink:'comic', zip:'comic', recordScratch:'comic',
  cuckoo:'comic', rubberChicken:'comic', ricochet:'comic',
  pianoRun:'comic', fallingWhistle:'comic', kazoo:'comic'
};
const SFX_PATH = path.resolve(__dirname, '../sfx.js');

/* --- BS.1770 K-weighting, 48 kHz ---------------------------------- */

const PRE = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
              a: [1, -1.69065929318241,  0.73248077421585] };
const RLB = { b: [1.0, -2.0, 1.0],
              a: [1, -1.99004745483398, 0.99007225036621] };

function biquad(x, c) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = c.b[0]*x[i] + c.b[1]*x1 + c.b[2]*x2 - c.a[1]*y1 - c.a[2]*y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** Max short-term K-weighted loudness, in LUFS. */
function loudness(samples) {
  const k = biquad(biquad(Float64Array.from(samples), PRE), RLB);
  const win = Math.round(WINDOW * SR);
  if (k.length < win) return -Infinity;

  // Sliding mean square via running sum.
  let sum = 0;
  for (let i = 0; i < win; i++) sum += k[i] * k[i];
  let best = sum;
  for (let i = win; i < k.length; i++) {
    sum += k[i]*k[i] - k[i-win]*k[i-win];
    if (sum > best) best = sum;
  }
  const ms = best / win;
  return ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity;
}

/** Seconds until the signal stays below -60 dBFS. Used for voice stealing. */
function decay(samples) {
  const floor = Math.pow(10, -60 / 20);
  let last = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > floor) last = i;
  }
  return Math.ceil((last / SR) * 100) / 100;   // round up to 10 ms
}

/**
 * Average several renders in the power domain. Noise-based recipes read a
 * random offset into a freshly generated noise buffer, so a single render of
 * a 35 ms click can sit several dB from its own mean. Calibrating from one
 * draw bakes that error into the trim.
 */
function meanLoudness(runs) {
  var lin = 0, n = 0;
  for (var i = 0; i < runs.length; i++) {
    if (isFinite(runs[i])) { lin += Math.pow(10, runs[i] / 10); n++; }
  }
  return n ? 10 * Math.log10(lin / n) : -Infinity;
}

function peak(samples) {
  let p = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > p) p = a;
  }
  return p;
}

/* --- render one recipe in isolation -------------------------------- */

async function render(name) {
  const oac = new OfflineAudioContext(1, SECONDS * SR, SR);

  global.window = global;
  global.self = global;
  global.AudioContext = function () { return oac; };   // ensure() calls new AC()
  global.addEventListener = () => {};
  global.removeEventListener = () => {};

  delete require.cache[require.resolve(SFX_PATH)];
  const SFX = require(SFX_PATH);

  SFX.unlock();
  SFX.volume(1);                       // measure at unity, not the 0.6 default
  SFX.play(name, { vary: 0, trim: false });

  const buf = await oac.startRendering();
  return buf.getChannelData(0);
}

/* --- main ---------------------------------------------------------- */

(async function () {
  // A throwaway load just to enumerate the names.
  const oac0 = new OfflineAudioContext(1, 128, SR);
  global.window = global;
  global.AudioContext = function () { return oac0; };
  global.addEventListener = () => {};
  global.removeEventListener = () => {};
  delete require.cache[require.resolve(SFX_PATH)];
  const names = require(SFX_PATH).list();

  const rows = [];
  for (const name of names) {
    const ls = [], ps = [], ds = [];
    for (let r = 0; r < REPEATS; r++) {
      const pcm = await render(name);
      ls.push(loudness(pcm)); ps.push(peak(pcm)); ds.push(decay(pcm));
    }
    rows.push({
      name,
      lufs: meanLoudness(ls),
      peak: Math.max(...ps),      // worst case, for the clip guard
      dur:  Math.max(...ds)
    });
  }

  const valid = rows.filter(r => isFinite(r.lufs));
  const lo = Math.min(...valid.map(r => r.lufs));
  const hi = Math.max(...valid.map(r => r.lufs));

  console.log(`\n  ${'sound'.padEnd(14)} ${'family'.padEnd(10)} ${'meas'.padStart(7)} ${'targ'.padStart(6)} ${'peak'.padStart(6)} ${'trim'.padStart(6)} ${'dB'.padStart(6)} ${'decay'.padStart(6)}`);
  console.log('  ' + '-'.repeat(74));

  const trims = {}, durs = {};
  for (const r of rows) {
    const fam = FAMILY[r.name] || 'reward';
    const target = TARGETS[fam];
    let trim = 1, db = 0;
    if (isFinite(r.lufs)) {
      db = target - r.lufs;
      trim = Math.min(MAX_TRIM, Math.pow(10, db / 20));
      // Don't let a trim push the peak into clipping; the limiter is a
      // safety net, not a mixing tool.
      if (r.peak * trim > 0.98) trim = 0.98 / r.peak;
      db = 20 * Math.log10(trim);
    }
    trims[r.name] = Number(trim.toFixed(3));
    durs[r.name]  = r.dur;
    console.log(
      `  ${r.name.padEnd(14)} ${fam.padEnd(10)} ${r.lufs.toFixed(1).padStart(7)} ${target.toFixed(1).padStart(6)} ` +
      `${r.peak.toFixed(3).padStart(6)} ${trim.toFixed(3).padStart(6)} ` +
      `${((db >= 0 ? '+' : '') + db.toFixed(1)).padStart(6)} ${(r.dur.toFixed(2) + 's').padStart(6)}`
    );
  }

  console.log('  ' + '-'.repeat(74));
  console.log(`  measured spread: ${(hi - lo).toFixed(1)} dB  (${lo.toFixed(1)} to ${hi.toFixed(1)})`);
  console.log(`  ${WINDOW * 1000}ms window, ${SR} Hz, ${REPEATS} renders averaged, targets span ` +
              `${Math.min(...Object.values(TARGETS))} to ${Math.max(...Object.values(TARGETS))} LUFS\n`);

  if (process.argv.includes('--trims')) {
    const lines = Object.keys(trims).map(k => `    ${(k + ':').padEnd(15)} ${trims[k].toFixed(3)}`);
    console.log('  var TRIM = {\n' + lines.join(',\n') + '\n  };\n');
  }
  require('fs').writeFileSync(
    path.resolve(__dirname, 'calibration.json'),
    JSON.stringify({ trims, durations: durs }, null, 2) + '\n'
  );
  console.log('  wrote tools/calibration.json\n');
})();
