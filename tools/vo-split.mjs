/* Cut a voice-over take into one file per spoken line, for listening to.
 *
 *     node tools/vo-split.mjs "<take>.mp3" [outDir] [gap]
 *
 * A take arrives as one long recording and the game slices it by time, so before anything
 * is wired up somebody has to know WHICH LINE IS WHICH. An energy envelope can find where
 * the lines are; it cannot tell you what they say. This writes each one out as its own
 * file so a person can play them in order and label them in a few seconds — which is the
 * only reliable way to map a take, and much cheaper than shipping a wrong mapping into a
 * game that teaches the names of shapes.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { decode, envelope, lines as splitLines } from './vo-words.mjs';

const SRC = process.argv[2];
const OUT = process.argv[3] || 'qa-report/vo-runs';
const GAP = Number(process.argv[4] || 0.30);
if (!SRC) { console.error('usage: node tools/vo-split.mjs <take.mp3> [outDir] [gap]'); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.mp3')) fs.unlinkSync(path.join(OUT, f));

const runs = splitLines(envelope(decode(SRC)), GAP);
const PAD = 0.10;
console.log(runs.length + ' lines -> ' + OUT + '\n');
runs.forEach(([a, b], i) => {
  const at = Math.max(0, a * 0.01 - PAD);
  const dur = (b + 1) * 0.01 + PAD - at;
  const name = 'run-' + String(i + 1).padStart(2, '0') + '.mp3';
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', at.toFixed(2), '-t', dur.toFixed(2),
    '-i', SRC, '-c:a', 'libmp3lame', '-q:a', '5', path.join(OUT, name)]);
  if (r.status !== 0) { console.error(name + ': ' + r.stderr.toString()); return; }
  console.log('  ' + name + '   ' + at.toFixed(2).padStart(6) + 's  ' + dur.toFixed(2) + 's');
});
