/* EXACT-CASE CHECK of every asset and module the game asks for.
 *
 * Vercel serves from Linux, which is case-sensitive. Development happens on Windows,
 * which is not. So a reference to `assets/gif/x.gif` against a real `assets/GIF/x.gif`
 * loads perfectly on the author's machine, passes every local test, and 404s in
 * production — the single nastiest class of deploy bug this project can have, because
 * nothing local can reproduce it.
 *
 * fs.existsSync is useless here: on Windows it returns true for the wrong case. This
 * walks the real directory entries instead and requires an exact string match at every
 * path segment.
 *
 *     node tools/check-asset-case.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';

/* TWO different bases, and getting them mixed up is easy.

   An `assets/...` string inside a module is fetched by the BROWSER as a URL relative
   to the PAGE, not to the module — engine.js asking for 'assets/sky/01-dawn.webp'
   means /game/assets/..., not /game/js/assets/.... A `url()` in a stylesheet, by
   contrast, resolves against the STYLESHEET. And a bare `./x.js` import resolves
   against the importing module.

   assetBase is where an asset URL in this file resolves from; moduleBase is where an
   import specifier resolves from. */
const SRC = [
  { file: 'game/index.html', assetBase: 'game', moduleBase: 'game' },
  { file: 'game/js/engine.js', assetBase: 'game', moduleBase: 'game/js' },
  { file: 'game/js/main.js', assetBase: 'game', moduleBase: 'game/js' },
  { file: 'game/js/option-shapes.js', assetBase: 'game', moduleBase: 'game/js' },
  { file: 'game/js/hud.js', assetBase: 'game', moduleBase: 'game/js' },
  { file: 'game/js/frontend.js', assetBase: 'game', moduleBase: 'game/js' },
  { file: 'game/css/style.css', assetBase: 'game/css', moduleBase: 'game/css' },
  { file: 'game/css/screens.css', assetBase: 'game/css', moduleBase: 'game/css' },
];

const refs = new Map();
for (const { file, assetBase, moduleBase } of SRC) {
  let s;
  try { s = readFileSync(file, 'utf8'); } catch { continue; }
  // assets/... and js/... in quotes or url()
  for (const m of s.matchAll(/['"(]((?:\.\.\/)*(?:assets|js)\/[A-Za-z0-9_\-.\/ ,]+?)['")]/g)) {
    const abs = posix.normalize(assetBase + '/' + m[1]);
    if (!refs.has(abs)) refs.set(abs, file);
  }
  // sibling module imports
  for (const m of s.matchAll(/from\s+['"]\.\/([A-Za-z0-9_\-.]+\.js)['"]/g)) {
    const abs = posix.normalize(moduleBase + '/' + m[1]);
    if (!refs.has(abs)) refs.set(abs, file);
  }
}

const cache = new Map();
const entries = d => {
  if (!cache.has(d)) {
    try { cache.set(d, readdirSync(d)); } catch { cache.set(d, null); }
  }
  return cache.get(d);
};

/** True only if every segment matches a real directory entry byte for byte. */
function exactly(p) {
  let cur = '.';
  for (const part of p.split('/')) {
    const es = entries(cur);
    if (!es) return { ok: false, at: cur, missingDir: true };
    if (!es.includes(part)) {
      const ci = es.find(e => e.toLowerCase() === part.toLowerCase());
      return { ok: false, at: cur + '/' + part, caseIs: ci || null };
    }
    cur = cur + '/' + part;
  }
  return { ok: true };
}

let bad = 0;
console.log(`checking ${refs.size} referenced paths with exact case`);
for (const [p, by] of [...refs].sort()) {
  const r = exactly(p);
  if (r.ok) continue;
  bad++;
  console.log(`  BAD  ${p}   (referenced by ${by})` +
    (r.caseIs ? `   real name is: ${r.caseIs}` : '   MISSING'));
}
console.log(bad ? `\n${bad} problem(s) — these would 404 on Linux`
                : `\nall ${refs.size} resolve with exact case`);
process.exit(bad ? 1 : 0);
