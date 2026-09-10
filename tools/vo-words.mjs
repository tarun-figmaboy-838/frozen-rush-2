/* Find the WORDS inside a voice-over take, not just the lines.
 *
 *     node tools/vo-words.mjs "<take>.mp3" [lineGap] [wordGap]
 *
 * The game reveals a line one word at a time, and until now it spread the words evenly
 * across the line's length — a guess that drifts against any real delivery. This finds the
 * onsets the recording actually has, so a word can appear on the syllable it is spoken.
 *
 * HOW. Decode to mono 16k, take an RMS envelope in 10ms hops, and split twice: a long gap
 * of silence separates LINES, a short dip separates WORDS. A dip is not always silence —
 * connected speech runs "the-path" together — so within a line the split is made at local
 * minima of the envelope that are deep enough relative to the peaks either side, which
 * survives co-articulation better than a flat threshold.
 *
 * Reports only. tools/vo-bake.mjs is what writes the timings into the config.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const SR = 16000;
export const HOP = Math.round(SR * 0.01);

export function decode(src) {
  const pcm = spawnSync('ffmpeg', ['-v', 'error', '-i', src, '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'],
    { maxBuffer: 1 << 30, encoding: 'buffer' });
  if (pcm.status !== 0) throw new Error(pcm.stderr.toString());
  const buf = pcm.stdout, n = buf.length >> 1;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(i * 2) / 32768;
  return x;
}

export function envelope(x) {
  const frames = Math.floor(x.length / HOP);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let k = 0; k < HOP; k++) { const v = x[f * HOP + k]; s += v * v; }
    env[f] = Math.sqrt(s / HOP);
  }
  return env;
}

export function lines(env, gapS = 0.30) {
  const frames = env.length;
  const peak = Math.max(...env);
  const sorted = Float32Array.from(env).sort();
  const floor = sorted[Math.floor(frames * 0.15)];
  const thr = Math.max(floor * 4, peak * 0.035);
  const gap = Math.round(gapS / 0.01);
  const out = [];
  let start = -1, quiet = 0;
  for (let f = 0; f < frames; f++) {
    if (env[f] >= thr) { if (start < 0) start = f; quiet = 0; }
    else if (start >= 0) { quiet++; if (quiet >= gap) { out.push([start, f - quiet]); start = -1; quiet = 0; } }
  }
  if (start >= 0) out.push([start, frames - 1]);
  /* A take can end on a click or a breath. Anything under 200ms is not a line. */
  return out.filter(([a, b]) => (b - a) * 0.01 >= 0.2);
}

/* Word onsets inside one line, as frame indices, the first being the line's own start.
 *
 * `want` is how many words the script says are in this line. The dips are ranked by how
 * deep they are and the best (want - 1) are taken, which is what keeps this honest: the
 * envelope always offers more candidate dips than there are words, and choosing by depth
 * rather than by a threshold means the answer has the right COUNT by construction. */
export function words(env, a, b, want) {
  const span = b - a + 1;
  if (want <= 1 || span < 4) return [a];
  const dips = [];
  for (let f = a + 2; f <= b - 2; f++) {
    const v = env[f];
    if (v > env[f - 1] || v > env[f + 1]) continue;              // a local minimum only
    let lp = 0; for (let k = Math.max(a, f - 12); k < f; k++) lp = Math.max(lp, env[k]);
    let rp = 0; for (let k = f + 1; k <= Math.min(b, f + 12); k++) rp = Math.max(rp, env[k]);
    const depth = Math.min(lp, rp) - v;                          // how far it falls between two peaks
    if (depth <= 0) continue;
    dips.push({ f, depth: depth / Math.max(1e-6, Math.min(lp, rp)) });
  }
  dips.sort((p, q) => q.depth - p.depth);
  const picked = [];
  const MIN = 8;                                                 // 80ms: no word is shorter
  for (const d of dips) {
    if (picked.length >= want - 1) break;
    if (picked.some(f => Math.abs(f - d.f) < MIN)) continue;
    if (d.f - a < MIN || b - d.f < MIN) continue;
    picked.push(d.f);
  }
  picked.sort((p, q) => p - q);
  return [a, ...picked];
}

/* How many word groups a line looks like it has, with no script to compare against —
 * used to fingerprint an unknown take. Counts dips deeper than a fixed proportion. */
export function countWords(env, a, b) {
  let n = 1;
  const peak = Math.max(...Array.from(env.slice(a, b + 1)));
  let f = a + 2;
  while (f <= b - 2) {
    const v = env[f];
    if (v <= env[f - 1] && v <= env[f + 1]) {
      let lp = 0; for (let k = Math.max(a, f - 12); k < f; k++) lp = Math.max(lp, env[k]);
      let rp = 0; for (let k = f + 1; k <= Math.min(b, f + 12); k++) rp = Math.max(rp, env[k]);
      if (Math.min(lp, rp) - v > peak * 0.35 && Math.min(lp, rp) > peak * 0.25) { n++; f += 8; continue; }
    }
    f++;
  }
  return n;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const src = process.argv[2];
  const env = envelope(decode(src));
  const ls = lines(env, Number(process.argv[3] || 0.30));
  console.log(ls.length + ' lines\n');
  console.log('  #   start     end     len   words (guessed)');
  ls.forEach(([a, b], i) => {
    console.log('  ' + String(i + 1).padStart(2) + '  ' + (a * 0.01).toFixed(2).padStart(6) + '  ' +
      ((b + 1) * 0.01).toFixed(2).padStart(6) + '  ' + ((b + 1 - a) * 0.01).toFixed(2).padStart(6) +
      '   ' + countWords(env, a, b));
  });
}
