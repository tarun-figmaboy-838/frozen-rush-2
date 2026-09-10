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
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      // let the browser cache: the game preloads about 25MB of art, and re-fetching
      // all of it for every test made boot the slowest thing in the suite
      'Cache-Control': 'public, max-age=60'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('game on http://127.0.0.1:' + PORT);
});
