# Frozen Rush 2

A browser game that teaches polygons. A mammoth is stopped by a crevasse in the ice, and
geometry is what mends the path. **Two levels, two questions.**

**Level 1 — *which* shape.** Glacier-ice blocks hang on ropes above the hole; you **swipe
across a rope** to cut one, and the right shape wedges in and mends the path. Seven
crossings, and the rule being taught is the number of sides and nothing else.

**Level 2 — *where* to cut.** One slab of ice is balanced on the pillar between two
crevasses. You **drag from one corner to another** to cut it. A diagonal joins two corners
that are not next to each other, and only a cut that goes right across leaves two halves
that can each bridge a hole.

No dependencies, no build step to play. **Open `game/index.html`** — it works straight off
the disk as well as over HTTP.

```
node tools/serve.mjs      # then http://127.0.0.1:8123/index.html
npx playwright test       # the full suite, two viewports
npm run test:level2       # just Level 2
```

## What is new in 2

Version 1 shipped Level 1 and kept Level 2 as a parked draft (`drafts/level-2.draft.js`)
that nothing imported. **Level 2 is the level now** — attached, playable, and held by
`tests/level-two.spec.mjs`. The draft is kept in `drafts/` as the record of what was
originally specified; it is no longer the source of anything.

What re-attaching it actually took, beyond wiring the states back up, is worth knowing
because it changed the design:

- **The gap model had moved on.** The draft wrote its own `kind: 'span'` gaps and its own
  `piece2` seal. Neither exists any more: a crevasse now carries `slots` and `pieces`, and
  the ditch is *cut from the piece that bridges it*. Level 2's two halves are now ordinary
  seated pieces on ordinary crevasses, so the mend is drawn, grown and frosted by the code
  that already does that and Level 2 owns no renderer for the finished state.
- **Only the main diagonals complete the level, and that is a decision, not a bug.** A
  regular hexagon's three *main* diagonals halve it into two congruent trapezoids. Its six
  *short* diagonals cut off a triangle and leave a five-sided piece half again as tall as
  the cavity under the walking line — it cannot bridge at any size. A short diagonal is
  still a diagonal, so it is never called wrong; it gets its own nudge asking for the cut
  that goes right across. See the note on `CFG.levelTwo` in `engine.js`.
- **`hexR` is 220 because three constraints bracket it** to 213–223: under 213 a crevasse
  is jumpable, over 223 the pair will not fit on a 1920 stage, and over 270 a half is
  taller than the 234px cavity and would have to be shrunk — which RUNNER forbids. At 220
  the seating fit comes out at exactly 1.0.
- **`G.helper` was dead**, so the draft's feedback lines would have been invisible. They go
  through the plank (`G.signSay`) now, the same channel every other sentence uses.

`CFG.levelTwo.enabled = false` puts the game back to Level 1 only, with the run home
following the last crossing exactly as it did in v1.

## Where things are

Two rules explain the whole layout:

**1. `game/` is the website.** Everything in it is fetched by a URL at runtime, and
nothing else is. That is what makes it safe to point a static host straight at it —
Vercel's Root Directory is set to `game` (see [docs/DEPLOY.md](docs/DEPLOY.md)).

**2. Anything a *tool* reads but the *game* never fetches lives in `art-source/`.**
Delivered artwork, un-sliced sprite sheets, GIFs, raw button renders. It stays in the
repo because the builds need it, and it stays out of `game/` so it cannot ship.

```
game/                 THE SITE — only what a URL fetches
  index.html
  css/                style.css (in-play) · screens.css (cover, cards, buttons)
  js/                 engine.js is the whole game — both levels; main.js boots it,
                      hud.js owns the DOM outside the canvas, polygons.js +
                      option-shapes.js are the shape data. game.bundle.js is
                      generated — see below.
  assets/             audio · char · env · option-shape · sky · ui  (15MB, all served)

art-source/           BUILD INPUTS — never deployed (78MB)
  option-shape/       the 14 delivered blocks, as PNG  -> game/assets/option-shape/*.webp
  char-sheets/        un-sliced character sheets       -> game/assets/char/mammoth-*.webp
  gif/                the delivered GIFs               -> char-sheets/
  original-upload/    everything as it first arrived
  *-raw.png           button art before tools/make-buttons.mjs

tools/                one-shot generators and the dev server. Every file says at the
                      top what it consumes and what it writes.
tests/                Playwright, run against the real engine through its debug hooks.
                      level-two.spec.mjs is Level 2's own.
docs/                 ANIMATION.md · ANIMATION-BRIEF.md · DEPLOY.md · QA-REPORT.md
drafts/               level-2.draft.js — the original brief, now superseded (see above)
RUNNER.md             THE CONTRACT. Read this before changing gameplay.
```

Not in git: `node_modules/`, `test-results/`, `playwright-report/`, `qa-report/`, and
`art-source/char-sheets/*-gif.png` (regenerable from the GIFs — the command is in
`.gitignore`).

## The two generated files

Neither is edited by hand, and a test fails if either drifts from its source.

| generated | from | rebuild |
|---|---|---|
| `game/js/game.bundle.js` | the modules in `game/js/` | `node tools/build-bundle.mjs` |
| `game/js/option-shapes.js` | `art-source/option-shape/*.png` | `node tools/build-option-shapes.mjs` |

The bundle exists for one reason: a browser fetches an ES module with CORS even from a
`file://` page, which `file://` refuses — so opening `index.html` off the disk gave a
blank screen. Over `http://` the modules load as normal and the files in `js/` stay the
source of truth; the bundle is only used for `file://`. `index.html` picks by protocol.

## Running the tests

The suite is heavy — it loads a 15MB art set per page and composites a 1920×1080 canvas
without a GPU. On a laptop, **run it with `--workers=1`**; at higher concurrency the
browser processes get killed and the failures look like assertion failures but are not.

```
npx playwright test --workers=1                       # everything, both viewports
npx playwright test tests/level-two.spec.mjs --workers=1 --project=desktop
```

Ports 8181, 8201 and 8321 are used by the harness. A dev server left running from an
earlier session on 8181 will be *reused* by Playwright (`reuseExistingServer`) — so if it
belongs to a different checkout the whole suite silently tests the wrong game. Kill it
first if the results look impossible.

## Before changing gameplay

[RUNNER.md](RUNNER.md) is the written contract — the curriculum, the slot model, the
fixed things a level brief must not fight, and what the tests will hold you to. It is
kept current, and it is the right place to look first. §15 covers Level 2.
