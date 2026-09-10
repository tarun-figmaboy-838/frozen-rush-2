# Momo — animation sprite specification

> ### ⚠ PARTLY STALE — read this first
>
> This document was written against a five-sheet character and has NOT been kept in
> step with the art that ships. Audited 2026-09-03; the numbers below that are wrong,
> with the value the code actually uses:
>
> | This document says | The code does |
> |---|---|
> | five sheets: run, jump, skid, shake, hurt | **three**: run, jump, skid. `shake` and `hurt` were removed on request, so `SHAKE`, `LOOK_DOWN`, `HURT` and `KNOCKOUT` fall back to poses from the jump sheet |
> | 12-frame run and skid, 5040 × 320 | **36 frames each**, 15120 × 320 |
> | stride 540 | **1120** — the source GIF is authored at 60ms a frame, so one cycle is 2.16s of ground |
> | foot line 28px / 54px above the cell bottom | **`CFG.sprite.baseGap` = 25** |
> | drawn at 1.28×, about 538px tall | **1.75×, about 735px wide** |
> | a 780ms skid | **2300ms** (`CFG.timing.breakSkid`), so 36 frames play at their authored rate |
> | the knockout art has stars and spiral eyes drawn in | **there is no knockout sheet** |
> | "the six repairs" | **seven** |
> | §3/§5's 22px baseline spread "which the engine corrects" | the per-frame correction was REMOVED — `tools/slice-char.mjs` bakes every frame onto one foot line instead, so there is nothing left to correct |
>
> **What is still accurate and still binding:** the 420 × 320 cell, the horizontal-strip
> layout, one shared foot line across every sheet, and the rule that a new sheet must
> match the character already in `game/assets/char/` rather than reinterpret it.
>
> **The fright at the crevasse is no longer art at all.** With no shake sheet, `SHAKE`
> used to exit on its first frame and the mammoth visibly did not react to the hole. It
> is now animated procedurally on top of whatever frame is showing — a knock-kneed
> tremble, a double take, a gulp and sweat — from `CFG.comedy` in
> [engine.js](game/js/engine.js). A delivered shake sheet would layer under it, not
> replace it.

Production spec for the baby woolly mammoth's sprite sheets. Companion to
[RUNNER.md](RUNNER.md).

**Identity reference:** the mammoth art already in `game/assets/char/`. New sheets must
match those, not a fresh interpretation of the character — consistency is with what ships.

---

## 0. The contract the engine imposes

These are not preferences. `CFG.sprite` and the character definition in
[engine.js](game/js/engine.js) read sheets exactly this way, and a sheet that deviates
will jitter, clip or change size mid-animation.

| | |
|---|---|
| **Cell** | **420 × 320 px**, identical for every frame of every sheet |
| **Layout** | **one row**, N columns. A horizontal strip. Sheet width = `420 × N`, height = `320` |
| **Facing** | right, strict 90° side profile |
| **Background** | transparent. No ground, no scene, no text, no borders |
| **Foot line** | the character's **feet** sit **28 px above the cell bottom** (`CFG.sprite.baseGap`). Not its lowest pixel — see below. The slicer prints the value it built to; it moves when the set of sheets changes, because the shared scale is derived from the whole set |
| **Pivot** | horizontal centre of the cell. The engine draws the cell centred on the character's x |
| **Scale** | drawn at 1.28×, so a 420 px cell renders ~538 px wide. Detail must survive that |
| **Padding** | nothing may touch a cell edge. Trunk, tusks, ears, tail and feet especially |

### The foot line, precisely — and why it is not the lowest pixel

This is the single thing most worth getting right, and it is the thing that was wrong.

The engine used to measure each frame's **lowest opaque pixel** and lift the cell so that
pixel landed on the ground. That is correct only while the lowest pixel *is* a foot. In a
head-down pose it is the tip of the trunk — up to **52 px** below the feet in this art — so
that frame got hoisted 52 px into the air. On screen the character floated above the path
and appeared to change size from pose to pose.

The rule now is: **the foot line is the lowest row of the frame that still carries a
quarter of that frame's widest row.** A trunk, a tail and a flailing leg are all narrow;
feet are several contact patches spread across the body. Everything below the foot line is
overhang, and it is allowed to hang past the ground — which is why the cell reserves 54 px
under the foot line instead of 6.

The engine no longer corrects anything per frame. `tools/slice-char.mjs` bakes every frame
onto one shared foot row, and the engine simply draws to it. Correcting on top of that
would put the fault straight back.

- **Within a locomotion sheet (run, jump), vertical variation is animation.** A run cycle
  *should* lift off the ground; that bob is what stops it reading as a slide. Keep it. It
  is measured between FOOT LINES, so it is real body movement rather than a swinging trunk.
- **Within a held-pose sheet (skid, shake, hurt), vertical variation is a bug.** The
  character appears to float, and it holds one of these poses for as long as a learner
  takes over a puzzle. Every frame's feet must be on the same row; a test enforces it to
  within 3 px.

### Frame counts are declared, not inferred

```js
frames: { run: 20, jump: 10, skid: 15, shake: 12, hurt: 16 }
```

A sheet with a different count needs this updated, and a mismatch silently shifts every
frame. Do not count the cells by eye — a sheet that *looks* 4×4 is often 4×3, and these
were 5×4, 7×2 and 6×4. The slicer finds the frames by connected components and prints the
count it found; take it from there.

### Delivery is through the slicer, not by hand

Drop the raw generated grid into `game/assets/char/` under its own name
(`run.png`, `jump.png`, `skid.png`, `shiwaring.png`,
`knockout.png`) and run:

```bash
node tools/slice-char.mjs --report    # measure, write nothing
node tools/slice-char.mjs --contact   # write the strips and a contact sheet to look at
```

It does the work this spec used to ask an artist for: finds the frames whatever the grid,
puts them in reading order, drops stray specks, erases fragments that bled in from the
neighbouring cell, scales every sheet by ONE shared factor so the character cannot change
size between animations, and aligns every frame on its foot line. It prints the
`frames` block and the `baseGap` value to put in the engine.

What it cannot invent is a pose that is not in the art. See §11.

---

## 1. RUN — 12 frames

The state the player sees most, and the one the whole game's rhythm rests on.

**Layout** 12 columns × 1 row · 5040 × 320 · **15 fps nominal**

> **Timing note that changes how you animate this:** the run is **distance-driven**, not
> time-driven. The engine picks the frame from `runDist / stride` with a stride of 540
> world px, so one full 12-frame cycle covers 540 px however fast the character is
> moving. Feet planted at contact will stay planted at any speed. Do not animate a
> "fast" and "slow" variant — there is one cycle and the world scrolls past it.

### Frame breakdown

| # | Pose |
|---|---|
| 1 | **Contact, front-left.** Front-left foot strikes, leg extended forward. Body at its lowest-forward lean. Trunk swung back from inertia |
| 2 | **Down.** Weight passes over the planted foot, body at lowest point, knees compressed. Fur settles downward |
| 3 | **Passing.** Rear legs gathering under the body, hips level, body starting to rise |
| 4 | **Up / push.** Front foot drives off, body at peak height, all four feet near the body. Ears lift, hair tuft trails |
| 5 | **Airborne stretch.** Fullest extension of the stride, body highest, tail streamed back |
| 6 | **Reach.** Front-right leg swings forward to lead, body beginning to descend, trunk swinging forward |
| 7 | **Contact, front-right.** Mirror of 1 — the second half of the cycle, other lead |
| 8 | **Down.** Mirror of 2 |
| 9 | **Passing.** Mirror of 3 |
| 10 | **Up / push.** Mirror of 4 |
| 11 | **Airborne stretch.** Mirror of 5 |
| 12 | **Reach.** Mirror of 6, resolving cleanly into frame 1 |

**Secondary motion:** trunk swings on a lag of roughly two frames behind the body — never
reshaped, only carried. Ears flap on the vertical bob, one frame behind. Hair tuft trails
opposite the direction of travel. Tail counter-swings to the hips. Fur along the belly and
haunches settles a frame late on every down-beat.

**Must not happen:** head size changing, body bulk pumping, the trunk curling into a new
shape, or the tusks moving relative to the skull.

**FX layers (separate sheets):** snow puff at each contact frame (1, 2, 7, 8) — a low, wide
scatter behind the foot, ~120 × 60, transparent, offset so it sits *behind* the character;
speed lines behind the body for the fast segments, ~200 × 90.

**Gameplay:** loops continuously through `RUN_SEGMENT_1`, `POST_JUMP_RUN_1`, `PHASE_RUN`
and `FINAL_RUN`.

**In:** from `LAND` frame 10 (absorb) and from `PHASE_DONE`'s celebrate settle. Cycle
begins at frame 1 from a standing start, or resumes at phase for a continuing run.
**Out:** to `JUMP_START` (any frame — the crouch reads from anywhere), to `SKID_STOP`
(cleanest from a contact frame), to `KNOCKOUT` (any frame).

---

## 2. JUMP — 10 frames, named poses

Not a loop. The engine addresses these frames **by name** and holds them according to
physics, so each frame is a pose that may be held for an arbitrary time.

```js
jumpMap: { idle: 0, crouch: 1, launch: 2, rise: 3, apex: 4,
           fall: 5, preLand: 6, land: 7, absorb: 8, alert: 9 }
```

**Layout** 10 columns × 1 row · 4200 × 320 · pose-driven, no fixed fps

| # | Name | Pose · when it shows |
|---|---|---|
| 1 | `idle` | Standing square, four feet down, alert but relaxed. Held during `IDLE_LOOK` |
| 2 | `crouch` | Anticipation: knees deeply bent, body low, head dipped, weight loaded. Shown for the first 45 ms of the jump |
| 3 | `launch` | Explosive extension, front feet leaving, body angled up, trunk thrown forward |
| 4 | `rise` | Climbing hard, legs tucking, ears and hair pushed back by the air. Shown while `vy < -420` |
| 5 | `apex` | Floating at the top, legs fully tucked, trunk curled up, body level. Held while `-420 ≤ vy < 160` — this is the frame the player reads mid-jump, so it must be the most appealing pose in the sheet |
| 6 | `fall` | Descending, legs beginning to reach down, body tipping forward. `160 ≤ vy < 760` |
| 7 | `preLand` | Braced for impact, front legs extended down and forward, eyes on the ground. `vy ≥ 760` |
| 8 | `land` | Contact: feet planted, legs compressed, body squashed, fur and ears bouncing up |
| 9 | `absorb` | Recovery: rising out of the compression, overshooting slightly upright |
| 10 | `alert` | Startled — ears up, eyes wide, head back, weight rocked onto the rear. Used for `SURPRISED` when a wrong shape splashes |

**Weight rules:** the crouch must be deeper than feels comfortable — anticipation is what
sells the mass of a chunky animal. `land` must compress *more* than `crouch`. `absorb`
overshoots past neutral before `RUN` takes over, or the landing reads as sticky.

**FX layers:** launch dust ring at frame 3 (wide, low, radiating); landing impact puff at
frame 8 (taller, sharper, plus 2–3 short radial lines); optional small snow flecks kicked
up trailing frames 3–4.

**Gameplay:** `JUMP_START` → `JUMP_AIR` → `LAND` over the rock obstacles. `apex` may hold
for several hundred ms on a long jump.

**In:** from `RUN` at any frame. **Out:** frame 10 (`absorb`) → `RUN` frame 1; or straight
to `KNOCKOUT` if the jump was mistimed.

---

## 3. SKID — 12 frames

The stop when the ice cracks. Plays once, driven by a **progress value 0→1** mapped across
the sheet rather than by a clock — so the deceleration curve drives the frame, and the
last frame lands exactly as the character comes to rest.

**Layout** 12 columns × 1 row · 5040 × 320 · progress-mapped over ~780 ms

| # | Pose |
|---|---|
| 1 | Last running contact, weight still forward |
| 2 | **Alarm.** Head snaps up, eyes widen, trunk lifts — the moment the ice is heard |
| 3 | Front legs stiffen and brace forward, body rocks back |
| 4 | Hooves dig, forelegs locked, body angled back hard against the slide |
| 5 | Deepest brace: rear haunches dropping, tail up, weight fully back |
| 6 | Rear end lowering toward the ice, front legs still locked |
| 7 | Haunches touch down, sliding on the rear, forelegs out ahead |
| 8 | Full sit-slide, body leaning back, trunk swung up and back |
| 9 | Slowing: body starting to right itself, forelegs unlocking |
| 10 | Nearly stopped, weight settling forward off the haunches |
| 11 | Settle: rocking back to four feet, ears and hair overshooting |
| 12 | **Stopped, standing, breathing.** Feet square, head still up. Hands over to `SHAKE` |

**Critical:** the contact point must sit on the same baseline from frame 7 to frame 12 —
these are the grounded frames. Current sheet spread here is 22 px, which the engine
corrects; new art should not need it.

**FX layers:** snow skid spray from frames 4–9 — a long, low plume streaming *behind* the
character, growing to frame 6 then thinning. Keep it clear of the body. Ice chips at frame
4 (a few small angular flecks, forward and up).

**Gameplay:** `SKID_STOP`, during `GLACIER_BREAK_1`. Runs concurrently with the earthquake
rumble and the crack opening.

**In:** from `RUN`, cleanest from a contact frame. **Out:** frame 12 → `SHAKE` frame 1,
seamlessly — frame 12 and shake frame 1 must be the same standing pose.

---

## 4. SHAKE / tremble → look down — 12 frames

The character trembles at the edge of the crevasse, then settles into looking down at it.
**Plays through once at 16 fps and holds the final frame** — the held pose is then on
screen for as long as the learner takes over the puzzle, which may be minutes.

**Layout** 12 columns × 1 row · 5040 × 320 · **16 fps, plays once, holds frame 12**

| # | Pose |
|---|---|
| 1 | Standing, matching skid frame 12 exactly |
| 2–3 | Small fast tremble: body shivers, ears rattle, weight shifting foot to foot |
| 4–5 | Bigger tremble, head shaking, trunk swinging loosely |
| 6–7 | Tremble easing, head beginning to lower |
| 8 | Head dipping, eyes tracking downward |
| 9 | Neck lowering further, trunk hanging down |
| 10 | Leaning over the edge, front feet planted at the lip |
| 11 | Almost there, ears forward, trunk reaching down |
| 12 | **Held pose: looking down into the crevasse.** Head low, trunk hanging, ears forward, worried but not distressed. Feet square |

**Frame 12 is the most important frame in the game.** It is the resting expression during
every puzzle. It must read as *concerned and curious*, not frightened — the learner should
want to help, not feel the character is suffering. It must also be perfectly on-baseline,
and composed to sit still: the engine adds a small procedural breath on top, so the pose
itself should be neutral enough that a gentle rise and fall looks natural.

**Do not** make this sheet loop-friendly. A looping tremble read as a twitch. It plays
once and stops.

**FX layers:** none. A held pose with effects on it becomes visual noise for minutes.

**Gameplay:** `SHAKE` → `LOOK_DOWN`. `LOOK_DOWN` holds frame 12 and is also entered
directly after a wrong answer.

**In:** from `SKID_STOP` frame 12. **Out:** to `CELEBRATE` when the crossing is repaired,
or to `RUN` when the run resumes.

---

## 5. HURT / KNOCKOUT — 10 frames

Hitting a rock. Plays once at 13 fps and holds the last frame while the Try Again card
comes up on its own timeline.

**Layout** 10 columns × 1 row · 4200 × 320 · **13 fps, plays once, holds frame 10**

| # | Pose |
|---|---|
| 1 | Impact: body stopped dead, head snapped back, eyes shut, everything compressed forward |
| 2 | Rebounding backward off the obstacle, feet leaving the ground |
| 3 | Tipping back, legs flailing forward, trunk thrown up |
| 4 | Falling backward, hindquarters dropping first |
| 5 | Rear hits the ice hard, front legs up |
| 6 | Sprawl: sitting down heavily, front legs splayed, body bouncing |
| 7 | Settling, head wobbling, ears flopped |
| 8 | Sitting, dazed, head lolling |
| 9 | Head rolling, eyes unfocused |
| 10 | **Held: sat down, dazed but unhurt.** Eyes spiralled or half-lidded, ears down, trunk drooping, one front leg out. Faintly comic — this is a children's game and a crash must be funny, not upsetting |

**Frames 5–10 are grounded and must share one contact line.** Measured spread on the
current sheet is 22 px.

**The delivered art has stars and spiral eyes DRAWN IN**, so `koStars` is now `false` for
this character and the engine adds none of its own. Two sets at once looks like a mistake.
If a future sheet arrives without them, turn the flag back on.

**FX layers:** impact burst at frame 1 (short radial lines plus a few ice chips, forward
of the character); snow puff at frame 5 where the rear lands.

**Gameplay:** `KNOCKOUT` during `OBSTACLE_HIT`. Frame 10 holds under the Try Again card.
Three failures crumble the rock so the run can never dead-end.

**In:** from `RUN` or `JUMP_AIR`, any frame. **Out:** frame 10 held → the retry resets to
`RUN` frame 1.

---

## 6. CELEBRATE — 8 frames · **not yet drawn**

**This is a real gap.** The engine currently fakes celebration from jump-sheet frames,
choosing between `crouch`, `launch`, `apex` and `land` off a hop arc. It works, but it is
a jump pretending to be joy — no expression change, no arms-up equivalent, no trunk raise.
It plays after every one of the six repairs, so it is the game's main reward.

**Layout** 8 columns × 1 row · 3360 × 320 · **12 fps, loops for ~700 ms**

| # | Pose |
|---|---|
| 1 | Anticipation: crouch, head coming up, eyes bright, trunk beginning to lift |
| 2 | Push off, front feet leaving, trunk curling up |
| 3 | Airborne, legs tucked, trunk raised high in a trumpet, mouth open, ears up |
| 4 | Peak of the hop, fullest trumpet, body arched back slightly, tail up |
| 5 | Descending, trunk still up, legs reaching down |
| 6 | Landing, compression, trunk starting to lower |
| 7 | Rebound into a second smaller hop, head still high |
| 8 | Settle, four feet down, delighted expression held, ready to loop or exit |

**Character note:** the trumpet raise is Momo's celebration — `voice: 'trumpet'` in the
character definition. The pose should read as *trumpeting*, not merely jumping.

**FX layers:** snow puffs at frames 2 and 6; a sparkle or frost-glint burst at frame 4,
kept clear of the body.

**In:** from `LOOK_DOWN` frame 12 when the crossing seals. **Out:** frame 8 → `RUN`
frame 1 as the run resumes.

---

## 7. IDLE — 6 frames · **not yet drawn**

Also currently improvised: `IDLE_LOOK` holds jump frame 1 with a procedural breath on top.
It is on screen on the title and whenever the world is stopped, so a single frozen frame is
the first thing a player sees.

**Layout** 6 columns × 1 row · 2520 × 320 · **8 fps, loops**

| # | Pose |
|---|---|
| 1 | Standing square, neutral, breathing in |
| 2 | Chest fullest, head marginally higher, ears settled |
| 3 | Breathing out, head easing down, fur settling |
| 4 | Lowest of the breath, trunk swaying slightly left |
| 5 | Trunk swaying back, one ear flicking |
| 6 | Blink, returning to neutral, resolving into frame 1 |

Very small amplitude — no more than 6–8 px of vertical movement. This is the character
*alive*, not the character *doing* something. The engine's procedural breath should be
switched off for this state once the sheet exists, or the two will compound.

**FX layers:** none.

**In:** from boot, and from any stopped state. **Out:** to `RUN` frame 1.

---

## 8. Image-generation prompts

Each prompt is self-contained. Generate one sheet at a time — a single prompt asking for
several sheets will drift the identity between them.

### Shared preamble — prepend to every prompt

```
Sprite sheet for a 2D side-scrolling game. Cute premium mobile-game art, clean vector-like
rendering with soft painted shading, crisp readable silhouette, no blur, no muddy edges.

CHARACTER: a baby woolly mammoth. Warm russet-brown shaggy fur, a thick tuft of darker
brown hair standing up on the top of the head, large soft rounded ears with pink inner
skin, big friendly dark eyes with visible highlights, two short creamy-white curved tusks,
a long expressive trunk, four short sturdy legs with pale cream toenails, a short tufted
tail. Chunky childlike proportions: large head, round barrel body, short legs. Warm,
appealing, unthreatening.

VIEW: strict 90-degree side profile, facing RIGHT. Absolutely no three-quarter angle, no
front-facing drift, no camera rotation between frames.

LAYOUT: a single horizontal row of N equal cells. Each cell exactly 420 x 320 pixels.
Fully transparent background. No scene, no ground, no shadow on the ground, no text, no
numbers, no frame borders, no decorative elements.

CONSISTENCY: identical character in every cell — same face, same fur colour, same tusk
shape and size, same trunk style, same ear shape, same hair tuft, same tail, same body
bulk, same head size, same overall scale. Nothing grows, shrinks or is redesigned between
frames.

FRAMING: the character centred horizontally in each cell, feet on a constant baseline near
the bottom of the cell with a small consistent gap beneath. Generous transparent padding on
all four sides. Trunk, tusks, ears, tail and feet must never touch or cross a cell edge.
```

### RUN

```
[shared preamble, N = 12]

ANIMATION: a 12-frame side-view running cycle, looping seamlessly from frame 12 back to
frame 1. Two full strides — frames 1-6 lead with the front-left leg, frames 7-12 mirror it
with the front-right.

FRAMES:
1  front-left foot striking the ground, leg extended forward, body low and leaning forward,
   trunk swung back
2  weight over the planted foot, body at its lowest, knees compressed, fur settling down
3  rear legs gathering under the body, hips level, body beginning to rise
4  front foot driving off, body at peak height, legs gathered, ears lifted, hair trailing
5  fullest stride extension, body highest, all feet off the ground, tail streamed back
6  front-right leg swinging forward to lead, body descending, trunk swinging forward
7  front-right foot striking, mirror of frame 1
8  mirror of frame 2
9  mirror of frame 3
10 mirror of frame 4
11 mirror of frame 5
12 mirror of frame 6, resolving into frame 1

SECONDARY MOTION: the trunk swings with about two frames of lag behind the body and is
never reshaped, only carried. Ears flap on the vertical bob, one frame late. The hair tuft
trails opposite the direction of travel. The tail counter-swings against the hips. Belly
and haunch fur settles a frame late on each downbeat.

The body rises and falls through the cycle — this vertical bob is intentional and must be
present. Do not flatten it.
```

### JUMP

```
[shared preamble, N = 10]

ANIMATION: 10 individual jump poses, NOT a loop. Each frame is a distinct pose that the
game holds for a variable length of time, so each must read clearly on its own.

FRAMES:
1  standing square on four feet, alert and relaxed, neutral
2  deep anticipation crouch, knees strongly bent, body low, head dipped, weight loaded
3  explosive launch, front feet leaving the ground, body angled upward, trunk thrown forward
4  rising fast, legs tucking up, ears and hair pushed back by the air
5  floating at the top of the arc, legs fully tucked, trunk curled up, body level, the most
   appealing pose in the sheet
6  descending, legs beginning to reach downward, body tipping forward
7  braced for landing, front legs extended down and forward, eyes on the ground below
8  landing impact, feet planted, legs compressed hard, body squashed, fur and ears bouncing
   upward
9  absorbing and rising out of the compression, overshooting slightly upright
10 startled reaction pose: ears up, eyes wide, head back, weight rocked onto the rear legs

WEIGHT: frame 2's crouch must be deeper than feels comfortable, and frame 8 must compress
more than frame 2 — this is a heavy, chunky animal and the anticipation and impact are what
sell its mass.
```

### SKID

```
[shared preamble, N = 12]

ANIMATION: a 12-frame skidding stop, played once. The character is running and slams on the
brakes on ice, sliding to a halt.

FRAMES:
1  last running contact, weight still forward
2  alarm: head snaps up, eyes widen, trunk lifts
3  front legs stiffen and brace forward, body rocking back
4  hooves digging in, forelegs locked straight, body angled hard back against the slide
5  deepest brace, rear haunches dropping, tail up, weight fully back
6  rear end lowering toward the ice, front legs still locked
7  haunches touch down, sliding on the rear, forelegs out ahead
8  full sit-slide, body leaning back, trunk swung up and back
9  slowing, body starting to right itself, forelegs unlocking
10 nearly stopped, weight settling forward off the haunches
11 settling back onto four feet, ears and hair overshooting
12 stopped, standing square on four feet, head still up, breathing

IMPORTANT: from frame 7 to frame 12 the character is in contact with the ground, and that
contact point must sit on exactly the same baseline in all six of those frames.
```

### SHAKE / LOOK DOWN

```
[shared preamble, N = 12]

ANIMATION: a 12-frame sequence played once and then HELD on the final frame. The character
stands at the edge of a crevasse, trembles nervously, then lowers its head to look down
into it.

FRAMES:
1  standing square on four feet, neutral, matching the end of a skid
2  small fast tremble: body shivering, ears rattling, weight shifting between feet
3  tremble continuing, shifted the other way
4  larger tremble, head shaking, trunk swinging loosely
5  largest tremble
6  tremble easing, head beginning to lower
7  tremble almost gone, head lower
8  head dipping, eyes tracking downward
9  neck lowering further, trunk hanging down
10 leaning over the edge, front feet planted at the lip
11 almost there, ears forward, trunk reaching down
12 FINAL HELD POSE: head low, looking down, trunk hanging, ears forward, feet square. The
   expression is concerned and curious, NOT frightened or distressed — the player should
   want to help, not feel the character is suffering. This pose stays on screen for
   minutes, so it must be still, balanced, appealing and exactly on the baseline.

Do not make this sequence loop. It plays once and stops on frame 12.
```

### HURT / KNOCKOUT

```
[shared preamble, N = 10]

ANIMATION: a 10-frame comedy knockout, played once and held on the final frame. The
character runs into a rock and sits down hard. It must be funny and harmless, never
upsetting — this is a game for young children.

FRAMES:
1  impact: body stopped dead, head snapped back, eyes shut tight, everything compressed
   forward
2  rebounding backward off the obstacle, feet leaving the ground
3  tipping over backward, legs flailing forward, trunk thrown up
4  falling backward, hindquarters dropping first
5  rear hits the ground hard, front legs up in the air
6  sprawling: sitting down heavily, front legs splayed, body bouncing
7  settling, head wobbling, ears flopped down
8  sitting, dazed, head lolling to one side
9  head rolling, eyes unfocused
10 FINAL HELD POSE: sat down on the ground, dazed but completely unhurt, eyes half-lidded
   or crossed, ears down, trunk drooping, one front leg out to the side. Comic and
   endearing

DO NOT draw dizzy stars, birds, spirals or any floating symbols around the head — those are
added separately by the game.

IMPORTANT: from frame 5 to frame 10 the character is in contact with the ground, and that
contact point must sit on exactly the same baseline in all six frames.
```

### CELEBRATE

```
[shared preamble, N = 8]

ANIMATION: an 8-frame celebration, looping. The character is delighted and trumpets with
its trunk raised while doing a happy hop.

FRAMES:
1  anticipation crouch, head coming up, eyes bright, trunk beginning to lift
2  pushing off, front feet leaving the ground, trunk curling upward
3  airborne, legs tucked, trunk raised high in a trumpeting curl, mouth open, ears up
4  peak of the hop, fullest trumpet, body arched back slightly, tail up, happiest expression
5  descending, trunk still raised, legs reaching down
6  landing, legs compressing, trunk starting to lower
7  rebounding into a second smaller hop, head still high
8  settling onto four feet, delighted expression held, resolving into frame 1

The raised trumpeting trunk is the point of this animation — it must read as trumpeting
with joy, not merely as jumping.
```

### IDLE

```
[shared preamble, N = 6]

ANIMATION: a 6-frame idle breathing loop, very subtle. The character stands still and alive.

FRAMES:
1  standing square on four feet, neutral, breathing in
2  chest at its fullest, head marginally higher, ears settled
3  breathing out, head easing down, fur settling
4  lowest point of the breath, trunk swaying slightly to one side
5  trunk swaying back, one ear flicking
6  a blink, returning to neutral and resolving into frame 1

The amplitude must be very small — no more than about 8 pixels of vertical movement across
the whole loop. This is the character being alive, not the character doing something. All
six frames sit on exactly the same baseline.
```

---

## 8b. What the delivered art covers — and the three states it does not

The character is **three animated GIFs**, and only those. The earlier generated grids
(a 20-frame run, a 14-frame jump, a 15-frame skid, a 24-frame shiver and an 18-frame
knockout) were removed on request.

| slot | source | delivered | used | notes |
|---|---|---|---|---|
| run | `sprite-…-6.gif` | 36 | 36 | all of it. The cycle is distance-driven, so more frames is simply smoother |
| jump | `sprite-…-6-2.gif` | 36 | 10 | the engine addresses this sheet BY NAME. The ten are picked off the MEASURED arc — see below |
| skid | `sprite-…-6-3.gif` | 36 | 36 | all of it; mapped across a 0–1 deceleration progress, so any count works |

### The pipeline

```bash
node tools/gif-to-grid.mjs <gif under assets/GIF> <name under assets/char>
node tools/slice-char.mjs --contact
```

`gif-to-grid` composites the animation into a padded grid and **pre-scales it to match
the other sheets** — measured on the square root of the opaque area, because a GIF from
one tool has no idea how big the character is in a sheet from another. `slice-char` then
finds the frames, aligns every one on its foot line, and prints the `frames` block and
the `baseGap` to put in the engine. **Take `baseGap` from its output every time** — the
shared scale is derived from the whole set, so removing a sheet moves the foot row.

### Cadence, and why it is not fps

The run's speed comes from `stride`, not a frame rate: the frame is `runDist / stride`,
so stride is the world distance one cycle covers. The GIFs are authored at 60 ms a
frame, so 36 frames is 2.16 s — at the default 520 px/s that is **1120 px**, and that is
what `stride` is set to. At 540 the same cycle ran at 35 fps and looked
fast-forwarded. Measured in the browser: 16.7 fps, which is the authored rate exactly.

The skid is not distance-driven; it is mapped across the stop. So `timing.breakSkid` is
**2300 ms** (140 ms of anticipation plus 2160 ms of slide) for the same reason.

### Footfalls are measured, not assumed

The run is a **quadruped gait with four footfalls per cycle**, at frames **3, 11, 21 and
30** — read off the sliced sheet as the frames whose foot line is deepest, and stored as
`contacts` on the character. The engine used to assume two, at frame 0 and the halfway
frame, so the snow crunches fired whether or not a foot was down.

### The jump's ten poses, picked off the arc

Every frame's foot line was measured. The delivered animation is two hops — a small one
around frames 7–15 and the real one at 16–23 — then nineteen grounded frames.

| pose | frame | why |
|---|---|---|
| idle | 32 | a settled grounded frame |
| crouch | 25 | the most compressed grounded frame, 174 px tall |
| launch | 16 | the foot leaving the ground, foot line 252 |
| rise | 17 | climbing, 211 |
| apex | 19 | the highest frame in the sheet, 192 |
| fall | 21 | past the top, 208 |
| preLand | 22 | coming down, 236 |
| land | 24 | grounded and compressed, 183 px tall |
| absorb | 27 | rising out of the compression |
| alert | 14 | the tallest grounded pose, used for SURPRISED |

### THE THREE STATES WITH NO ART

`SHAKE`, `LOOK_DOWN`, `KNOCKOUT` and `HURT` have no sheet of their own any more and
fall back to jump poses. Verified in the browser, nothing resolves to a missing frame:

| state | falls back to | how it reads |
|---|---|---|
| SHAKE | jump `alert` | no tremble; it settles straight into the look |
| LOOK_DOWN | jump `idle` | a standing mammoth, held for as long as the puzzle takes. Deliberately `idle` and not `alert` — a startled face held for minutes reads as a hung game |
| KNOCKOUT | jump `alert` | no sit-down, no dizzy stars (`koStars` is off) |
| HURT | jump `alert` | a wince with no wince art |

**These are the biggest remaining gaps**, along with CELEBRATE and IDLE (§6, §7), which
are still improvised from jump frames. LOOK_DOWN is on screen for the whole of every
puzzle and CELEBRATE plays after every one of the seven repairs, so those two are worth
art first. Deliver a GIF for either and put its entry back in `slice-char.mjs`'s
`SHEETS` and in the character's `sheets` / `frames`.

---

## 9. FX sheets

Separate from the character, so the game can scale, tint, time and omit them
independently — and so an effect can never eat into the character's crop safety.

| Sheet | Frames | Cell | Layout | Notes |
|---|---|---|---|---|
| `fx-snow-puff` | 6 | 160 × 96 | 1 × 6 | Low wide scatter. Run contacts, landings, celebrate hops |
| `fx-skid-spray` | 8 | 320 × 120 | 1 × 8 | Long plume streaming behind. Grows to frame 4, thins after |
| `fx-impact` | 5 | 200 × 200 | 1 × 5 | Radial lines plus angular ice chips. Knockout frame 1 |
| `fx-speed-lines` | 4 | 240 × 110 | 1 × 4 | Behind the body during fast running |
| `fx-sparkle` | 6 | 180 × 180 | 1 × 6 | Frost glint. Celebrate frame 4, and the repair sealing |

The game already draws snow puffs, ice chips, frost and splashes procedurally. These sheets
would replace those only where the drawn version is better — they are not required for the
game to work, and a procedural puff that costs nothing is not worth replacing with a blit
unless it looks materially better.

---

## 10. Delivery checklist

Before a sheet is accepted:

- [ ] Sheet width is exactly `420 × frame count`; height exactly `320`
- [ ] Frame count matches `frames` in the character definition
- [ ] Every frame's FEET sit 54 px above the cell bottom, **or** the variation is the
      intentional bob of a locomotion sheet. The slicer does this; check its report
- [ ] Grounded frames within a sheet share one contact line
- [ ] Nothing touches a cell edge in any frame
- [ ] Facing right, strict profile, in every frame
- [ ] Character scale identical across the sheet, and across sheets
- [ ] Background fully transparent, no stray pixels between cells
- [ ] No frame carries a fragment of a neighbouring frame — check the gutters
- [ ] The knockout's stars match the `koStars` flag — baked in means the flag is off
- [ ] First and last frames of a looping sheet resolve into each other

The last two are not hypothetical. Neighbouring frames touching in the source once meant a
crop dragged in a neighbour's paw, and 6,088 stray pixels had to be removed from one sheet
by connected-component isolation. `tests/assets.spec.mjs` now checks for both cropping and
stray fragments on every sheet.
