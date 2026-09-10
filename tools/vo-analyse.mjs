/* Look at a voice-over take and find where the lines are.
 *
 *     node tools/vo-analyse.mjs "game/assets/audio/<take>.mp3"
 *
 * Decodes to mono 16k PCM with ffmpeg, builds an energy envelope, and reports every run of
 * speech separated by a gap of silence. Reports only — it writes nothing. Use it to check a
 * new take has the lines the script expects, in the order the script expects, before
 * anything is baked from it.
 */
import { spawnSync } from 'node:child_process';

const SRC = process.argv[2];
if (!SRC) { console.error('usage: node tools/vo-analyse.mjs <file.mp3>'); process.exit(1); }
const SR = 16000;
const GAP = Number(process.argv[3] || 0.30);   // silence this long separates two lines

const pcm = spawnSync('ffmpeg', ['-v', 'error', '-i', SRC, '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'],
  { maxBuffer: 1 << 30, encoding: 'buffer' });
if (pcm.status !== 0) { console.error(pcm.stderr.toString()); process.exit(1); }
const buf = pcm.stdout;
const n = buf.length >> 1;
const x = new Float32Array(n);
for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(i * 2) / 32768;
console.log('duration ' + (n / SR).toFixed(2) + 's');

/* RMS in 10ms hops. Short enough to see the gap between two words, long enough not to
   chatter inside one. */
const HOP = Math.round(SR * 0.01);
const frames = Math.floor(n / HOP);
const env = new Float32Array(frames);
for (let f = 0; f < frames; f++) {
  let s = 0;
  for (let k = 0; k < HOP; k++) { const v = x[f * HOP + k]; s += v * v; }
  env[f] = Math.sqrt(s / HOP);
}
const peak = Math.max(...env);
const sorted = Float32Array.from(env).sort();
const floor = sorted[Math.floor(frames * 0.15)];       // the quiet 15% is room tone
const thr = Math.max(floor * 4, peak * 0.035);
console.log('peak ' + peak.toFixed(4) + '  noise floor ' + floor.toFixed(5) + '  threshold ' + thr.toFixed(5));

const runs = [];
let start = -1, quiet = 0;
const gapFrames = Math.round(GAP / 0.01);
for (let f = 0; f < frames; f++) {
  if (env[f] >= thr) {
    if (start < 0) start = f;
    quiet = 0;
  } else if (start >= 0) {
    quiet++;
    if (quiet >= gapFrames) { runs.push([start, f - quiet]); start = -1; quiet = 0; }
  }
}
if (start >= 0) runs.push([start, frames - 1]);

console.log('\n' + runs.length + ' speech runs at a ' + GAP + 's gap:\n');
console.log('  #   start     end     len    gap before');
let prevEnd = 0;
runs.forEach(([a, b], i) => {
  const at = a * 0.01, end = (b + 1) * 0.01;
  console.log('  ' + String(i + 1).padStart(2) + '  ' + at.toFixed(2).padStart(6) + '  ' +
    end.toFixed(2).padStart(6) + '  ' + (end - at).toFixed(2).padStart(6) + '  ' +
    (at - prevEnd).toFixed(2).padStart(6));
  prevEnd = end;
});
