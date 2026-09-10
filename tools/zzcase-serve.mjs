/* THE GAME, SERVED WITH STRICT PATH CASE — what Linux does, on Windows.
 *
 * Vercel serves from Linux, which is case-sensitive. Development happens on Windows,
 * which is not. So a reference to `assets/gif/x.gif` against a real `assets/GIF/x.gif`
 * loads perfectly on the author's machine, passes every local test, and 404s in
 * production. tools/check-asset-case.mjs catches that STATICALLY, by reading the
 * source; this catches it DYNAMICALLY, by refusing to serve a path whose case is
 * wrong, so a URL the game builds at runtime is checked too.
 *
 * WHY IT EXISTS. tests/zzcase.spec.mjs has always fetched http://127.0.0.1:8321/ and
 * nothing in the repo ever listened there — playwright.config.mjs starts the dev
 * server and the Vercel simulator and no third one — so that test could only ever
 * fail with ERR_CONNECTION_REFUSED. It was reporting a missing server as a case bug
 * on every single run. This is the server it was written against.
 *
 * fs.existsSync is useless here: on Windows it returns true for the wrong case. Every
 * path segment is matched against the real directory entries instead, exactly.
 *
 *     node tools/zzcase-serve.mjs [port]
 */
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', 'game');
const PORT = Number(process.argv[2] || 8321);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.gif': 'image/gif',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.woff2': 'font/woff2'
};

/* Directory listings are cached: a boot pulls a few hundred files and re-reading the
   same handful of folders for each of them made this server the slowest thing in the
   suite. The tree does not change while a test runs. */
const listings = new Map();
async function entries(dir) {
  let e = listings.get(dir);
  if (!e) { e = new Set(await readdir(dir)); listings.set(dir, e); }
  return e;
}

/** The path, if every segment matches a real entry with exactly that case. */
async function exactPath(segments) {
  let dir = ROOT;
  for (let i = 0; i < segments.length; i++) {
    const name = segments[i];
    if (!name || name === '.' || name === '..') return null;   // no climbing out
    let have = await entries(dir);
    /* A MISS RE-READS THE DIRECTORY ONCE. The listing cache assumed the tree does not
       change while a test runs — true — but a server left running between runs outlived
       an asset being ADDED, and reported a real, correctly-cased file as a 404. One
       re-read on a miss keeps the cache and closes that hole. */
    if (!have.has(name)) { listings.delete(dir); have = await entries(dir); }
    if (!have.has(name)) return null;
    dir = join(dir, name);
  }
  return dir;
}

const server = createServer(async (req, res) => {
  const fail = (code, why) => {
    res.writeHead(code, { 'Content-Type': 'text/plain' }).end(why);
  };
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const segments = path.split('/').filter(Boolean);
    const file = await exactPath(segments);
    if (!file) return fail(404, 'not found (exact case required): ' + path);
    if (!file.startsWith(ROOT + sep) && file !== ROOT) return fail(403, 'forbidden');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'public, max-age=60'
    });
    res.end(body);
  } catch (e) {
    fail(404, 'not found: ' + (e && e.message));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('game (strict case) on http://127.0.0.1:' + PORT);
});
