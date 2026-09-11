/* Static file server for the game.
   The game uses ES modules, which browsers refuse to load over file:// — open
   index.html directly and you get a permanent "Loading the frozen world…". This
   serves the folder over HTTP instead, and Playwright starts it automatically.

     node tools/serve.mjs [port]
*/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', 'game');
const PORT = Number(process.argv[2] || process.env.PORT || 8181);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.woff2': 'font/woff2'
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    // never let a request climb out of the game folder
    /* Strip every leading separator. This class was written as [/\] — the
       backslash escaped the closing bracket, so the class never closed and the whole
       module was a syntax error. It went unnoticed because the test config reuses a
       running server, so nothing had to parse it again for a long time. */
    const file = join(ROOT, normalize(path).replace(/^[/\\]+/, ''));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    const info = await stat(file);
    if (info.isDirectory()) { res.writeHead(403).end('forbidden'); return; }
    const body = await readFile(file);
    /* CODE IS NEVER CACHED HERE; ART STILL IS.
     *
     * A flat max-age=60 on everything is right for the 25MB of art — re-fetching that
     * per page load made boot the slowest thing in the suite — and quietly wrong for
     * the code. Edit engine.js, rebuild, reload, and for the next minute the browser
     * serves the JS it already had: the markup and the stylesheet come back fresh while
     * the game logic is a minute old. What that looks like from the outside is a game
     * that has half your change in it, or levels that should be gone still showing up,
     * and it costs a long time to work out that nothing is wrong with the code.
     *
     * The deployment already makes exactly this distinction (vercel.json: assets
     * immutable for a year, js and html must-revalidate). The dev server should not be
     * the one place that disagrees with it. */
    const ext = extname(file).toLowerCase();
    const isCode = ext === '.js' || ext === '.mjs' || ext === '.html' || ext === '.css';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': isCode ? 'no-cache, must-revalidate' : 'public, max-age=60'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('game on http://127.0.0.1:' + PORT);
});
