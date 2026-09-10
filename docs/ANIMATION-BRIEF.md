# Momo — character animation brief

**What this is for:** generating the mammoth's sprite sheets. Every number here is read
out of the running engine, so a sheet built to this brief drops in with no recropping and
no code change. Paste the prompt blocks straight into an image generator.

**Read this instead of [ANIMATION.md](ANIMATION.md)** for new art. That document is the
older production spec and several of its numbers no longer match the code; it carries a
table of its own stale values at the top.

Companion to [RUNNER.md](RUNNER.md), which is the contract for the *levels*.

---

## 0. The hard contract — break any of this and the character jitters or resizes

| | |
|---|---|
| **Cell** | **420 × 320 px**, identical for every frame of every sheet |
| **Layout** | ONE horizontal strip. Frame *n* occupies x = n×420 … (n+1)×420. No grids, no padding between cells, no margins. |
| **Sheet width** | frames × 420. A 24-frame sheet is 10080 × 320. |
| **Foot line** | the character's feet sit **25 px above the cell bottom**, on **every frame of every sheet**. This is `CFG.sprite.baseGap`. |
| **Character size** | identical across all sheets. Do not scale the animal between animations — the engine draws every sheet at the same factor, so a size change reads as the character growing mid-move. |
| **Head room** | the tallest pose must fit inside 320 px with the feet on the foot line. Reserve room *below* the foot line too: a hanging trunk can drop ~50 px under the feet. |
| **Background** | fully transparent. No ground, no shadow, no vignette, no colour fill. |
| **Format** | PNG for delivery (the build converts to WebP). |
| **Drawn at** | 1.75×, so the 420 px cell renders ~735 px wide on a 1920 × 1080 stage and the animal's body reads about 560 px wide, 470 px tall. Draw for that size: details finer than ~3 source px will disappear. |
| **Facing** | **right**. The character always runs left-to-right. Never mirror a sheet to make a new one. |
| **Lighting** | one soft key from the upper LEFT, cool ambient fill. Consistent across every sheet and every frame. |

### Do NOT draw
- **motion blur, speed lines, dust, snow, sparkles, stars, sweat, or impact flashes.** The
  engine draws all of those as particles, and a second set baked into the art reads as a
  mistake. This has already had to be fixed once.
- **any ground contact shadow** — the engine draws a soft radial one.
- **outlines that change weight between frames.**
- **spiral/dizzy eyes or a ring of stars on a knockout** unless you also tell me, because
  the engine has its own circling-stars effect that must then be switched off
  (`koStars` on the character definition).

### Identity
Match the mammoth already in `game/assets/char/` — a young, round, friendly woolly
mammoth: warm russet-brown fur, a shaggy tuft on the crown, large soft ears, two short
cream tusks, small dark eyes with a visible highlight, four stubby legs with pale toenails,
a short tufted tail. Cartoon proportions: big head, short legs, no visible neck. It is
**not** a fresh interpretation of the character — consistency is with what ships.

---

## 1. How to animate it — the rules that make it read as cartoon

These are what "smooth, natural, cartoonish" actually means mechanically. Apply all of
them to every sheet.

1. **Squash and stretch, with volume preserved.** When he compresses he gets wider; when
   he stretches he gets narrower. Never change one without the other — that is the single
   biggest difference between cartoon animation and a resized sprite.
2. **Anticipation before every action.** A jump crouches first. A skid leans back before
   the feet slide. A celebrate dips before it hops. Roughly 2–3 frames.
3. **Overshoot and settle, never a linear arrive.** A pose goes 10–15% past its target and
   comes back over 2–3 frames. Nothing in cartoon animation stops dead.
4. **Follow-through on the loose parts.** The trunk, the ears, the tail and the belly fur
   are on a delay of 2–3 frames behind the body. When the body stops, they keep going and
   then settle. This is most of what sells weight.
5. **Arcs, not straight lines.** Every extremity travels on a curve.
6. **Uneven timing.** Hold the extremes, rush the middles. Evenly spaced frames read as
   mechanical. Put 2 frames on each extreme and 1 through the pass.
7. **One clear silhouette per frame.** At 560 px wide on a bright snow field, readable
   silhouette beats interior detail every time.
8. **Loop seamlessly** where the table below says LOOP: the last frame must lead back into
   the first with no jump.

---

## 2. The sheets

### What ships today

Three: `run`, `jump`, `skid`. That is why several states below are marked **MISSING** —
they currently borrow a pose from the jump sheet, and it shows. `SHAKE` in particular had
no art *and* no duration, so the mammoth used to reach the crevasse and visibly not react
at all; the fright is procedural now (see §4).

| sheet | frames | fps | state it serves | status |
|---|---|---|---|---|
| `run` | 36 | distance-driven | RUN | ships |
| `jump` | 10 | pose-picked | JUMP_START, JUMP_AIR, LAND, IDLE_LOOK, SURPRISED | ships |
| `skid` | 36 | progress-driven | SKID_STOP | ships |
| `shake` | 18 | 16 | SHAKE, LOOK_DOWN | **MISSING** |
| `hurt` | 14 | 16 | HURT | **MISSING** |
| `knockout` | 16 | 15 | KNOCKOUT | **MISSING** |
| `celebrate` | 20 | 15 | CELEBRATE | **MISSING** |
| `idle` | 24 | 9 | IDLE_LOOK | **MISSING** (borrows a jump frame) |

Deliver in the order of that status column: `shake` and `celebrate` buy the most, because
they are the two beats the game repeats seven times each.

---

### 2.1 `run` — 36 frames, LOOP · *ships, respec for reference*

A four-legged run cycle. **The cadence is driven by distance travelled, not a clock**: the
engine advances the frame from `runDist / stride` with `stride = 1120` world px per full
cycle, which at the default 520 px/s is 2.16 s — i.e. **60 ms per frame**. Author it at
60 ms and the feet stay planted at any speed.

**Four footfalls per cycle** — and the engine fires the snow crunch and the puff on frames
**3, 11, 21, 30**, so a hoof must be planted on exactly those frames.

- 0–8 front-left contact and push, body lowest at 3
- 9–17 suspension, body rising, all four legs gathered
- 18–26 rear-right contact, body lowest again at 21
- 27–35 second suspension, back to frame 0
- trunk swings in a figure-of-eight on a 3-frame delay; ears flap up on each rise; tail
  counter-swings; belly fur lags on every drop.

```prompt
A 36-frame horizontal sprite sheet of a young cartoon woolly mammoth running to the
right, side view. Cell size exactly 420x320 pixels, 36 cells in one row, total
15120x320. Transparent background. Feet on a shared baseline 25px above each cell's
bottom edge, identical in every frame. Character identical in size across all frames.
Warm russet-brown shaggy fur, tuft on the crown, large soft ears, two short cream
tusks, small dark friendly eyes, four stubby legs with pale toenails, short tufted
tail. Cartoon proportions, big head, short legs. Soft key light from upper left, cool
ambient fill, clean readable silhouette, crisp edges, no outline weight changes.
Quadruped run cycle with four footfalls, hooves planted on frames 3, 11, 21 and 30.
Squash on each contact and stretch through each suspension with volume preserved.
Trunk swinging in a figure-of-eight two frames behind the body, ears flapping up on
each rise, tail counter-swinging, belly fur lagging. Loops seamlessly from frame 35
back to frame 0. No motion blur, no speed lines, no dust, no snow, no ground shadow,
no background.
```

---

### 2.2 `skid` — 36 frames, PLAY ONCE, progress-driven · *ships, respec for reference*

He is running flat out and the ice cracks. Mapped across 2300 ms of deceleration, i.e.
**60 ms per frame** again, and driven by how far through the slide he is rather than by a
clock — so frame 0 is full speed and frame 35 is stopped.

- 0–4 **anticipation**: still running, weight starting to shift back
- 5–13 the bite: front legs stiffen and plant, body leans back hard, rear legs slide
  forward under him, trunk and ears thrown forward by inertia
- 14–27 the slide: held lean, legs braced, trunk still whipping forward and back
- 28–35 the stop: weight settles forward, front legs take it, a small overshoot as the
  body rocks once and settles. Ends on a standing pose facing right.

The engine draws the snow spray, so leave it out.

```prompt
A 36-frame horizontal sprite sheet of a young cartoon woolly mammoth skidding to a
sudden stop, side view, facing right. Cell 420x320, 36 cells in one row, 15120x320
total, transparent background, feet on a shared baseline 25px above each cell bottom,
character the same size in every frame. Warm russet-brown shaggy woolly mammoth with a
crown tuft, large ears, two short cream tusks, four stubby legs, short tufted tail,
cartoon proportions. Soft key from upper left. Frames 0-4 still running with weight
shifting back. Frames 5-13 front legs stiffen and plant, body leans back hard, rear
legs slide forward, trunk and ears thrown forward by inertia. Frames 14-27 held
braced lean during the slide. Frames 28-35 weight settles forward, body rocks once
past the resting pose and settles into a standing pose. Squash and stretch with
volume preserved, trunk and ears following through two to three frames behind the
body. Plays once, does not loop. No snow spray, no dust, no motion blur, no ground
shadow, no background.
```

---

### 2.3 `jump` — 10 frames, POSE-PICKED · *ships, respec for reference*

Not a loop. The engine picks a single frame by physics, so **each frame must read as a
complete pose on its own**. This is the map it uses:

| frame | name | picked when | pose |
|---|---|---|---|
| 0 | `idle` | standing, and the fallback for LOOK_DOWN | settled four-square stand, weight even, trunk hanging |
| 1 | `crouch` | first 45 ms of a jump | deep anticipation crouch, legs folded, trunk tucked, gathered |
| 2 | `launch` | rest of JUMP_START | full extension, stretched tall and narrow, front legs reaching up, trunk trailing down |
| 3 | `rise` | rising fast (vy < −420) | tucked climb, legs gathered under, ears blown back |
| 4 | `apex` | near the top (−420 … 160) | floating, most rounded and open pose, legs splayed slightly, trunk up |
| 5 | `fall` | descending (160 … 760) | body tipping nose-down, front legs reaching for the ground |
| 6 | `preLand` | falling fast (> 760) | braced, all four legs down and forward, trunk swept back |
| 7 | `land` | first 90 ms of LAND | hardest squash of the whole set — wide and low, legs splayed, ears and trunk driven down |
| 8 | `absorb` | rest of LAND | recovering upward through the squash, about halfway back |
| 9 | `alert` | SURPRISED, and the fallback for a crash | startled: sat back on the rump, front legs off the ground, trunk up, eyes wide, ears forward |

Frames 1→2 and 7→8 carry the whole feel of the jump. Make 1 deep and 2 tall.

```prompt
A 10-frame horizontal sprite sheet of a young cartoon woolly mammoth, side view facing
right. Cell 420x320, 10 cells in one row, 4200x320 total, transparent background, feet
on a shared baseline 25px above each cell bottom (except airborne frames where the
legs are tucked), character the same size in every frame. Warm russet-brown shaggy
woolly mammoth, crown tuft, large ears, short cream tusks, stubby legs, tufted tail,
cartoon proportions. Soft key from upper left. Each frame is a separate complete pose,
not a loop: 1 settled four-square standing pose; 2 deep anticipation crouch with legs
folded and trunk tucked; 3 full launch extension stretched tall and narrow with front
legs reaching up; 4 tucked rising pose with legs gathered and ears blown back; 5
floating apex, rounded and open, legs splayed, trunk up; 6 tipping nose-down with
front legs reaching for the ground; 7 braced pre-landing with all four legs down and
forward; 8 hard landing squash, wide and low, legs splayed, ears and trunk driven
down; 9 recovering halfway up out of the squash; 10 startled alert pose sat back on
the rump with front legs off the ground, trunk raised, eyes wide, ears forward.
Squash and stretch with volume preserved. No motion blur, no dust, no ground shadow,
no background.
```

---

### 2.4 `shake` — 18 frames, PLAY ONCE THEN HOLD THE LAST · **MISSING — highest value**

**The single most valuable sheet to add.** He has stopped at the lip of the crevasse and
seen how wide it is. Plays at **16 fps** (≈1.1 s), then **holds frame 17** for as long as
the learner takes to solve the puzzle — which can be minutes, so frame 17 must be a pose
that is comfortable to look at for a long time.

- 0–2 the fright: recoil back from the edge, body stretched away, ears up, eyes wide
- 3–10 the shiver: knees knocking, whole body trembling, trunk vibrating, ears quivering.
  Alternate the tremble left/right every frame — do not draw a smooth wave.
- 11–14 he leans forward and looks DOWN into the hole, trunk hanging over the edge
- 15–17 settles into the held look-down pose: standing, head and trunk down over the
  edge, worried but calm, ears slightly back. **Frame 17 is the hold.**

The engine adds its own procedural tremble, double take, gulp and sweat beads on top of
whatever is showing (§4), so keep the *drawn* shiver modest — it will be amplified.

```prompt
An 18-frame horizontal sprite sheet of a young cartoon woolly mammoth getting a fright
at the edge of a crevasse, side view facing right. Cell 420x320, 18 cells in one row,
7560x320 total, transparent background, feet on a shared baseline 25px above each cell
bottom, character the same size in every frame. Warm russet-brown shaggy woolly
mammoth, crown tuft, large ears, short cream tusks, stubby legs, tufted tail, cartoon
proportions, expressive friendly face. Soft key from upper left. Frames 1-3 startled
recoil backwards away from the edge, body stretched back, ears up, eyes wide. Frames
4-11 knees knocking and whole body trembling with fear, trunk vibrating, ears
quivering, tremble alternating side to side each frame. Frames 12-15 leaning forward
and looking down into the hole with the trunk hanging over the edge. Frames 16-18
settling into a calm worried standing pose with the head and trunk lowered over the
edge and ears slightly back; the final frame is held for a long time so it must be a
comfortable, stable, appealing pose. Squash and stretch with volume preserved, trunk
and ears following through behind the body. Plays once then holds the last frame. No
sweat drops, no motion lines, no snow, no ground shadow, no background.
```

---

### 2.5 `celebrate` — 20 frames, PLAY ONCE · **MISSING — second highest value**

A crossing is mended and he can go on. Fires **seven times** a playthrough, so it has to
stay charming on the seventh viewing. **15 fps** (≈1.3 s).

- 0–2 anticipation dip, weight down, gathering
- 3–7 first hop: launch, stretch, trunk thrown up, ears flying, tail up
- 8–11 land, squash, immediately push off again
- 12–15 second smaller hop with a happy head-shake at the top, trunk curled up
- 16–19 land and settle with one overshoot, trunk still swinging, ending on a standing
  pose that flows into the run

Give him a real smile and squeezed-shut happy eyes at the top of the first hop.

```prompt
A 20-frame horizontal sprite sheet of a young cartoon woolly mammoth celebrating
happily, side view facing right. Cell 420x320, 20 cells in one row, 8400x320 total,
transparent background, feet on a shared baseline 25px above each cell bottom,
character the same size in every frame. Warm russet-brown shaggy woolly mammoth, crown
tuft, large ears, short cream tusks, stubby legs, tufted tail, cartoon proportions.
Soft key from upper left. Frames 1-3 anticipation dip gathering weight downward.
Frames 4-8 a big happy hop, body stretched upward, trunk thrown up, ears flying, tail
raised, wide smile and happy squeezed-shut eyes at the top. Frames 9-12 landing squash
and an immediate push off again. Frames 13-16 a second smaller hop with a joyful
head-shake and the trunk curled up. Frames 17-20 landing and settling with one
overshoot, trunk still swinging, ending in a standing pose. Squash and stretch with
volume preserved, trunk ears and tail following through two to three frames behind the
body. Plays once. No confetti, no sparkles, no stars, no dust, no ground shadow, no
background.
```

---

### 2.6 `hurt` — 14 frames, PLAY ONCE · **MISSING**

A glancing bump he shrugs off — he keeps running afterwards, so it must return to a
running-compatible pose. **16 fps** (≈0.9 s). This is the *light* version; `knockout` is
the heavy one.

- 0–1 impact: head snaps back, eyes shut, body compressed
- 2–5 a stumble — one front leg buckles, he lurches
- 6–9 recovery, shaking his head, trunk flailing
- 10–13 back up to speed, ending on a pose that cuts cleanly into the run cycle

```prompt
A 14-frame horizontal sprite sheet of a young cartoon woolly mammoth taking a light
bump and shrugging it off, side view facing right. Cell 420x320, 14 cells in one row,
5880x320 total, transparent background, feet on a shared baseline 25px above each cell
bottom, character the same size in every frame. Warm russet-brown shaggy woolly
mammoth, crown tuft, large ears, short cream tusks, stubby legs, tufted tail, cartoon
proportions. Soft key from upper left. Frames 1-2 impact with the head snapping back,
eyes squeezed shut and the body compressed. Frames 3-6 a stumble where one front leg
buckles and he lurches forward. Frames 7-10 recovery, shaking his head, trunk
flailing. Frames 11-14 back up to speed, ending in a pose that flows straight into a
run cycle. Squash and stretch with volume preserved. Plays once. No stars, no impact
flash, no dust, no ground shadow, no background.
```

---

### 2.7 `knockout` — 16 frames, PLAY ONCE THEN HOLD THE LAST · **MISSING**

He walked into a rock. Runs at **15 fps** (≈1.07 s) and is timed so the crash finishes
exactly as the "Try Again" card arrives at 1100 ms. **The last frame is held** until the
player taps, so it must be readable and appealing at rest.

- 0–1 the hit: hard compression against the obstacle, eyes wide, trunk crumpled
- 2–5 he tips over backwards, legs in the air
- 6–10 lands on his rump, bounces once
- 11–15 settles sitting down, dazed, ears drooped, trunk flopped in his lap, a comic
  cross-eyed or half-lidded expression. **Frame 15 is the hold.**

Do **not** draw circling stars or spiral eyes without saying so — the engine has its own
star effect and it must be turned off if you bake them in.

```prompt
A 16-frame horizontal sprite sheet of a young cartoon woolly mammoth walking into a
rock and falling over, side view facing right. Cell 420x320, 16 cells in one row,
6720x320 total, transparent background, feet on a shared baseline 25px above each cell
bottom where the feet are down, character the same size in every frame. Warm
russet-brown shaggy woolly mammoth, crown tuft, large ears, short cream tusks, stubby
legs, tufted tail, cartoon proportions. Soft key from upper left. Frames 1-2 hard
impact compression with eyes wide and trunk crumpled. Frames 3-6 tipping over
backwards with the legs going up. Frames 7-11 landing on the rump and bouncing once.
Frames 12-16 settling into a sitting dazed pose, ears drooped, trunk flopped into his
lap, comic half-lidded expression; the final frame is held until the player taps so it
must be a stable appealing pose. Squash and stretch with volume preserved. Plays once
then holds the last frame. No stars, no spiral eyes, no impact flash, no dust, no
ground shadow, no background.
```

---

### 2.8 `idle` — 24 frames, LOOP · **MISSING**

For the title screen and any pause in the run. **9 fps** (≈2.7 s), and it loops
indefinitely, so it must be genuinely seamless and very calm — this is the one the player
stares at.

- a slow breath through the whole cycle, about 3 px of rise on a 470 px character
- one ear flick around frame 8
- a slow blink around frame 14
- a lazy trunk sway across the whole loop, never returning to exactly the same spot until
  frame 23

```prompt
A 24-frame horizontal sprite sheet of a young cartoon woolly mammoth standing idle,
side view facing right. Cell 420x320, 24 cells in one row, 10080x320 total,
transparent background, feet on a shared baseline 25px above each cell bottom,
character the same size in every frame, feet perfectly still throughout. Warm
russet-brown shaggy woolly mammoth, crown tuft, large ears, short cream tusks, stubby
legs, tufted tail, cartoon proportions, friendly face. Soft key from upper left. A very
calm seamless idle loop: a slow breath rising and falling about three pixels across the
whole cycle, one ear flick around frame 9, a slow blink around frame 15, and a lazy
trunk sway that completes exactly one cycle. Loops seamlessly from the last frame back
to the first with no jump. Subtle and stable — this plays continuously on the title
screen. No motion lines, no dust, no ground shadow, no background.
```

---

## 3. Delivering it

1. Drop the raw sheets in `art-source/` as `mammoth-<name>-raw.png`.
2. Run the slicer, which rebuilds every frame onto the shared 420 × 320 cell and the
   shared foot line, and writes the WebP the game loads:
   ```
   node tools/slice-char.mjs --report     # measure and print, write nothing
   node tools/slice-char.mjs              # slice and write
   node tools/slice-char.mjs --contact    # also write a contact sheet to eyeball
   ```
3. Register the sheet in `CFG.characters[0]` in [game/js/engine.js](game/js/engine.js) —
   add the file to `sheets` and its frame count to `frames`. The engine picks it up
   automatically; every state below already has the branch waiting for it.
4. Rebuild the file:// bundle and run the suite:
   ```
   node tools/build-bundle.mjs
   npx playwright test
   ```

### Acceptance checklist
- [ ] cell is exactly 420 × 320, sheet width = frames × 420, one row
- [ ] feet on the same line, 25 px above the cell bottom, in **every** frame
- [ ] the animal is the same size in every frame of every sheet
- [ ] nothing clipped at any cell edge; no neighbour bleeding into a cell
- [ ] transparent background, no baked shadow or effects
- [ ] facing right
- [ ] LOOP sheets loop with no visible jump
- [ ] HOLD sheets end on a pose that is comfortable to stare at
- [ ] `run`: a hoof is planted on frames 3, 11, 21, 30

The suite already enforces most of this — cell size, no clipped frames, no stray
fragments, and one character size across every animation.

---

## 4. What the engine adds on top — do not duplicate it

Since the shiver sheet was removed, the reactions are animated procedurally over whatever
frame is showing, from `CFG.comedy` in [game/js/engine.js](game/js/engine.js). New art
**layers under** this rather than replacing it, so leave all of it out of the drawings:

| the engine draws | when |
|---|---|
| a knock-kneed sideways tremble at 9.5 Hz, with a nervous roll and a jelly squash | the fright at the crevasse, decaying over 1.35 s |
| a double take — recoils 26 px off the lip, then leans 15 px in | entering the fright, then peering |
| a gulp | every 2.3 s while he is over the hole |
| sweat beads flicked off the head | while he is stopped and rattled |
| squash on landing and stretch on launch, volume-preserved | every jump |
| snow puffs, ice chips, splashes, frost, sparkles | footfalls, landings, cuts, rewards |
| a soft radial contact shadow | always |
| circling stars on a knockout | only if `koStars` is turned on |

If you deliver a `shake` sheet with a strong drawn tremble, turn the procedural amplitude
down (`CFG.comedy.wobbleX`, `wobbleRot`, `wobbleSq`) or the two will compound.
