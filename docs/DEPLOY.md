# Deploying to Vercel

The game is static: HTML, CSS, ES modules and assets, no build step and no server. So
the only thing a deploy has to get right is **which folder is the site root**, because
the game lives in `game/` and everything else in the repo is tooling.

## The setting that matters

In the Vercel project, set:

| | |
|---|---|
| **Root Directory** | `game` |
| Framework Preset | Other |
| Build Command | *(leave empty)* |
| Output Directory | *(leave empty)* |
| Install Command | *(leave empty)* |

That serves `game/index.html` at `/`, the modules at `/js/…` and the art at
`/assets/…`, and `game/vercel.json` supplies the headers. Nothing outside `game/` is
uploaded, so `tools/`, `tests/`, `art-source/` and `node_modules/` are excluded by the
root directory alone.

### …but the source art INSIDE `game/` is not, and that needs its own ignore file

Vercel reads `.vercelignore` from the root of the **project**, not of the repository — so
with Root Directory set to `game`, the `.vercelignore` at the repo root is never read at
all. Measured: that uploaded 55MB of GIFs, un-sliced sheets and option-shape PNGs that no
URL in the game ever requests.

**`game/.vercelignore` is what covers that case, and it is load-bearing.** It excludes the
build inputs that live under `game/assets` (`assets/GIF`, `assets/char/*-gif.png`,
`assets/option-shape/*.png`, `assets/art/cover.png`) plus `drafts` and `qa`. Both ignore
files are needed — the root one for the repo-root arrangement below, this one for the
recommended one — and deleting either silently starts uploading source art.

There is no build step to configure. Do not set one — an empty build command is
correct for a static folder, and adding `npm install` would only pull in Playwright and
sharp, which are development tools.

## If Root Directory is left as the repo root

It still works, but it is the fragile arrangement. The root `vercel.json` redirects `/`
to `/game/` and `.vercelignore` keeps the tooling out of the upload. The URLs are uglier
(`/game/assets/…`) and the two config files have to stay in step, which is why `game`
is the recommended setting.

**`"trailingSlash": true` in the root config is load-bearing. Do not set it to false.**
`game/index.html` links its stylesheets, modules and art with *relative* paths
(`css/style.css`, `js/main.js`) so that the same file works when the folder is served at
`/`. A relative path resolves against the directory of the current URL, so the browser
must come to rest on `/game/` **with the slash**. Land it on `/game` instead and the
directory is `/`, every one of those paths resolves to `/css/style.css`, `/js/main.js`,
`/assets/…`, and all of them 404 — a blank white page with no styling and no game, while
the files themselves are uploaded and perfectly reachable one level down.

That is not hypothetical; it is what shipped. `"trailingSlash": false` makes Vercel add
its own 308 from `/game/` to `/game`, so the redirect handed the browser the right URL
and the normaliser immediately took the slash back off:

```
/       307 → /game/       (the config redirect)
/game/  308 → /game        (trailingSlash: false — this was the bug)
/game   200                 base is now "/", so css/style.css → /css/style.css → 404
```

With `true`, the last two steps run the other way (`/game` 308 → `/game/`), the page
settles on `/game/`, and the relative paths resolve under it.

**Both files are kept on purpose.** Vercel reads `vercel.json` from whichever folder is
the root directory, so exactly one of them is ever in effect. `game/vercel.json` can
leave `trailingSlash` false safely — with Root Directory set to `game` the page is
served at `/`, which has no slash to strip. The setting only bites at a subpath.

## Why the headers are split

- **`/assets/*` is immutable for a year.** The art never changes under a fixed name; a
  new sheet is a new deploy. This is the whole cache win, and it is most of the bytes.
- **`/js/*` and `*.html` must revalidate.** They are small, and a stale `engine.js`
  against fresh `option-shapes.js` is exactly the kind of mismatch that shows up as
  shapes rendering with the wrong material. During development this bit repeatedly:
  a long-lived browser tab kept serving an old `engine.js` and the options looked
  half-broken when the files on disk were fine.
- The explicit `Content-Type` on `/js/*` is not decoration. Browsers refuse an ES
  module served as anything but a JavaScript type, and the failure mode is a silent
  blank page.

## First deploy

```bash
git init
git add -A
git commit -m "Ice Age polygon runner"
# then either
vercel --cwd game
# or push to GitHub and import the repo, setting Root Directory to `game`
```

## Checking a deploy

The game needs a server, so `file://` cannot be used to test it — modules are blocked
and the page stays blank. Against a deployed URL, the things worth confirming are the
ones that only break in production:

1. `/` loads the cover, and PLAY starts a run.
2. **The URL bar ends in a slash** — `…/game/`, not `…/game`. This is the whole of the
   bug described above, and it is visible before the page has finished loading.
3. The network panel shows no 404s, and `/js/engine.js` arrives as
   `text/javascript`.
4. The character animates — a missing sprite sheet is a silent 404 that leaves only a
   shadow on the snow.
5. A phase completes: the instruction sign, the hanging ice blocks, one cut, and the
   crossing sealing.

`npx playwright test` covers all of that locally, against two servers that Playwright
starts for itself:

- **`tools/serve.mjs`** serves `game/` as the root. This is the dev server most tests
  use — and note what it cannot see: because the game *is* the root there, every
  relative path resolves correctly no matter what the routing does. A repo-root deploy's
  breakage is structurally invisible to it. It never had a chance of catching this.
- **`tools/zzvercel-sim.mjs`** serves the repo root and applies the real root
  `vercel.json` — its redirects, `trailingSlash`, `cleanUrls`, rewrites and headers — one
  round trip at a time, the way Vercel does. `tests/zzdeploy.spec.mjs` enters at `/` and
  plays a full phase through it, so the redirect chain and the relative paths are
  exercised for real. If it goes red, the deploy is broken; that is the only local check
  that can tell you so.

The simulator reads `vercel.json` once at startup, so Playwright starts it with
`reuseExistingServer: false`. A leftover sim from an earlier run would keep serving the
old routing and turn the check green against a config that no longer exists — which is
precisely how the broken deploy got signed off.
