/* BAKE THE SFX ONSET TIMES INTO THE CONFIG.
 *
 * Every recorded cue is a file longer than the event it is for — 5.2s of footsteps for
 * one footfall — so a cue takes a short bite out of it, starting at a hit. Those hit
 * times are found from the waveform's own energy by AudioManager._onsets(), which needs
 * the file DECODED, which needs fetch + decodeAudioData.
 *
 * Neither exists on a file:// page. So opening index.html off the disk — the supported
 * way to run this game — loses all six delivered recordings and falls back to the
 * synthesised palette, silently.
 *
 * The analysis only has to happen once, though: the files do not change. This runs the
 * game's OWN _onsets over http, reads the hit times back, and writes them into CFG.sfx
 * as a `hits` array. With them baked in, the file:// build can play the same bites
 * through plain <audio> elements, which need no decoding at all.
 *
 *     node tools/bake-onsets.mjs
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const PORT = 8291;
const srv = spawn('node', ['tools/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/index.html?skip=1`);
await page.waitForFunction('window.iceAgeGame && window.iceAgeGame.state() !== "BOOT"', null, { timeout: 60000 });

// the loader only runs once the context is unlocked
await page.evaluate(() => window.iceAgeGame.sfx('ui'));
const hits = await page.evaluate(async () => {
  const g = window.iceAgeGame;
  const m = await import('/js/engine.js');
  const expected = Object.keys(m.CFG.sfx || {});
  const t0 = Date.now();
  /* Wait for EVERY cue, not merely for the table to be non-empty. The loader decodes
     them concurrently and a 5.5MB set does not finish together, so reading on the first
     key that appears returned two cues out of six and quietly baked hits for those. */
  while (Date.now() - t0 < 90000) {
    const s = g._sfxTable && g._sfxTable();
    if (s && expected.every(k => s[k] && s[k].buf)) {
      const out = {};
      for (const [k, v] of Object.entries(s)) {
        out[k] = { hits: (v.hits || []).map(x => +x.toFixed(4)), dur: v.buf ? +v.buf.duration.toFixed(3) : null };
      }
      return out;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  // timed out: report what DID arrive, so a failure names the cue that is missing
  const s = (g._sfxTable && g._sfxTable()) || {};
  return { __incomplete: true, expected, got: Object.keys(s),
           withBuf: Object.keys(s).filter(k => s[k] && s[k].buf) };
});
await browser.close();
srv.kill();

if (!hits) { console.error('no sfx table came back'); process.exit(1); }
if (hits.__incomplete) {
  console.error('the decode did not finish for every cue.');
  console.error('  expected: ' + hits.expected.join(', '));
  console.error('  in table: ' + (hits.got.join(', ') || '(none)'));
  console.error('  decoded:  ' + (hits.withBuf.join(', ') || '(none)'));
  process.exit(1);
}

console.log('onsets found:');
for (const [k, v] of Object.entries(hits)) {
  console.log('  ' + k.padEnd(8) + String(v.hits.length).padStart(3) + ' hits in ' + v.dur + 's   ' +
    v.hits.slice(0, 6).join(', ') + (v.hits.length > 6 ? ' …' : ''));
}

/* WRITTEN BETWEEN MARKERS, not by matching nested braces.
 *
 * The first version of this generated a `hits: [...]` line inside each cue's object
 * literal with a regex. It does not work: a lazy match from `ui: {` to the first
 * `\n  }` runs past the cue and stops on the closing brace of `sfx` itself, so the
 * numbers landed as a sibling of the six cues rather than inside one — a `hits` key
 * on CFG.sfx that then showed up as a seventh cue with no file.
 *
 * Writing between two markers cannot go wrong that way, and the generated block says
 * plainly that it is generated, which the buried line did not. */
const F = 'game/js/engine.js';
let s = readFileSync(F, 'utf8');
const NL = s.includes('\r\n') ? '\r\n' : '\n';
const START = '/* BAKED-ONSETS-START */';
const END = '/* BAKED-ONSETS-END */';
const a = s.indexOf(START), b = s.indexOf(END);
if (a < 0 || b < 0) {
  console.error('markers not found in ' + F + ' — expected ' + START + ' … ' + END);
  process.exit(1);
}

const lines = Object.entries(hits)
  .filter(([, v]) => v.hits.length)
  .map(([k, v]) => '  ' + k + ': [' + v.hits.join(', ') + '],');

const block = START + NL +
  'export const SFX_HITS = {' + NL + lines.join(NL) + NL + '};' + NL +
  END;

writeFileSync(F, s.slice(0, a) + block + s.slice(b + END.length));
console.log('\nwrote ' + lines.length + ' cues into ' + F + ' between the markers');
console.log('now rebuild the bundle:  node tools/build-bundle.mjs');
