/* OGG VORBIS ALONGSIDE EVERY MP3.
 *
 *     node tools/make-ogg.mjs            # convert anything that has no .ogg twin, or a stale one
 *     node tools/make-ogg.mjs --force    # convert everything again
 *
 * WHY BOTH AND NOT A SWAP. Ogg is the format asked for, and it is the better one here: at
 * matched quality it is smaller than the mp3 it replaces, and it carries no patent history.
 * But Ogg Vorbis only arrived in Safari in 17.4 (March 2024), so a swap would take the sound
 * away from every iPad still on iOS 16 — which in a classroom is not a rounding error. So the
 * ogg is what nearly every browser fetches and the mp3 stays as the one fallback. Only one of
 * the pair is ever downloaded: engine.js `assetUrl` rewrites .mp3 to .ogg once, at boot, after
 * asking the browser what it can play.
 *
 * The extra files cost nothing at runtime and about 5MB in the repo. That is the price of the
 * old iPad keeping its voice.
 *
 * -q:a 5 (~160kbps), not 4. The sources are already 128kbps mp3, so this is a lossy pass over
 * a lossy file; encoding with a little more room than the source stops the second generation
 * from being audible on the sibilants, which on a children's voice track is where it shows.
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const DIR = 'game/assets/audio';
const force = process.argv.includes('--force');

const mp3s = readdirSync(DIR).filter(f => f.endsWith('.mp3')).sort();
if (!mp3s.length) { console.error('no mp3 under ' + DIR); process.exit(1); }

let made = 0, kept = 0, before = 0, after = 0;
for (const f of mp3s) {
  const src = join(DIR, f), out = src.replace(/\.mp3$/, '.ogg');
  const srcStat = statSync(src);
  before += srcStat.size;
  // stale means the mp3 is newer than the ogg beside it — a re-delivered take must not keep an old twin
  const fresh = !force && existsSync(out) && statSync(out).mtimeMs >= srcStat.mtimeMs;
  if (!fresh) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-c:a', 'libvorbis', '-q:a', '5', out],
      { encoding: 'utf8' });
    if (r.status !== 0) { console.error('ffmpeg failed on ' + f + '\n' + r.stderr); process.exit(1); }
    made++;
  } else kept++;
  const os = statSync(out).size;
  after += os;
  const pct = Math.round((1 - os / srcStat.size) * 100);
  console.log('  ' + (fresh ? 'kept ' : 'made ') + f.replace(/\.mp3$/, '.ogg').padEnd(56) +
    (os / 1024).toFixed(0).padStart(6) + 'kB  ' + (pct >= 0 ? '-' : '+') + Math.abs(pct) + '% vs mp3');
}

/* Both formats have to decode to the same LENGTH, because CFG.vo.lines cuts the voice take
   into windows by the second: an encoder that padded the front would move every line. */
const dur = p => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], { encoding: 'utf8' });
  return Number(r.stdout.trim());
};
let worst = 0, worstFile = '';
for (const f of mp3s) {
  const src = join(DIR, f), out = src.replace(/\.mp3$/, '.ogg');
  const d = Math.abs(dur(src) - dur(out));
  if (d > worst) { worst = d; worstFile = f; }
}
console.log('\n' + made + ' made, ' + kept + ' already current;  ' +
  (before / 1024 / 1024).toFixed(2) + 'MB mp3 -> ' + (after / 1024 / 1024).toFixed(2) + 'MB ogg');
console.log('largest length difference between a pair: ' + worst.toFixed(3) + 's (' + worstFile + ')');
if (worst > 0.05) { console.error('A PAIR DRIFTED: the voice windows are cut by the second and would not line up.'); process.exit(1); }
