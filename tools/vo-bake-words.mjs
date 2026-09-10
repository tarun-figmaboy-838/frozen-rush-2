/* BAKE PER-WORD TIMINGS FOR THE VOICE-OVER.
 *
 *     node tools/vo-bake-words.mjs [--take <file.mp3>] [--write]
 *
 * WHY. The tutorial reveals a line one word at a time, and it used to spread the words
 * evenly across the clip: a fixed step, the same for "This" and for "obstacles". Even
 * spacing is never how anyone speaks, so the text ran ahead of the voice on the short words
 * and lagged behind on the long ones. This measures where each word actually STARTS in the
 * recording and writes those offsets into CFG.vo.lines, so a word appears on the syllable it
 * is spoken.
 *
 * IT WORKS INSIDE THE WINDOWS THAT ALREADY EXIST, and that is the whole design. An earlier
 * cut of this tool re-detected the lines from silence and matched them to the script by
 * position. It got them wrong: the pause inside "Oh no! The path is broken." is the same
 * length as the pause between two lines, so no threshold separates them, and a greedy merge
 * happily glued "Watch out!" to half of the line after it. CFG.vo.lines already says where
 * every line is — that mapping was measured once and is correct — so this reads it and only
 * has to answer the much smaller question of where the words fall INSIDE a known clip.
 *
 * HOW. Decode to mono 16k, take an RMS envelope in 10ms hops, and inside each window pick
 * the (words - 1) deepest dips between syllable peaks. Choosing the N deepest rather than
 * everything past a threshold means the count comes out right by construction.
 *
 * A NEW TAKE. Windows first, words second. This tool does not invent windows, because
 * getting one wrong would put "hexagon" under the word "triangle" in a game that teaches
 * the names of shapes. Give it a take whose windows are already in CFG.vo.lines.
 *
 * Prints a table by default. Pass --write to edit game/js/engine.js in place.
 */
import fs from 'node:fs';
import { decode, envelope, words as splitWords, HOP, SR } from './vo-words.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TAKE = arg('--take', 'game/assets/audio/vo-lines.mp3');
const WRITE = process.argv.includes('--write');

/* The text of every line, by id. The word COUNT is what the split needs; the words
   themselves are printed so a mistake is visible in the table rather than only in the game. */
const TEXT = {
  'tut-1-meet': 'This is Momo. He needs to find his friend.',
  'tut-2-goal': 'Help Momo cross the Frozen Pass!',
  'tut-3-watch': 'Watch out!',
  'tut-4-jump': 'Tap to jump over obstacles.',
  'tut-5-broken': 'Oh no! The path is broken.',
  'tut-6-use': 'Use the right ice piece to fix the path.',
  'tut-7-fit': 'Perfect fit! Keep going!',
  'sign-triangle': 'Cut the triangle.',
  'sign-quadrilateral': 'Cut the quadrilateral.',
  'sign-pentagon': 'Cut the pentagon.',
  'sign-hexagon': 'Cut the hexagon.',
  'sign-heptagon': 'Cut the heptagon.',
  'sign-pentagons': 'Cut all the pentagons.',
  'sign-hexagons': 'Cut all the hexagons.'
};

const P = 'game/js/engine.js';
const raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.split('\r\n').join('\n');

/* the shipped windows, exactly as the engine reads them */
const windows = [...s.matchAll(/'((?:tut|sign)-[a-z0-9-]+)':\s*\[\s*([\d.]+),\s*([\d.]+)/g)]
  .map(m => ({ id: m[1], at: +m[2], dur: +m[3] }));
if (!windows.length) { console.error('no vo windows found in ' + P); process.exit(2); }

const env = envelope(decode(TAKE));
const frameOf = t => Math.max(0, Math.min(env.length - 1, Math.round(t / (HOP / SR))));

const out = [];
console.log('take ' + TAKE + '  (' + (env.length * 0.01).toFixed(2) + 's)\n');
console.log('  id                    at    dur   n   word offsets');
for (const w of windows) {
  const text = TEXT[w.id];
  if (!text) { console.error('no script text for ' + w.id); process.exit(2); }
  const list = text.trim().split(/\s+/).filter(Boolean);
  const a = frameOf(w.at), b = frameOf(w.at + w.dur);

  /* THE CLIP IS PADDED; THE SPEECH IS NOT. Windows carry 60ms of lead-in so the attack is
     never clipped, and a dip-finder handed that padding puts the first "word" in the
     silence. So the search starts at the first frame that is actually speaking. */
  const inWin = Array.from(env.slice(a, b + 1));
  const peak = Math.max(...inWin);
  let sa = a; while (sa < b && env[sa] < peak * 0.08) sa++;
  let sb = b; while (sb > sa && env[sb] < peak * 0.08) sb--;

  const onsets = splitWords(env, sa, sb, list.length);
  if (onsets.length !== list.length) {
    console.error('\n' + w.id + ': found ' + onsets.length + ' onsets for ' + list.length +
      ' words — the envelope does not separate them. Nothing written.');
    process.exit(2);
  }
  const rel = onsets.map(f => +Math.max(0, f * 0.01 - w.at).toFixed(2));
  out.push({ ...w, rel, list });
  console.log('  ' + w.id.padEnd(20) + ' ' + w.at.toFixed(2).padStart(5) + ' ' + w.dur.toFixed(2).padStart(6) +
    '  ' + String(list.length).padStart(2) + '   ' + rel.map(v => v.toFixed(2)).join(' '));
}

/* the checks a person would do by eye */
for (const r of out) {
  for (let i = 1; i < r.rel.length; i++) {
    if (r.rel[i] <= r.rel[i - 1]) throw new Error(r.id + ': word ' + i + ' (' + r.list[i] + ') does not come after ' + r.list[i - 1]);
  }
  if (r.rel[r.rel.length - 1] > r.dur) throw new Error(r.id + ': the last word starts after the clip ends');
}
console.log('\nchecked: every word starts after the one before it, and inside its own clip');

if (!WRITE) { console.log('\n(report only — pass --write to put these in engine.js)'); process.exit(0); }

let n = 0;
for (const r of out) {
  /* [^\][] and not [^\]]: the class has to exclude the OPENING bracket as well, or the
     greedy run crosses into the word array and the match ends one ']' short — which rewrote
     [a, b, [words]] as [a, b, [words]]] and only ever showed up on a re-bake. */
  const re = new RegExp("('" + r.id + "':\\s*)\\[[^\\][]*(?:\\[[^\\]]*\\])?[^\\][]*\\]");
  if (!re.test(s)) throw new Error('no window for ' + r.id + ' in engine.js');
  s = s.replace(re, "$1[" + r.at.toFixed(2) + ", " + r.dur.toFixed(2) + ", [" + r.rel.map(v => v.toFixed(2)).join(', ') + "]]");
  n++;
}
fs.writeFileSync(P, crlf ? s.split('\n').join('\r\n') : s);
console.log('wrote ' + n + ' windows with per-word timings into ' + P);
