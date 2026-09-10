/* Simulates a Vercel deploy of THIS repo, so a 404 can be reproduced locally.
   Serves the repo ROOT (Root Directory unset) and applies the root vercel.json's
   redirects / trailingSlash / cleanUrls / rewrites the way Vercel does.

   trailingSlash is simulated ON PURPOSE and was the gap that let a broken deploy
   ship: the config redirected "/" to "/game/", but "trailingSlash": false then
   bounced "/game/" to "/game", and every relative href in index.html ("css/style.css")
   resolves against "/" from there instead of "/game/". The sim used to serve "/game/"
   directly, so the test passed while production 404'd on every stylesheet, module and
   sprite. Each normalisation is a separate round trip here, exactly as on Vercel. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const MODE = process.argv[2] || 'root';           // 'root' | 'game'
const BASE = MODE === 'game' ? join(ROOT, 'game') : ROOT;
const CFG = JSON.parse(await readFile(join(BASE, 'vercel.json'), 'utf8').catch(() => '{}'));
const PORT = Number(process.argv[3] || 8199);

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png',
  '.webp':'image/webp', '.svg':'image/svg+xml', '.mp3':'audio/mpeg', '.gif':'image/gif',
  '.woff2':'font/woff2', '.jpg':'image/jpeg' };

// a header rule's `source` is a path pattern, not a regex: literal dots are literal,
// only the (.*) groups are wild
const sourceRe = src => new RegExp('^' + src
  .split('(.*)').map(s => s.split('.').join('[.]')).join('(.*)') + '$');

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const go = (code, to) => { res.writeHead(code, { Location: to }); res.end(); };

  // Vercel: config redirects first (they change the browser URL)
  for (const r of CFG.redirects || []) {
    if (r.source === p) return go(r.permanent === false ? 307 : 308, r.destination);
  }
  // then trailingSlash normalisation — its own redirect, its own round trip.
  // Only paths that do not look like a file are normalised.
  if (!extname(p)) {
    if (CFG.trailingSlash === true && !p.endsWith('/')) return go(308, p + '/');
    if (CFG.trailingSlash === false && p !== '/' && p.endsWith('/')) return go(308, p.slice(0, -1));
  }
  // then cleanUrls: a request for /x.html is redirected to /x
  if (CFG.cleanUrls && p.endsWith('.html')) {
    const clean = p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    if (clean !== p) return go(308, clean);
  }
  // then rewrites (URL stays, content comes from elsewhere)
  let served = p;
  for (const r of CFG.rewrites || []) {
    if (r.source === p) { served = r.destination; break; }
  }
  // static resolution, including the directory index Vercel serves for a bare /dir
  const tries = [served];
  if (served.endsWith('/')) tries.push(served + 'index.html');
  else if (!extname(served)) tries.push(served + '/index.html');
  if (CFG.cleanUrls && !extname(served)) tries.push(served + '.html');

  for (const t of tries) {
    const f = join(BASE, t);
    try {
      const s = await stat(f);
      if (!s.isFile()) continue;
      const h = { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' };
      for (const g of CFG.headers || []) {
        if (sourceRe(g.source).test(p)) for (const kv of g.headers) h[kv.key] = kv.value;
      }
      res.writeHead(200, h);
      return res.end(await readFile(f));
    } catch {}
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 ' + p + (served !== p ? ' (rewritten to ' + served + ')' : ''));
});
server.listen(PORT, () => console.log(`vercel-sim [${MODE}] on http://127.0.0.1:${PORT}  base=${BASE.replace(ROOT,'.')}`));
