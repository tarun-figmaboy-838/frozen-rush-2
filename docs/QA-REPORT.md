# Live QA — Frozen Rush

Date: 2026-09-04 · Build: working tree at `81ecac8` + this pass
Harness: `tools/liveqa.mjs`, `tools/qa-evidence.mjs`, plus per-defect capture scripts
Evidence: 42 PNG frames in `qa-report/` (gitignored — they are large and regenerable)

Everything below was found by **driving the real engine in a real browser** and reading
pixels or instrumented numbers back out. Nothing here is a claim about what the code
should do. Where a defect was visual, the "found" line says how it was measured, because
several of these were invisible to a glance and one of them I had previously called
correct without looking.

---

## 1. Defects found and fixed

### 1.1 The rope arrived separately from the block it carries

**Severity: high — it is the first thing the learner sees each phase.**

The rope was drawn from the rig line DOWN to the block's attachment point, with an early
return when that length came out under 4px. A block starts its drop at y −220 while the
rig line is at −24 — so for the first two thirds of the descent the block is *above* the
point it hangs from and the length is negative.

**Found by** printing the geometry at seven points through the drop:

```
block y  -260   attachment y  -377   rope length  -353    <- no rope drawn
block y  -220   attachment y  -337   rope length  -313    <- no rope drawn
block y  -100   attachment y  -217   rope length  -193    <- no rope drawn
block y     0   attachment y  -117   rope length   -93    <- no rope drawn
block y    93   attachment y   -24   rope length     0    <- no rope drawn
block y   200   attachment y    83   rope length   107
block y   470   attachment y   353   rope length   377
```

So the block sailed in from the top of the frame with nothing attached to it, and the
rope only appeared once the block had already dropped past the rig.

**Fixed** by hanging the rope FROM the block rather than down to it: its bottom is pinned
to the attachment point and it runs upward along the sway direction for a fixed 1400px,
which always reaches off the top of the frame. There is no length at which it can fail to
draw, at any position or any angle. The top end is never seen — the fog covers it and the
frame edge cuts it first.

**Proof:** `qa-report/drop-0.png` … `drop-6.png`, captured *inside* the frame loop at
exact block positions (−193, −51, 42, 151, 263, 405, 471) rather than on a wall clock,
because the drop is only 560ms and two earlier attempts at time-based sampling missed the
middle of it entirely.

### 1.2 A gold keyline drawn around TRY AGAIN for every player

**Severity: medium — it was on the failure card, i.e. the worst moment to look broken.**

The ring was the `:focus-visible` outline, and the HUD called `.focus()` on that button
the moment the card opened. A browser treats a programmatic focus as focus-visible, so
this was not a keyboard affordance anyone had asked for — it was a gold hoop drawn around
the button on mouse and touch too.

Underneath that was a second mistake: an outline traces the element's **box**, and these
buttons are a transparent box with a rounded painted pill inside it. Giving the pill a
`border-radius` so the outline would follow it is what produced the hoop; no radius that
fits the box is the right shape or the right size.

**Fixed in both halves.** The indicator is now a `drop-shadow` halo, which follows the
art's **alpha** rather than its box and so hugs the painted edge at any shape. And the
auto-focus is gated on real keyboard use — two capture-phase listeners settle which input
is in play, so a keyboard player still gets Space straight away and a touch player gets
no indicator at all.

**Proof:** `qa-report/ouch-card.png` — driven with a pointer click, `activeElement` reads
`body`, no indicator present. `btn-play-focus.png` shows the halo on a genuine Tab focus.

### 1.3 A rectangular "sheen" band lying across both picture buttons

**Severity: medium — cosmetic, but on the two most-looked-at controls.**

Each picture button carried an absolutely positioned div with a white gradient sweeping
across it on a loop. It could not work: a div clips only to a rectangle with a uniform
radius, so the band was a straight-edged panel lying over rounded art, positioned by
hand-measured insets guessing where the paint was. On screen it read as a pale panel over
half the button, not as light travelling across it.

It was also redundant — both buttons are supplied art with the highlight and gloss
already painted in by the artist, at the right shape and place.

**Fixed** by removing the layer entirely: markup, CSS, and the two now-dead keyframes.
The press is carried by what does follow the paint — the scale squash, the brightness
change, the pressed artwork where it exists, and the tap ring and sparks, which are drawn
*outside* the button where a rectangle is not a problem.

**Proof:** `btn-play-rest/hover/focus.png`, `ouch-card.png`; `0` sheen spans present in
the DOM on both buttons.

### 1.4 A dark mark 13 pixels above the walking line

**Severity: medium. Invisible to a glance — found by pixel scan.**

**Found by** scanning the mended crossing for near-black rows: a 47px band of
`rgb(25,64,102)` = `#123B68` at y 827, present at every bridge value from 0.48 to 1.

`#123B68` is the crevasse interior. The cause is a collision between two correct
decisions: the crevasse mouth is deliberately drawn 2–15px **above** `surfaceY` (that is
what clips away the path artwork's icicle fringe — see `Ground._profile`), but the mended
fill's top baseline was `surfaceY + 4`. The drift mounds covered the difference in most
places, and between two mounds the crevasse interior showed through — over clean snow
that has nothing under it.

**Fixed** by raising the fill's baseline to `surfaceY − 20`, past the highest the profile
can reach, with the cavity clip band widened to `−24` so the raised edge is not cut
straight back off. It cannot overshoot into the snow field either: the whole fill is
clipped to the cavity, so the crevasse's own mouth bounds that edge.

**Proof:** the same scan, re-run across the whole seal — `NONE` at bridge 0.16, 0.48,
0.81 and 1.00. `qa-report/seal-0..3.png`.

### 1.5 The growing ice was a hard-edged rectangle for the first half of the seal

**Severity: medium — brief, but the exact "looks like a sheet" read this fill has twice
been rebuilt to avoid.**

The fill's outline ran top edge left-to-right, bottom edge right-to-left, then
`closePath()`. Both of those joins are **straight vertical lines ~250px long**, lip to
floor. The code relied on a 30px overshoot pushing them outside the cavity clip — which
only works once the fill is nearly full width. The fill grows *outward* from the answer as
its keystone, so for the first half of the seal both faces sit well inside the hole and
are drawn in full.

**Found by** sampling the *early* seal densely (bridge 0.04–0.55), which no earlier
capture had done — every previous frame was at 0.48 or later, by which point the edges
have already passed outside the clip.

**Fixed** by tapering both ends: each front now curves out and down through a control
point pushed past the edge, so ice growing from a keystone has a rounded advancing front.
The nose is clamped to under half the span — at the very start the fill is a few pixels
wide, and two 46px noses would cross and turn the shape inside out.

**Proof:** `qa-report/edge-0..4.png`. At bridge 0.05 and 0.22 the fill is now a rounded
lens spreading from the plug; the rectangle is gone.

---

## 2. Added this pass — the impact layer

No new UI. The request was explicit that the comedy come from sound, effects and
interaction rather than added chrome, and that is what this is. Documented as RUNNER.md
§9a, configured in `CFG.juice`.

| primitive | what it does | fires on |
|---|---|---|
| `hitStop(ms)` | stops the simulation dead; rendering continues | wedge 62ms · splash 44ms · rock 96ms · ice breaking 110ms |
| `punch(amp, ms, x, y)` | scale pulse **about the impact point**, snaps to full then eases out | wedge 1.8% · rock 2.6% · break 3.0% · crossing sealed 2.2% |
| `particles.ring` | one expanding hoop marking where the hit landed | every correct answer |
| `prize()` | a rising phrase, held — the one triumphant sound in the game | a whole crossing closing |

Hit-stop is the largest single change to how the game feels. Two heavy things meeting is
the one moment real motion briefly stops, which is why holding the impact frame reads as
weight — provided it stays short.

**Instrumented over a full run to `COMPLETE`:**

```
hit-stops fired:    12      longest 77ms      ceiling 130ms (hard clamp)
freeze at end:      -0.005s                   (a hold always drains)
punch frames:       39      peak +2.27%       (limit 3%, past which the letterbox shows)
reached:            COMPLETE
JS errors:          none
```

The ceiling is a clamp on the max of the current and incoming hold, so no caller — and no
several callers landing on the same frame — can stall the game.

**Removed on request: pickup tokens.** A spinning gold coin leaping out of each correct
answer, with a two-note pickup ding, was built and then taken out. Recorded in RUNNER.md
§9a so it is not re-proposed: a collectable implies a score, a score implies a counter,
and this game deliberately has no HUD to put one in — and it placed the only warm-yellow
object in the world on top of the learner's answer at the moment the answer is the thing
to look at. `tests/juice.spec.mjs` fails if a coin particle ever returns.

Verified after removal: particle kinds during the reward beat are `frost, snow, ice,
sparkle, ring` — no coin — and the beat still lands (frame held 62ms, punch +1.39%).

---

## 3. What the tests now hold

`tests/juice.spec.mjs` is new, and deliberately does not assert that anything "feels
punchy". This layer stops the simulation and scales the view, so it is the one piece of
polish that can genuinely break the game rather than merely look wrong. It asserts the
three ways it could hurt:

1. a hold that never ends, or that several events on one frame stack into a stall —
   four callers fired together, six rounds over, one asking for 9999ms
2. a punch big enough to pull the world in from the letterboxed frame edge
3. any of it still running under `?reduced=1`

plus one positive (a correct answer really does hold the frame and mark the spot) and one
guard (no pickup token is ever spawned).

---

## 4. The one open design issue

**Interactive time is 3% of the run — 8.2s of 296s.**

This is not a bug and it is the only thing in this pass I have not acted on, because
shortening it changes pacing that was signed off. Tap-to-skip (already in) reclaims about
30s of pre-roll. The rest is `runMs`, a deliberate tripling. It is a product decision,
not a technical one, and it is still open.

---

## 5. A real gameplay bug the suite caught

**A wrong chunk kept travelling sideways while it sank, out of the crevasse and into
the character.**

`tests/regression.spec.mjs` asserts no chunk's left edge ever comes left of x 700 —
the character's right edge is 699. It failed: `phase 1: a chunk reached x 693`.

**Found by** printing the geometry per phase rather than reading the code: the worst
case was a chunk with `state: 'falling'` at x 779, having started its fall at 1509.

`sh.vx` is solved so a wrong chunk arrives over its patch of water by the moment it
passes the surface. It then kept accruing at the same speed for the whole 0.8s of
sinking — about another 500px. A chunk cut on the RIGHT of the row travels leftward, so
it did not stop in the hole: it sailed out of the far side and across the ice.

```
socket x 1210 · vx ≈ -660 px/s · sink 0.8s
1210 - (660 x 0.8) = 682      <- measured worst left edge: 682
```

**Fixed** by advancing `sh.x` only while the chunk is still in the air. A block that has
broken the surface of a meltwater pool does not carry on flying sideways under it.

**Proof:** re-measured all seven phases. Worst left edge is now 774 — and it is a
*hanging* option, not a falling one. No falling chunk is the worst case in any phase
any more.

```
P1 800  P2 799  P3 798  P4 774  P5 791  P6 893  P7 892      (limit: > 700)
```

This one is worth noting for a second reason: it had been failing for a while and I had
not seen it, because I had not completed a full suite run since the two-crevasse change.
The lesson is not about the bug.

---

## 6. Repository structure

`game/assets` was 57MB, of which **43MB was build input no URL in the game ever
requests** — delivered PNGs, un-sliced sheets, GIFs, the cover render. It was kept off
the CDN only by four globs repeated across two `.vercelignore` files, which meant any
new source file dropped in the wrong folder shipped silently.

All of it moved to `art-source/`, outside the deployed folder. Two rules now describe
the whole layout, and a new root `README.md` states them:

1. `game/` is the website — everything in it is fetched by a URL, and nothing else is.
2. Anything a tool reads but the game never fetches lives in `art-source/`.

```
game/         57MB -> 15MB   (only what is served)
art-source/                  every build input, never deployed
docs/                        ANIMATION · ANIMATION-BRIEF · DEPLOY · QA-REPORT
drafts/                      level-2.draft.js, moved out of the deploy root
```

Deleted outright, after confirming zero references anywhere including the tools:
`game/assets/ui/shapes/*.svg` (6 files), `game/drafts/polygon-cut/` (a separate parked
prototype), `game/qa/btn.html` (a scratch page). Both `.vercelignore` files lost their
source-art globs entirely — `game/.vercelignore` now has no rules at all, which is the
point: if something in `game/` needs excluding, that is the signal it is in the wrong
folder.

Verified after the move: `tools/build-option-shapes.mjs --check` reads all 14 shapes and
reports no problems, `tools/check-asset-case.mjs` resolves all 59 referenced paths with
exact case, and the bundle is in sync.

---

## 7. Honest notes on this QA pass itself

- **Two earlier drop captures missed the defect** by sampling on a wall clock against a
  560ms eased animation. The frames that prove the fix are grabbed from inside the frame
  loop at exact block positions. Time-based sampling of a fast eased motion is not
  evidence.
- **One earlier screenshot appeared to show plugs vanishing.** It did not — the run had
  scrolled past the crossing. Re-captured with the game paused at `PHASE_DONE`.
- **I previously reported "250 visible stalls".** That was wrong: an artefact of `?fast=3`
  (three updates per frame) plus per-frame in-page instrumentation. Honest measurement is
  16.6ms p50 while running, zero frames over 100ms; the collapse beat is 24.8ms p50 with
  one 152ms spike.
- **Three of the five defects above were invisible to a glance** (1.4, and the true extent
  of 1.1 and 1.5). They were found by measuring pixels and printing geometry. The lesson
  is already in the standing notes and it held again here: looking at one frame at one
  moment is not the same as checking the animation.
