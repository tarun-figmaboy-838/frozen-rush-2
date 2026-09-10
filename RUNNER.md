# The Ice Age runner — context for writing a level brief

Everything you need to know to specify new levels for this game, and the things a brief
cannot ask for without changing the game itself. Written so a level spec can be checked
against it before any code is touched.

Open `game/index.html` through a server (`node tools/serve.mjs 8181` →
<http://127.0.0.1:8181/index.html>). It uses ES modules, so opening the file directly
shows a blank page — browsers refuse module imports over `file://`.

---

## 1. What the game is

A mammoth runs left-to-right across an ice shelf. The ice gives way, opening a crevasse
too wide to jump. Shapes made of glacier ice hang on ropes that come down out of a fog
bank, in a row centred over the hole. The learner **cuts a rope** — a swipe across it —
and the chunk falls. The right shape wedges into the crevasse and the ice grows out to
meet it, mending the path. The wrong shape falls past the lip into the meltwater and
splashes.

The learning is polygon recognition, and it is the mechanic: nothing is repaired unless
the right polygon is identified.

**Level 1 is seven of these crossings in a row** — the curriculum in §3.

**Level 2 is attached, and it asks a different question.** Level 1 asks *which* shape;
Level 2 asks *where to cut one*. One slab of ice is balanced on the pillar between two
crevasses and the learner drags corner to corner to halve it, one half for each hole.
It is specified in **§15**, and it was a parked draft up to version 2.0.0 — see the note
there on what changed when it was brought back.

---

## 2. The run of play

```
RUN_SEGMENT_1 → JUMP_CHALLENGE_1 → POST_JUMP_RUN_1 → GLACIER_BREAK_1
   → PHASE_INTRO → PHASE_ACTIVE → PHASE_SUCCESS → PHASE_DONE
   → PHASE_RUN → GLACIER_BREAK_1 → … (seven times) → FINAL_RUN → COMPLETE
```

- **GLACIER_BREAK_1** — the ground cracks, the character skids to a halt, the screen
  shakes on a band-limited rumble, and the crevasses open.
- **PHASE_INTRO** — the instruction card holds the stage **alone** for 2s. The chunks are
  held above the screen until it leaves. Then the ropes lower them in.
- **PHASE_ACTIVE** — playable. Cutting is the only input.
- **PHASE_WRONG** — a wrong cut. The chunk is thrown toward the water and splashes, the
  character reacts, a cross pops briefly over the crossing, and the phase stays open.
- **PHASE_SUCCESS** — a correct cut. The chunk wedges into a repair slot. If the phase
  still wants more shapes it goes straight back to PHASE_ACTIVE; the plug stays in,
  visibly accepted, and the snow that seals the crossing waits.
- **PHASE_DONE** — the last shape the phase wanted is in. The crossings bridge, snow
  settles over the joins, the character celebrates, and the run resumes.

A wrong answer never removes the correct chunk and never ends the phase. Three failed
jump attempts crumble the rock so the run can never dead-end.

---

## 3. The level data — where a brief lands

All of it is in `CFG.levelOne` in [game/js/engine.js](game/js/engine.js). One phase per
crossing:

```js
{ id: 6, ditches: 1, options: 5,
  targets: ['regularPentagon', 'irregularConvexPentagon', 'concavePentagon'],
  distractors: ['irregularHexagon', 'regularQuadrilateral'],
  rotate: 8, swing: 0.04,
  instruction: 'Cut all the pentagons.' }
```

| field | meaning |
|---|---|
| `id` | 1-based. Also what `jumpBefore` refers to. |
| `ditches` | how many crevasses open. 1 or 2 — two is the most a 1920 stage can hold (see §6). Two are narrower (`gapWMulti` 415). Clamped to `targets.length` — a crevasse with no slot could never be mended. Phases 6 and 7 use 2, which also **widens the option row** and so makes the shapes bigger: a six-option chunk goes from 127px to 142px, because the row is centred on the crevasse group. |
| `options` | how many chunks hang. 3, 5 and 6 are all in use. Must equal `targets.length + distractors.length` to use them all. |
| `targets` | every shape the phase wants, as an internal geometry id. **One entry per answer**, not one per ditch. |
| `distractors` | the wrong shapes hanging alongside. |
| `rotate` | degrees of tilt on the hanging chunks. **0 in every phase now** — the options were required to hang perfectly square and still (2026-09-04). The field and the renderer support it, so a brief can set it again, but be aware it is currently switched off everywhere on purpose. |
| `irregular` | 0–0.16 radial jitter. Legacy, for the basic shapes only: it is **ignored** for a verified geometry, because jitter on a shape built to be concave or specifically irregular would break the property it exists to show. |
| `tutorial` | shows the swipe-to-cut demonstration between two ropes. Phase 1 only. |
| `swing` | how much the chunks sway on their ropes. **0 in every phase; `rigSwing()` is a shared ±1.3° breath and the rope itself bows (see "The tied rope")** — the sway, the arrival bounce and the missed-swipe jiggle were all removed together (2026-09-04): the options are the question being asked and a question should hold still while it is read. Setting this in a brief will not reintroduce motion without also changing `rigSwing()`. |
| `instruction` | the sentence. **The only learner-facing text in a phase.** |

Two lists must stay the same length as `phases`:

```js
jumpBefore: [2, 5],                                             // phase ids that get a rock to clear
runMs: [7500, 8500, 8000, 9000, 8000, 9000, 8500]               // ms of running before each phase
```

### The curriculum as it stands

| # | instruction | answers | distractors |
|---|---|---|---|
| 1 | Cut the triangle. | regularTriangle | regularPentagon, regularHexagon |
| 2 | Cut the quadrilateral. | regularQuadrilateral | regularTriangle, regularPentagon |
| 3 | Cut the pentagon. | regularPentagon | regularTriangle, regularOctagon |
| 4 | Cut the hexagon. | irregularConvexHexagon | regularPentagon, regularHeptagon |
| 5 | Cut the heptagon. | concaveHeptagon | irregularConvexHexagon, irregularConvexOctagon |
| 6 | Cut all the pentagons. | regularPentagon, irregularConvexPentagon, concavePentagon | irregularHexagon, regularQuadrilateral |
| 7 | Cut all the hexagons. | irregularConvexHexagon, concaveHexagon, regularHexagon | concaveHeptagon, irregularPentagon, regularOctagon |

The rule being taught is **the number of sides**, and nothing else. 4 asks for a hexagon
that is irregular, 5 for a heptagon that is concave, and 6 and 7 ask for every pentagon
and every hexagon across regular, irregular-convex and concave examples. A brief must not
make regularity or convexity the property that decides.

> **Three phases used to break that rule and have been fixed.** Audited and corrected
> 2026-09-04, one distractor swapped per phase, every instruction untouched:
>
> | phase | the shortcut that used to work | the swap that closed it |
> |---|---|---|
> | 4 | the target was the **only irregular shape** in the row — "cut the wonky one" | `regularPentagon` → `irregularPentagon` |
> | 5 | the target was the **only concave shape** in the row — "cut the dented one" | `irregularConvexHexagon` → `concaveHexagon` |
> | 6 | one of the three targets was the only concave shape, giving 1 of 3 away free | `irregularHexagon` → `concaveHexagon` |
>
> Phases 4 and 5 are the two that introduce irregular and concave shapes, so those
> shortcuts were defeating the exact lesson each phase exists to teach.
>
> **All seven phases now verify clean**: for every phase, neither regularity nor
> convexity separates the targets from the distractors, and no target is the only shape
> in its row with a given property. Only the side count decides. If you change a
> distractor, re-check that — it is easy to reintroduce by accident, and nothing in the
> suite catches it.

### How many answers is not how many holes
A phase wants `targets.length` shapes and opens `ditches` crevasses, and the two are
independent. Each crevasse is divided into as many equal **repair slots** as its share of
the answers — three answers across two crevasses gives slot counts of 2 and 1 — and a
crevasse is only mended once every slot in it is plugged. A brief asking for three answers
therefore does **not** get three crevasses.

### Any slot takes any wanted shape
The phase wants a **set** of shapes, not an assignment: a correct cut takes whichever free
slot is nearest it. Do not write a brief that says "the pentagon goes in the left gap" —
that was removed deliberately, because it made the learner guess an allocation nobody had
told them, on top of the recognition being taught.

A correct cut can never be scored twice, a wrong cut removes nothing but itself, and while
any answer remains at least one slot is still open water — so a wrong chunk always has
somewhere to splash and can never land on the crossing.

### The instruction card
One sentence, big and centred, popping in. Nothing else is on it: there is no drawn
polygon beside the words any more (it was removed on request), no "to fill the shape", no
"One more gap!", no count of what is left, and no second line. The card holds the stage
alone for 2s before any chunk descends, and then STAYS UP for the whole playable phase —
it used to slide away, which meant the one thing naming the shape was gone by the time
the learner was looking. There is no hint button any more, so nothing else can summon
it; it does not need to, because it never leaves.

Because the words now carry the whole instruction, how big they are is a functional
requirement, and a test guards it: the sentence must be more than 3% of the stage height.

The sentence names the **class**, never the answer, and a test enforces that too — it may
not contain "regular", "irregular", "convex", "concave" or "sides". Phase 4 says "hexagon"
while the answer is an irregular one; phase 5 says "heptagon" while the answer is concave.
Saying so would remove the thing the learner is meant to work out.

---

## 4. What shapes are available

### The verified registry — where a brief should get its shapes
[game/js/polygons.js](game/js/polygons.js) holds **fourteen verified geometries**, and it
is the authority. `PolygonFactory` in `engine.js` asks it for vertices by name, so there
is exactly one definition of each and the runner holds no copy:

```
regularTriangle 3 · regularQuadrilateral 4 · regularPentagon 5 · regularHexagon 6
regularHeptagon 7 · regularOctagon 8
irregularPentagon 5 · irregularConvexPentagon 5 · irregularHexagon 6
irregularConvexHexagon 6 · irregularConvexOctagon 8
concavePentagon 5 · concaveHexagon 6 · concaveHeptagon 7
```

Heptagons, octagons, irregular-convex and concave shapes all work. Name one of these in a
brief and it needs no engine work.

`verify()` checks every one: vertex count against its metadata, that a convex shape's
corners all turn the same way and a concave one's do not, no self-crossing sides, no
near-collinear corner (which would make two sides read as one), no side under 16% of the
longest, and that "regular" shapes really do have equal sides while "irregular" ones
really do not. It reports zero problems, and a test runs it.

Chunks are fitted into the option row **uniformly**, so a regular polygon keeps equal
sides and nothing is ever stretched to fill a box.

### Also still there: the basic factory
`PolygonFactory`'s own switch still builds these by name, for visual variation rather
than for the curriculum:

```
triangle 3 · square 4 · rectangle 4 · quadrilateral 4 · trapezoid 4 · pentagon 5 · hexagon 6
```

All convex, all stretched to their box, and `irregular` jitters them. Prefer the verified
names in a brief: these are the demo shapes, and `triangle` and `regularTriangle` are not
the same geometry.

### Names are labels; ids are geometry
A brief may say "regular convex pentagon" — that is a regular pentagon, which is convex by
definition, and it maps onto `regularPentagon`. "Octagon" and "Quadrilateral" with no
qualifier map onto `regularOctagon` and `regularQuadrilateral`. `CANONICAL` in
`polygons.js` holds those aliases. Do not create a second geometry because the wording
differs.

### One constraint on shape choice
A wedged chunk grows until its longest edge spans its slot, then is clipped to it. A shape
whose longest edge is short relative to its width (a regular hexagon, say) has to grow a
long way to seal the gap. It still works, but a brief that mixes very different aspect
ratios in one phase will produce plugs of visibly different depths.

### Where the options hang, and how big they end up
The row is **centred on the crevasse group** — the options hang over the hole they are
going into — and it is symmetric, so it is only as wide as the narrower of its two sides
allows. The left side always binds: no part of a chunk may be left of x 770
(`mammothX + clearOfPlayer`), because a cut chunk travels toward the crevasse and one
that hung over the character dropped ice on its head.

So more options makes the shapes smaller, never the margin thinner. Measured, at the sizes
the game actually draws:

Re-measured off the running game at `clearance` 470. The row is centred on the crevasse
GROUP, so a two-crevasse phase has a wider group, a wider row and therefore bigger
shapes — which is a large part of why phases 6 and 7 open two:

| options | crevasses | row spans | chunk |
|---|---|---|---|
| 3 | 1, centred on 1210 | 780–1640 | 273 × 232–272 |
| 5 | 2, spanning 900–1850 | 890–1860 | 174 |
| 6 | 2, spanning 900–1850 | 890–1860 | 142 |

(Phases 1–5 open one crevasse and all use 3 options. 6 uses 5 options, 7 uses 6.)

The height range is the spread across the shapes in that phase: a chunk is fitted
UNIFORMLY, so width binds and the height follows each shape's own proportions.

Six is the practical limit at this stage width if the sides are to stay countable, and at
a phone-landscape size a six-option row is genuinely small: the stage is 693px wide there,
so a 138px chunk lands at about 50px on screen, and telling six sides from seven at that
size is hard. Three- and five-option phases are comfortable.

---

## 5. What is on screen, and what is not

**Present:** the character, the ice path, the crevasse and its meltwater, the ropes coming
out of the fog, the hanging chunks and the instruction card. That is the whole interface —
there is no control of any kind on the stage.

**Removed deliberately — do not ask for these back without saying so:**
- the character-select screen (one explorer now: the mammoth)
- the phase-progress diamonds
- any second instruction line during a phase
- **the JUMP button.** A tap anywhere already jumped, so the button was a second way to
  do one thing, and on a phone it was a corner target competing with the one instruction
  that matters. Gone from the markup, the stylesheet and the HUD, along with its pressed
  art, its tap ring, `hud.flashJump()` and `G.jumpPulse`. The tutorial's fourth line
  teaches the control with a hand tapping open sky; Space / ↑ / W still jump.
- **the three round icon buttons top-right (hint / sound / pause).** Gone from the
  markup. So there is no in-game mute, no pause, and no way to bring the instruction
  card back: sound and motion can only be set from the URL (`?sound=0`, `?reduced=1`).
  The pause panel is still in `index.html` and still wired, but nothing opens it.

**No score, no lives, no stars, no timer, no level number.**

---

## 6. Fixed things a brief should not fight

| | |
|---|---|
| Stage | 1920×1080 backbuffer, 16:9, letterboxed. `surfaceY` (the walking line) is **840** — raised from 890 so the crevasse is deep enough to hold a correct shape at the size it was cut. See §10. |
| Below the shelf | open water, from where the path art's painted content ends (y 1033) to the bottom of the stage. Raising the walking line left a 47px band of flat background there; the alternative was scaling the path art 24% larger, which thickens the delivered rock strata. The world is an ice shelf over meltwater — every crevasse has a pool at the bottom — so the sea is what those pools are pools *of*. |
| Above | a fog bank across the top ~195px (`rigY × 1.3`). There is no ice shelf and no icicle fringe any more; the ropes run off the top of the frame and the fog is what they come out of. It takes the sky's own colour, so it can never be a white bank over a violet dusk. |
| Crevasse | 620px wide for one, **415px each for two, 120px** of ice between them. Phases 6 and 7 open two; 1–5 open one. Those numbers are the largest that fit: each crevasse must clear 400px or a jump carries it, the near lip must be 630px past the character, and the far lip must stay on a 1920 stage. **Three do not fit** — even at the minimum, 3 × 405 + 2 × 110 puts the far lip at 2065. |
| Chunks | hang at y 470 from a rig at y 150, in a row centred on the crevasse. No part of one may be left of x 770 (`mammothX + clearOfPlayer`). |
| Crevasse position | `clearance` (**470**) puts the near lip that far past the character, which is also what leaves room for a centred row. It was 340; pushing it right widens the option row on both sides, because the row is symmetric about the crevasse and cannot reach left of x 770. The character's cell is drawn 735px wide (420 × 1.75), so its right edge is near x 795 and the near lip is a clear ~100px beyond it. |
| Cut | a swipe across a **rope**, not across the shape. The rope is really severed and the stub stays cut. |
| Gameplay numbers | speed, gravity, jump and collider are global, not per character, so no explorer is easier to play than another. |
| Assets | WebP. Sprites near-lossless, skies lossy. Sheets are horizontal strips of 420×320 cells. |
| Opening it | `game/index.html` works **either way**: over http:// it loads the ES modules in `game/js`, and opened straight off the disk it loads `game/js/game.bundle.js` instead, because a browser fetches a module with CORS even from a file:// page. The bundle is generated (`node tools/build-bundle.mjs`) and a test fails if it has drifted. file:// runs with no music and the synthesised sound palette; nothing else differs. |

**Getting past a beat:** a tap (or Space / ↑ / W) skips the rest of the **collapse** and
the instruction card's **read-hold**. Measured, that takes a puzzle's pre-roll from 5.6s
to 1.3s, and over seven puzzles it is about 30 seconds of a five-minute game. The collapse
still happens — the clock jumps to its final frame, so the crevasses open, the character
lands where the layout expects and the fright still fires; what is skipped is the
watching, not the event. The card does not go away either: it stays up for the whole
playable phase, so a learner who wants to read it still can.

Deliberately **not** skippable: the run segments (they are the journey) and the wrong and
success beats (they are the feedback — a splash cut short teaches nothing).

**Playtest flags:** `?skip=1` straight into the run, `?sound=0`, `?reduced=1`,
`?speed=300–900`, `?fast=1–8` (steps the simulation N times per rendered frame — same
physics, less wall clock; the only way to reach phase 6 quickly).

---

## 7. What the tests will hold you to

`npx playwright test` — the suite runs every spec at two sizes, desktop 1920×1080 and
phone-landscape 844×390. A level brief has to survive these:

- all seven phases complete, and complete again with a wrong answer in every phase
- a multi-answer phase stays open until every one of its shapes has been cut, in any
  order, and one answer can never be counted twice
- every verified geometry has the side count, convexity and regularity it claims, and
  fitting, seating and rotating a chunk never changes any of them
- no hanging option can drop on the character
- the crevasse is far too wide to jump, and centred
- the instruction NAMES the class and never the answer: a test rejects the words
  "regular", "irregular", "convex", "concave" and "sides" in the sentence, and another
  requires it to be more than 3% of the stage height, because the words now carry the
  whole instruction
- the card owns the stage alone during PHASE_INTRO and then stays up for the whole
  playable phase, and never swallows a cut
- a correct answer pops a tick and a wrong one pops a cross, over the crossing
- the interface stays under 12% of the screen
- every sprite sheet is 420×320 per cell, no frame clipped, no stray fragment, one size
  across every animation
- the whole art set stays under 12MB
- the quake is a rumble, not per-frame noise — measured on the offset the renderer
  applies, normalised to 60fps so it tests the waveform and not the host's frame rate
- `game/index.html` loads and plays when opened straight off the disk, with no console
  errors, and `game/js/game.bundle.js` still matches the modules it was built from

If a new level count is not 7, `runMs` needs updating with it and `jumpBefore` needs
checking against the surviving phase ids. The tests read the phase count from the module
rather than hard-coding it, but the two "all seven phases" assertions name the number.

---

## 8. Writing the brief

Most useful to state, per level:

1. the instruction sentence, exactly as it should read
2. the target shape(s) — and whether they are regular, irregular or concave
3. the distractor shapes
4. how many crevasses
5. whether the chunks are tilted (`rotate`) or irregular (`irregular`)

Worth deciding up front:

- **Heptagons, octagons, irregular-convex or concave shapes?** All available — name them
  from the verified registry in §4. No engine work needed.
- **Does the instruction wording change?** It currently reads "Cut the pentagon." and
  "Cut all the pentagons." — words only, no glyph. Keep it to naming the class.
- **Several answers in one phase?** Supported: put them all in `targets`, keep `ditches`
  at 1 or 2, and the repair slots are shared out. Say how many options should hang.
- **How many levels?** Seven today. A different number is fine; `runMs` moves with it.

---

## 9. The comedy layer

A brief does not have to ask for any of this and cannot break it, but it is worth
knowing it is there — it is what makes the game feel alive between the polygons, and it
is all **procedural**, so it costs no art and moves with whatever sheets exist.

Everything is tuned from one block, `CFG.comedy` in
[game/js/engine.js](game/js/engine.js).

**The fright at the crevasse.** The headline beat. The mammoth skids to a halt, and
then:

1. a **shudder** — a knock-kneed sideways tremble at 9.5Hz with a nervous roll and a
   jelly squash, all off one amplitude that decays over 1.35s;
2. a **double take** — he recoils 26px off the lip, then leans 15px in to peer down;
3. a **gulp** every 2.3s for as long as he is over the hole, so a long think never
   reads as a hung game;
4. **sweat beads** flicked off his head while he is genuinely rattled.

It is animated on top of whatever frame is showing, because the shake sheet was removed
and `SHAKE` had no art of its own — and, before this, no duration either: it exited on
its first frame, so there was no reaction to the hole at all.

**Every touch is answered.** A ring expands from wherever the player put their finger,
in every state. A swipe that crosses no rope gets a puff of air — before, a missed swipe
was completely silent, which is indistinguishable from a broken game.

The options themselves do **not** move for it. A jiggle on the nearby ropes was tried
and removed along with the sway and the arrival bounce: the hanging blocks hold
perfectly still, because they are the question and a question should not move while it
is being read. What says "these are interactive" is the warm halo and the sheen sweeping
across the ice — light rather than movement, so it never disturbs the silhouette.

**He is touchable.** Tap the mammoth and he toots, bounces and kicks up snow. It changes
no state, no progress and no answer, and it is refused while he is mid-air or knocked
out.

**The reward.** A correct chunk seating throws a ring of glints and a chime on top of
the thud, so "that was right" and "something heavy landed" are different messages. A
mended crossing throws a bigger burst over his head; so does the end of the journey.

**Weight.** The jump stretches and the landing squashes, with the horizontal scale taken
as the inverse square root so volume is preserved — the same numbers now read as impact
rather than as the sprite being resized.

Two rules this layer holds to, and a brief can rely on:

- **It never touches gameplay.** All of it is in the draw transform and the particle
  layer. The collider is a fixed box around `mammothX`, the jump physics are global, and
  the cut hit test is against the rope — a wobble cannot make a learner miss.
- **It never leaks an answer.** Anything that reacts to the pointer reacts uniformly
  across every option, wanted or not.

`?reduced=1` (and the OS reduced-motion setting) scales all of it down.

### 9e. The first-play tutorial

Added 2026-09-04. `game/js/tutorial.js`, a DOM layer driven from `main.js` on its own
animation frame — not from `onHud`, which fires from the engine's update, which the
tutorial *pauses*: driving it from there would stop it dead on its first step.

**Two kinds of step, and the difference decides everything else.**

| | describing | asking |
|---|---|---|
| `advance` | a number of seconds | the name of an action |
| the game | frozen | running |
| the blur sheet | on | off |
| the hand | none | on the control, tapping or sweeping |
| the box | stays for the whole step | leaves after 2.4s |
| ends when | it has been read | the player does the thing |

The order is: name the mammoth · name the rock (frozen, so it can be looked at) · name
the JUMP button · **ask for a jump** · name the crevasse · name the blocks · **ask for a
cut**. Naming a thing before asking for it is the whole pattern; the button was once the
one place it was skipped, and the control was never introduced at all.

**Reading time comes from the sentence**, not a constant: `1.5s + 55ms/char`, clamped
2.6–5.2s. **There is no tap-to-advance** — a child taps because a finger is on the screen,
not to dismiss text, so honouring it would skip the instruction they were about to read.
Skip is the deliberate way out and it is a button.

**The highlight is a blur sheet with the focus lifted over it**, never a spotlight. Three
constructions were tried and rejected, and they are recorded because each looks more
reasonable than the one that replaced it:

1. a lit circle with a gold ring — an outline is a hard line drawn ON the artwork
2. a masked hole in the blur — needs the hole kept in step with a moving target, its rim
   inflated to keep the subject out of the blur, and its polarity is inverted from how it
   reads; all of that to arrive back at a lit circle
3. a rounded rectangle with a white hairline — a square stuck on the scene

What ships: a 30% sheet with a light blur over the whole stage, and the focus region
copied off the canvas and drawn on top with a long feather and no outline of any kind. A
DOM target (the JUMP button) is *raised* instead — `.tut-lift` — because copying its
region would lift a snapshot of the empty sky behind it and hide the control.

**The copy is taken once per step**, which is safe rather than lucky: every step that
shows the sheet has frozen the game. Per-frame would mean reading back from the canvas
sixty times a second.

**It runs every time.** A stored "seen" flag was removed: once set, the tutorial was
invisible with no way back to it from inside the game — a returning player, a second
child on the same browser, or anyone reviewing the build got dropped straight into
gameplay, and the feature was untestable by hand. `?tutorial=0` suppresses it, which is
what the suite passes.

**Rules.** It never completes the task, never blocks the input it asks for
(`pointer-events: none` on the layer throughout), and never leaks an answer — the block
step spotlights the whole row and its wording is about ropes and blocks, never about
which shape fits.

---

### 9f. The ending

The last crossing leads into `FINAL_RUN`, which now ends **where the friend stands**
rather than on a progress number, so the journey finishes somewhere instead of at an
arbitrary moment.

- `G.bearAt` is set **once**, in `onEnter`. Assigning it in the update branch is a
  treadmill: the target is recomputed from the current `worldX` every frame, stays a
  fixed distance ahead forever, and the run home never ends.
- The arrival gap is `CFG.mammothX + 265`. At 330 the bear ended up at screen x 327
  against a character standing at 430 — he had run past his own friend.
- `particles.confetti` throws 90 pieces across the whole width from above the frame,
  staggered by `delay` so it falls as a shower rather than one sheet. Each piece tumbles
  by squeezing its width on a cosine, the same trick the reward token used.
- The panel is **not a modal**: `.overlay-ending` clears the 42% navy wash and the 3px
  backdrop blur that `.overlay` gives every other panel. The ending exists to show the
  two of them together — dimming and blurring that is hiding the reward in order to
  announce it. Words at the top, `Play again` pinned to the bottom, middle band clear.

---

### 9g. Difficulty

**The jump.** The old window was about 0.2s: the apex was 295px and the bar 45% of a
140px rock, so the character was clear for 0.79s of a 0.887s flight — but the rock
crosses the danger zone in ~0.58s, and the difference is all the margin there was. Four
terms were loosened rather than one of them a lot:

| | was | now |
|---|---|---|
| `jumpVel` | −1330 (apex 295, air 0.887s) | −1470 (apex 360, air 0.98s) |
| clearance bar | 45% of rock height | 28% |
| body half-width | 68 | 52 |
| `bufferMs` / `coyoteMs` | 110 / 90 | 190 / 150 |

Measured after: **0.35s** of press window, from 330px out to 150px out.

**The rocks.** `jumpBefore` names six phases, and the count runs 2, 3, 4 then holds at
`maxRocks`. It is derived from `jumpBefore.indexOf(p.id)`, **not** counted up as
stretches happen: a counter inflates on a retry, because `retryObstacle()` returns to
`PHASE_RUN` and re-entering clears `phaseJumped` so the stretch spawns again — measured
going 1, 2, 3, 4 inside a single phase, which made failing a jump harder than the attempt
that had just beaten you.

---

### 9h. The phase zoom

`CFG.levelOne.zoomK` is 1.08, eased in on `PHASE_INTRO` and out when running resumes.

**The scale is the largest that keeps the puzzle on the stage, and the focus point is
solved rather than chosen.** Scaling by k about f maps p to `f + (p − f)k`, so everything
further from f than the frame edge moves out of frame. Rearranging that for the rightmost
block, the character and the water gives a permitted range for f, and the crossing centre
is clamped into it — see `viewFocus()`. Picking a nice-looking focus and scale instead is
what silently clips the sixth option in a six-option phase.

**Every DOM overlay must map through the published transform.** `view: {k, x, y}` goes out
on the HUD state, and `Hud.toView` and `Tutorial.toView` apply it. The verdict mark and
the hand hint are placed in stage coordinates over the crossing — the thing the zoom moves
furthest — and unmapped they drift off it. The tutorial maps only its **canvas-space**
targets: the JUMP button's box comes from a real DOM rect and is already in screen space,
so mapping it would move the one target that was right.

---

### 9d. The delivered character sheets

Reworked 2026-09-04. Four animations were delivered as 36-frame GIFs and the character
is now drawn from art in every state that matters, rather than from poses borrowed out
of the jump sheet.

| slot | what it is | where it plays |
|---|---|---|
| `run` | 36-frame cycle | distance-driven, `stride` sets the cadence |
| `jump` | 10 poses picked off the measured arc | `jumpMap` addresses them by name |
| `skid` | **new** | `SKID_STOP`, mapped across `breakSkid` (2300ms = its own 36 x 60ms) |
| `shake` | **new** | `SHAKE` at `tremorFps`, then `LOOK_DOWN` holds the final frame |
| `hurt` | **new** | `KNOCKOUT` and `HURT` |
| `idle` | **built, deliberately not loaded** | see below |

**One size, one foot line.** Every extent is measured across all sheets to pick ONE
scale, so the character cannot change size between animations, and every frame stands on
the same line — `slice-char.mjs` prints both and the `baseGap` it needs (27).

**No procedural shudder any more.** There used to be a sideways knock, a nervous roll
and a jelly squash applied on top of whatever frame was showing, plus a recoil-then-lean
double take. Its own comment said why it existed: *"because the fright has no art of its
own."* It has art now, and two performances of one beat fight rather than add — a sine
wave shoving the sprite sideways over a drawn reaction reads as the picture vibrating.
Removed. `scare` still decays and still drives the sweat beads and the gulp, which are
separate cues. The screen shake and the earthquake are camera moves, not character
animation, and are untouched.

**The idle sheet is held back on purpose.** `LOOK_DOWN` holds the last frame of the
delivered fright — the pose the character has just arrived at — and swapping that for a
neutral breathing loop discards the reaction the learner watched. It is also not listed
in `sheets`, because a listed sheet is fetched: 1.5MB on every load for something
nothing draws. To turn it on: add the line back, add `idle: 36` to `frames`, and
uncomment the branch in `LOOK_DOWN`.

**One grid per slot.** The superseded `skid-gif.png` was deleted rather than kept as a
previous take: two grids for one slot differing only by a suffix is how frames from two
deliveries end up merged into one sheet.

**Known trade: the knockout's outer star ring is clipped.** Keeping it needs a padded
frame box, and a padded box immediately becomes the largest frame in the set, so the one
shared scale collapses and the character comes out smaller in every other sheet too
(measured: body 74..303px became 107..250, `baseGap` 25 became 76). The dazed sit, the
spiral eyes and the inner stars survive, and `near: 200` on that sheet is what keeps
them. Fixing it properly means a larger cell for every sheet.

---

### 9b. The cartoon sound layer

Added 2026-09-04. Two new synth voices, and seven cues built on them. All synthesised —
nothing new to download, and the file:// build keeps every one of them.

| voice | what it does |
|---|---|
| `_warble(freq, dur, gain, type, slide, depth, rate)` | a second oscillator drives the first one's FREQUENCY, so the pitch itself shakes. This is what a boing is. |
| `_slide(from, to, dur, gain)` | a tone gliding between two pitches with a breath of noise tracking it — the noise is most of why it reads as a whistle rather than a synth sweep. |

| cue | where |
|---|---|
| `boing` / `boingDown` | under the delivered whoosh on take-off, under the delivered impact on landing |
| `sproing` | after `bonk` — it bounces off the rock |
| `skid` | the frame the feet start losing the fight at the edge |
| `slideDown` | a WRONG chunk beginning its fall |
| `bloop` | a chunk arriving on its rope (`pop` is now this) |
| `wobble` | folded into `gasp` — the knees going when the ground fails |

**The rule that decides where a comedy cue may fire.** It lands on the WORLD and on the
CHARACTER — jumps, bumps, wobbles, things falling in water — and **never on the learner
being wrong**. A sad trombone on a wrong answer is the obvious cartoon joke and it is the
one cue this game must not have: the child is the one who was wrong, and a laugh at that
moment is a laugh at them. `reject()` stays the soft two-note nudge it has always been,
and `slideDown` is a joke about a lump of ice belly-flopping, not about the answer.

**Layered, never substituted.** Every delivered recording still plays. `jump()` fires the
boing and then the whoosh, so the jump sounds like a heavy animal leaving the ground AND
like a cartoon. The one replacement is `pop` → `bloop`, both synthesised.

Measured live with the audio graph tapped: 28 cues, none silent, no errors; the music bed
running and looping.

---

### 9c. Sound off the disk

The game is meant to run by opening `index.html`, and until now that build had **no music
and none of the six delivered recordings** — silently, with nothing logged to say why.

Both came from the same assumption. `ctx.createMediaElementSource()` and
`fetch` + `decodeAudioData` genuinely do not work on a `file://` page, so both were
skipped there. But neither is required to play a sound: an `<audio>` element loading a
file next to the page plays perfectly well. The AudioContext was only ever there to give
the bed its own fader and to let a cue be sliced sample-accurately.

| | over `http://` | off the disk |
|---|---|---|
| music | routed through a gain node on the master bus | the element plays directly; `_musicTo()` steps `el.volume` instead |
| recordings | decoded once, sliced with `start(t, at, dur)` | one `<audio>` per cue, seeking to a baked hit, stopped on a timer |
| onsets | found at load from the waveform's energy | read from `SFX_HITS`, baked by `tools/bake-onsets.mjs` |

`SFX_HITS` sits between `/* BAKED-ONSETS-START */` and `/* BAKED-ONSETS-END */`.
Regenerate it whenever an audio file changes:

    node tools/bake-onsets.mjs && node tools/build-bundle.mjs

**One element per cue, not a pool.** Three elements pointed at one `src` start three
concurrent loads of the same file, and the browser resolves that by ABORTING the
redundant ones — a real failed request each time, which the disk-build test rightly
refuses to pass with. Overlap is worth little here: the cue that repeats quickly is
footsteps, which are sequential anyway.

**What the disk build gives up:** per-play pitch jitter (an element's `playbackRate`
shifts pitch, which is a different effect), sample-accurate scheduling, and overlapping
repeats. What it gains is the delivered sound instead of none.

Verified off the disk: music playing at 0.17, all six recordings seeking to their baked
hits, no page or console errors. Verified over http: all six still decoded and played
through the graph, unchanged.

---

### 9a. The impact layer — hit-stop, punch, tokens

Added 2026-09-04. The comedy layer above is about the CHARACTER; this is about what
happens to the frame in the ~150ms around an impact, which is where a platformer's
feel actually lives. Three primitives, all in `CFG.juice`:

| primitive | what it does | fires on |
|---|---|---|
| `hitStop(ms)` | stops the simulation dead, rendering continues | wedge 62ms · splash 44ms · rock 96ms · ice breaking 110ms |
| `punch(amp, ms, x, y)` | scale pulse about the impact point, snaps to full then eases out | wedge 1.8% · rock 2.6% · break 3.0% · crossing sealed 2.2% |
| `particles.ring` | one expanding hoop on the impact frame | every correct answer |

One new sound goes with them: `prize()`, a rising phrase ending held, when a whole
crossing closes. It is the only place it plays.

**No pickup tokens.** A spinning gold coin leaping out of each correct answer, with a
two-note pickup ding, was built and then removed on request. Recorded here so it is not
re-proposed: a collectable implies a score, a score implies a counter, and §5 says this
game has no HUD to put one in — and it placed the only warm-yellow object in the world
on top of the learner's answer at the moment the answer is the thing to look at. The
reward beat is the glints, the frost, the thud and the sound, all of which already
belong to the ice.

**Rules for this layer.**

- **`CFG.juice.stopMax` is a hard ceiling (130ms).** `hitStop` takes the max of the
  current hold and the new one and clamps — so no caller, and no two events landing on
  the same frame, can stall the game. A hold consumes real `dt`, so it always ends.
- **Hit-stop is not pause.** Pause halts rendering as well and is a player control;
  this halts only time. The gate is the first thing in `update()`.
- **Nothing here is allowed past 3%.** Beyond that the punch pulls the world in from
  the letterboxed frame edge and the border shows.
- **All of it is off under `?reduced=1`.** `hitStop` and `punch` return immediately;
  the rings are not spawned.
- **It never decides anything.** No hold, punch or ring is conditional on which shape
  was cut beyond right/wrong, and none of them is drawn on a hanging option.

---

## 10. How a mended crossing is built

Reworked 2026-09-04, because the previous construction destroyed the thing it was meant
to celebrate. Worth understanding before touching any of it: the crossing is the
learner's confirmation of what they cut, so if the shape is not recognisable in it the
puzzle has no payoff.

Top to bottom, per crevasse:

| layer | what it does |
|---|---|
| `drawCrossingSnow` | one unbroken white band over every join |
| `drawCrossingDeck` | lip to lip — the ice that actually spans the gap, scalloped underneath so it visibly rests on each keystone |
| `drawCrossingFill` | ice closing in from both lips, with each plug's outline **punched out of it**, inflated a few per cent |
| `drawKeystone` | the answers themselves — whole, unclipped, countable |

### The trap, so nobody walks back into it

The plug used to be scaled so its **bounding width filled its slot**, and then clipped to
the cavity. The cavity is only `waterDepth` (152px) deep, so a shape grown to a 620px slot
comes out about 500px tall — four fifths of it below the water line, and clipped away.
Measured on the shipped build: **phase 1's answer is a triangle and the finished crossing
showed a trapezoid.** Phase 6's three pentagons showed as three vertical slabs.

Sizing the plug to fit the cavity whole fixes that and introduces the opposite fault: a
small block dangling in a big dark hole with obvious dead space either side, which does
not read as *fitted*.

Neither the shape nor the hole can give — a uniform scale cannot fill a 620 × 152 slot
with a roughly square polygon. **So the ice does the filling.** That is what
`drawCrossingFill` is: it closes the cavity right up to the answer's edge and traces its
outline, which is also exactly the fiction the game already tells — *the right shape
wedges in and the ice grows out to meet it*.

### Rules for changing it

- Size the plug from the **cavity depth**, never from the slot width.
- Do not clip the plug's silhouette. Anything that crops it changes which shape the
  learner is shown.
- If a plug ever needs to be bigger, deepen `waterDepth` — do not grow past it.

## 11. The feedback round — what changed and why (September 2026)

Ten client items, worked in this order. Each is a rule now, not a preference.

### The pointer, and where to cut

- **The canvas shows an arrow, and the browser's own hand only over a rope that can be
  cut** (`main.js`, `.stage.on-rope`). A hand shown everywhere says nothing; the
  scissors cursor that preceded it was a DOM follower on its own rAF loop that touch
  players never saw. `cursor: pointer` is what every player already knows means "this
  does something".
- **The cut guide is thin gold dashes with a soft glow, 60 px above each block**
  (`drawCutGuide`). Same height as the tutorial hand (`Tutorial.ropeBox`), so hand and
  guide agree. Dashes with butt caps — round caps turned 17 px dashes into 28 px
  capsules. Gold because white was measured invisible against the sky. Every rope gets
  one, so the marks can never hint at the answer.

### The tutorial highlight

- **The subject glows along its own outline** — nothing behind it comes with it.
  `game.renderFocus(canvas, kind)` re-draws one subject alone (character, rock, gap or
  block row) onto `#tut-focus`, and the stylesheet glows that canvas by its alpha. Contact
  shadows, fog, halos and vapour are switched off for the focus render (`bare`/`only`
  flags) because each is a soft alpha shape that would glow as a shape. The JUMP button,
  a DOM element, is lifted (`.tut-lift`) and given the same glow. A copied rectangle of
  the game canvas was the previous construction and it brought the sky with it.
- **One hand on screen, ever.** `Hud.updateHand` yields to the tutorial hand whenever the
  tutorial layer has one up.
- **The dialogue box is a cartoon panel:** navy keyline, amber inner rim, a snow cap made
  of repeating radial gradients, a gloss highlight, and a tail outlined in the same navy
  (`paint-order: stroke fill`).

### Confetti, not marks

A right answer showers confetti across the stage (`particles.confetti(CFG.W, 64)`); the
whole-phase mend showers more; the crossing sealing adds a little. **There is no tick
and no cross** any more — `#verdict`, `.verdict`, `check.svg` and `wrong.svg` are gone.
A wrong answer keeps only the world's response (the whistle, the splash, the character).
No star glints in a celebration either: confetti was the ask.

### The gap

- **The hole has a mouth and a throat.** The plug is capped by the cavity (a piece lands
  at the size it was cut, see §10, and the cavity is 234 px), so a straight-walled hole
  could never be wider than ~243. The walls now step in: the MOUTH — the visible cut in
  the platform — is `L1.mouth` (1.6) times the plug width, and `L1.throatDepth` (36 px)
  below the walking line the walls reach the THROAT, plug width minus `bearing` (0.03),
  where the answer wedges — its top FLUSH with the platforms. The shoulders between mouth
  and throat are closed by an ice collar drawn behind the plug (`drawCrossingCollar`);
  there is no deck and no snow band over the answer any more. Phase 1: throat 229, mouth
  ~298. The curriculum test asserts the piece spans its share of the throat and the mouth
  is wider than it. Phase 1 now: throat 229, mouth ~366.
- **Two polygons in one ditch.** Phases 6 and 7 have three answers and two ditches: the
  extra answer goes to the last ditch, which is twice as wide at the throat and bridged
  by two pieces side by side (`share` in `layoutPhase`).
- **The walls are the platform's own stone.** `rock-band.webp` (the sheet's stone base)
  is tiled down each side inside the hole with a jagged inner edge and darkens with
  depth (`GroundManager._wallArt`); the carved caps sit at the lips above it.
- **Rocks are 80% of the delivered size** (`CFG.obstacle` 112/184) — a shorter hop.
- **Shapes hang higher** (`optionY` 470): long ropes over the crossing, as in the reference.
  `ditchGap` 120 → 150 makes a three-hole stretch read longer.
- **The lips are carved ice from the supplied platform art** (`GroundManager.drawCap`,
  `cap-l.webp`/`cap-r.webp` cut from `art-source/sheets/pathui.png`): snow top on the walking line, ice
  band and rock base scaled to the path's own face height, inner edge faded into the
  tile, face reaching 8 px into the hole. `brokenEdge` remains only as the fallback
  before the art loads. **Collision is unchanged**: the hole is still `_ditchPath`; only
  the picture of its edge changed.

### Obstacle spacing

`CFG.obstacle.runRoomS` 1.2 → 3.4 s: about 2280 px between rocks instead of 1134. Each
rock is its own event with a run between; `PHASE_RUN` waits for the last rock, so no
stretch is cut short.

### Not done, and why

- **"Tribbling" (item 4)** — `tribble.png` in Downloads is a bear-cub sheet (run, skid,
  look down, tremble). It is a second character, not an effect. Slotting it in is a
  character-roster task (`CFG.characters`, `tools/slice-char.mjs`) and needs the brief to
  say whether the bear is playable or the friend at the end.
- **A cartoon post-process (item 3)** — not applied; the comedy layer is `CFG.juice`.
  A whole-frame stylisation is the one thing most likely to eat the readability of the
  hanging shapes, which is the game.

### The sound kit (item 5)

The supplied kit lives in `tools/sound-kit/` (API.md, calibration, fetch/measure/verify
tools, soundboard) and ships as `game/js/sfx.js`, a classic script loaded on both
schemes before the game. `AudioManager.kit(name, opts)` plays a kit cue and returns false
when the kit is absent, so every call site falls through to the local palette:

| game event | plays |
| --- | --- |
| walked into a rock | `bonk` |
| rope cut | `slice` |
| wrong chunk hits the water | `splat`; the fall is `fallingWhistle` |
| wrong answer | `wrong` — never `sadTrombone` (this game does not laugh at the learner) |
| knockout crash | `bonk` + the owner's sad trumpet (`CFG.sfx.knockout`) — the owner's call for this moment; a third-strike wince keeps `cuckoo` + `sparkle` |
| the tremble at the edge | the owner's cartoon blink (`CFG.sfx.tremble`), once, as the strong tremble begins |
| right answer | `correct`, pitch rising with the streak; phase done → `levelUp` |
| chunk arrives on its rope | `bubble` |
| boings, missed-jump whiff, glints, prize, rock tick | `boing`, `swoosh`, `sparkle`, `gem`, `tick` |
| landing / UI tap when the recordings are unavailable | `land`, `click` |

The six delivered recordings stay primary and are never layered with a kit cue. Voice
cap 3, pitch jitter on every shot, key `C pentatonic`, kit master 0.5 to match the
game's bus; the sound toggle mutes both contexts. Music ducking stays in the engine.

### The ending (item 10 polish) and the comic voice

The card in the sky is gone. The friend SPEAKS the ending: a `.win-bubble` in the same
cartoon construction as the tutorial box, tail on the bear, holding a title that bounces
letter by letter, a count that climbs as seven gold coins land — each embossed with the
verified ring of the shape that mended that crossing (`Hud.showWin`, from the engine's
`mendedKinds`) with a coin sound per stamp — and three sparks. Confetti drizzles for as
long as the screen is up (`COMPLETE` in `update`). Play again stands on the ice to the
right of the two friends and glows without moving (a filter animation, so it is still a
stable target).

The kit's master is 0.85 so the comedy leads the mix. The character's gags run on the
kit's comedy voices — squeak (gasp), honk (trunk toot), cuckoo (double-take), ratchet
(knocking knees) — and a rock coming into range plays `anticipate`. Each tutorial bubble
pops (`popIn`) as its words change; the pop animation now actually restarts on every
sentence (it compared the text after writing it, so it only ever fired once).

### A performance rule learned the hard way

`.tut-focus` is a full-stage canvas with a drop-shadow glow. Animating that filter meant
re-blurring 1920×1080 of alpha every frame; on a software renderer the whole game ran at
1.7 fps while a tutorial step was up (found by the file:// test, which drives the game
with the tutorial on). The glow is static now — 29.9 fps on the same renderer. Rule: never
animate a filter on a stage-sized element; animate filters only on small ones.

### Impacts, stars, rubble, a constant thud

- **Poofs.** Every impact throws a cartoon cloud (`particles.poof`): four overlapping white
  discs with a soft blue rim, swelling as they thin, drifting up. Take-off, landing, skid
  stop, the plug arriving, the crash (big), each footfall (tiny). `snowPuff` remains for
  actual snow.
- **Dizzy stars** circle the head in the knockout (`koStars: true`, `drawDazeStars`) — the
  drawing was there; the character config had it off.
- **The fit sound is the same every time.** `wedge()` leads with the kit's synthesised thud
  and layers the recording under it when decoded; before, a half-loaded recording fell
  back to a different synth sound. `game.warmAudio()` starts decoding at boot.
- **Rubble** from the sheet sits on each shoulder of an open crevasse (`rubble-1/2.webp`).

### The SFX audit (asked for twice)

Every cue was traced from its trigger to the speaker. Two faults, both fixed:

1. **The fit sound swapped voices.** `wedge()` played the recorded thud once decoded and a
   synth stand-in before that, so the first right answer of a session sounded different
   from the rest. It now leads with the kit's synthesised thud every time and layers the
   recording under it when ready; `game.warmAudio()` starts decoding at boot.
2. **`setDuck` ducked the effects, not just the bed.** It scaled the master to 80% for the
   whole of a puzzle while the kit stayed at 100%, so the same cue sat at two levels in
   two states. The master is fixed at 0.7 now (up from 0.5, so the recordings sit under
   the kit's 0.85 rather than vanishing) and only the music ducks; disk-build cue elements
   no longer multiply by the duck either.

Checked and sound: `bonk()` has two call sites but they are mutually exclusive (the
three-strike branch returns); jump/land/step/skid/slice/reject/splash/success each fire
once from one place; kit cues fall back to the local palette only when the kit is absent.

### The undercut, the far wall, the swirl, the sky

- **The crevasse is undercut.** The opening at the surface — the neck — is exactly the plug's
  width (`g.throat`); from `throatDepth` the walls curl out to the void, 1.6× wider. So the
  gap reads big (a wide dark chasm under overhanging lips) and the answer's flat edge spans
  the opening exactly, resting on the lips, seated 9 px proud (`PLUG_SINK = -9`) so its edge
  covers the neck's shallow chew (`-9..-2`). Nothing is drawn over or around it: the deck,
  the snow band, the ice collar and the shoulder rubble are all gone. The caps stand at the
  neck lips.
- **The interior has a far wall.** The rock band is tiled across the whole hole
  (`_backArt`), pulled back into the blue and darkening with depth, under the snow
  overhang's shadow, with mist off the water; the side walls sit in front, brighter. A flat
  gradient between the walls was the "cut-out" look.
- **The dizzy swirl** is a running dashed loop over the crown with four fat keylined gold
  stars, riding it bigger in front and smaller behind, popping in once he is sitting.
- **Day to night.** `light()` lit the scene from the *destination* sky on the first frame of
  a crossfade (it read `index`, which moves at fade start) — a visible pop at dusk→night.
  It now lights from the outgoing sky and crosses with the picture; the fade is 4.2 s.

**The fit chord is one sound in every level.** `audio.fit()` fires on every right landing:
the kit's `correct` at pitch 1 with jitter off, under the kit's thud (also jitter off). The
phase-done moment is `levelUp` and the journey's end `powerUp`, so neither is mistaken for
the fit. Before: the chord fired only at phase-done, rose in pitch with the phase number,
and carried the kit's ±5 % jitter — three reasons it was heard as different per level.

### The ending dances

At COMPLETE the standing pair cross-fades (300 ms) into the delivered two-character
celebration GIF, sliced to `assets/char/duo-celebrate.webp` (6×6 of 754×434, native size,
10 fps off the state clock, feet on row 374, drawn 1.3× with the mammoth's x kept — see
`DUO`/`drawDuo`). A poof lands under whichever of them comes down on each beat. Confetti at
the ending is the big kind (14–28 px) — shower of 130, then 34 every 2.2 s. The words are a
banner across the top ("Momo found his friend — home at last!" over the climbing count and
the seven stamps), and Play again is bottom-centre. Source GIF: `art-source/gif/celebrate-duo.gif`.

### The dialogue boxes are the supplied bubble

Both boxes — the tutorial's and the ending banner — are `game/assets/art/Bubble.svg`
rebuilt as geometry (`js/bubble.js`): rounded body, one swept tail off the edge facing
the subject, flat `#F9D201`, a cocoa `#5A2E0A` keyline (black was asked off). `bubblePath(w, h, tail)` draws the shape for
whatever box the words need; `fitBubble(svg, box, {side, at, lean})` fits it to a live
element, flipping the SVG (never the text) for a tail on top. The tutorial aims the tail
at its target and rebuilds only when the box or the aim changes; the banner has no tail
and refits on resize. Every knob is in `BUBBLE` (fill, ink, stroke, radius, tail size).

### Comic type, juice on the controls, the trample

The bubble's words rise in one at a time (`Tutorial.setWords`, 55 ms apart) and the one key
word of a sentence — capitals, or one of the game's nouns and verbs — is `.pow`: Baloo 2 at
900, deep blue `#1E56C4`, tilted 3°, one per sentence. `js/juice.js` (supplied) runs on the
DOM controls only, sound and particles off: the JUMP button hops when pressed, icon buttons
pop, each ending stamp pops as it lands, the banner does a tada, Play again nudges every
3.8 s while ignored. The trample (item 4) is the landing: crouch, deep squash, dust, a 40 ms
hit-stop with a flinch of the frame, shake, and a splat under the thud.

### The river lives

`GroundManager.drawRiverLife`: a fish silhouette gliding under the surface every 9.5 s, bubbles
near the shore, and a tap on the water splashes (`addTap`). A dashed crest and drifting floes
were tried and taken off as clutter.
Scenery on the game clock; nothing reads it back into play.

### The ending, tightened

The run home ends with the bear 520 px from the mammoth — exactly where the dance sheet has
him — so the cross-fade moves nobody; the pair then glides to centre stage over 900 ms. The
card is the title and the seven stamps only, level and smaller; a tap on a stamp pops it and
rings its coin, a tap on the dancers poofs and honks, a tap on the water splashes.

### The tremble at the edge (the owner's 12-frame sheet), and the art at screen resolution

`mammoth-tremble.webp` is the owner's 12-frame reaction sheet (4x3, `art-source/char-sheets/
tremble-src.png`): he notices the drop, looks down, grows nervous, trembles, trembles harder,
looks to the player, settles. It is built by `tools/sheet-to-grid.mjs` (poses cut on their own
connected outline — the second pose's tusk crosses its nominal cell, and cutting on the grid
sliced it — pre-scaled to the shared 340 px reference, re-guttered) and then by
`tools/slice-char.mjs` like every other sheet, `bob: false` so all twelve stand on the one foot
line: the delivery floats its rows at three heights, and flattening is what keeps him planted while
the frames change. The shared scale did not move (0.5037, baseGap 27), so he is exactly the size he
is in the run and the idle.

It is ACTED, not played at one rate: `CFG.sprite.tremble.plan` is a list of [frame, ms] steps —
notice/look down slow (180-220 ms), the tremble quickening (110/95/85), the strong comical tremble
as the oscillation 4-5-6-5 THREE times at 90 ms (1.1 s of visible shaking), the look to the player
readable (200-220), the recovery slowest (220/300) — 3.3 s in all. The first cut was 1.86 s with
62 ms strong steps and was reviewed as "not evident, looks fast"; this is the retune. PlayerController
walks it by elapsed time (the clock accumulates dt and spends a step when its ms are up), so it plays
at the same speed on 60, 90 and 144 Hz, and a slow frame holds a pose rather than skipping one. Slow
steps (≥150 ms) crossfade into the next pose over their last 40%, so a head turn glides; the strong
steps cut hard — the flicker IS the tremble there. On the strong steps a real cartoon knock is drawn
under the frames (±7 px, ±3 px, ±2°, a 4% jelly squash on each beat, on a fixed 0/-2/+3/-2/+2/0
rhythm, eased in and out; stage units so it scales; off under prefers-reduced-motion) — drawn, never
simulated: the collider reads none of it. The wait after it is still (a gulp shiver was tried and
taken out on request).

**The comedy in the tremble** (asked for: "comic juice, fun, spice"), all drawn on or spawned at the
sprite, nothing read by the collider: (1) TREMBLE MARKS — three short brown arcs a side at
shoulder, chest and hip from the moment the tremble starts, bold on the strong beat, one side
heavier per beat and jittering against the knock — the cartoon shorthand for fear; (2) THE "!" —
a bold exclamation mark pops over his head with an overshoot as he notices the drop (plan steps
0-3) and shrinks away as the tremble takes over; (3) BEATS — every strong step lands a little dust
puff under alternate feet (the feet drumming) and shakes snow flecks off his back; (4) SOUND — the
owner's blink cue as the strong tremble begins and the kit's knees-knock ratchet on the second
oscillation. The still shake lines painted into the sheet stay; these carry the beat between them.

The dialogue box is capped at 760 px (was 500): at desktop size "Oh no! The path is broken." needs
~720 px with its padding to sit on one line, and at 500 it wrapped with "broken." alone on a second
line under a box twice its width (a design bug the owner caught). The owner's cartoon blink (`CFG.sfx.tremble`, four little pips) fires
once as the strong tremble begins, with a puff of snow at his feet, so picture and sound land
together. The trample is shelved beside the fright in `art-source/shelved/` (both sizes, still
measured by the slicer); its stamp hook is gone with it. Test: tests/tremble.spec.mjs.

### The stop is a stop

Asked for: when he stops, the feet stop. They did not — LOOK_DOWN looped the trample, a stamp
every 2.5 s for as long as the learner thought. Now the tremble ends on its settle and LOOK_DOWN
plays the delivered idle; without the idle the tremble's last frame is held under the procedural
breath. Test: tremble.spec "waits on the idle with his feet still".

The idle is now the owner's 12-pose sheet (idle-src.png, 2026-09-07: blink, trunk sway, weight
shift), built through tools/sheet-to-grid.mjs like the tremble, replacing the 36-frame GIF take.
Twelve poses at the old 16.67 fps would loop in 0.7 s and jitter, so it runs at 7 fps (a 1.7 s
loop, each blink a readable 143 ms) and consecutive poses are CROSSFADED in draw for the last 40%
of each step (`CFG.sprite.idleBlend`): the next pose is drawn over the current at the step's
fraction, same cell, same anchor, same scale — so a blink or a trunk drift glides instead of
stepping, and the pose is clean for most of the step (a full-step dissolve doubled the tusks).
The procedural breath rides on top. Feet stay planted (measured across the sheet).

### The comedy crash

Asked for: an exaggerated body shake, stars/impact marks, and a playful "tue-tue" cue synced to
the impact. On the frame of the bonk the character rattles side to side for 0.28 s (9 px, 3°,
decaying) over the delivered clash frames, seven five-point stars burst from the point of contact
(`particles.stars`; the orbiting daze ring still arrives over the sat-down pose), and the owner's
sad trumpet (`CFG.sfx.knockout`, chosen by the owner for this moment) starts with the bonk. Once
he is sitting dazed a small nervous tremble keeps him alive until the run resumes. The third-strike
running wince gets the rattle and stars with the lighter kit cue (two falling notes and a twinkle,
`crashComedy`). All of it is drawn on the sprite: the collider and the world never move.

### The tied rope

Asked for: the thread should look like the block is really tied to a rope, with a knot at the
attachment and a slight natural curve. `assets/env/rope-tied.webp` is a 96 px strip cut from the
owner's rope art (eye and knot at the top, twisted cord, a knot with a frayed tail at the bottom;
`art-source/rope/rope-tied-src.png`). `CFG.rope` names its regions in strip rows. The knot-and-fray
cap sits on the block's top edge with the tail tucked under the block (blocks draw after ropes);
the cord is tiled UPWARD from the knot in 280-row slices through the 1120-row twist, so the twist
keeps its own pitch however long the rope is; each rope bows sideways by up to 7 px across its
visible length, swaying on its own phase, and each slice turns to follow the bend. A cut rope's
stub ends in the fray; the falling block keeps its knot and the cut length above it. The bend is
drawing only: the cut test still runs along `ropeSpan`'s straight line, which the bend never
leaves by more than its 30 px reach. Tests: tremble.spec "the rope art", "a cut still parts the
rope"; the existing rope-cut tests in polish, regression and game.

### The sequence at the edge (tutorial)

The owner's order: he skids to the lip, the WHOLE tremble plays, and then "Oh no! The path is
broken." comes with the gap lit and the game frozen; the cut ask follows. The gap step's trigger
is therefore "stopped (PHASE_INTRO or later, never the skid) and no longer in SHAKE". Firing during
the skid froze him mid-slide; firing during the tremble froze the performance. Test: tremble.spec
"the last tutorial line ..." asserts LOOK_DOWN and a spent plan at the moment the line appears.

### The ditch stage arrives in beats

Asked for: the comedy elements all landed at once; the hole should be shown, then described, then
the options should come down as they are talked about. `PHASE_INTRO` now runs three beats on its
own clock (`G.introT`, `G.stageBeat`), and that clock stops while the tremble is still playing and
while a tutorial line has the game frozen — so a spoken beat lasts exactly as long as it is read.

| beat | what is on stage | length |
|---|---|---|
| 0 | the hole alone (the tutorial's "Oh no! The path is broken." owns it) | `T.gapBeat` 900 ms |
| 1 | the ice comes down left to right, `T.dropStagger` 220 ms apart, a pop each | `shapeDrop` + stagger |
| 2 | the plank asks the question, and the voice says it | `T.signBeat` 700 ms |

THE QUESTION COMES LAST, on the owner's call. The sign used to arrive before the pieces, which
asked a child which shape to cut while the row was still empty sky and made them hold the answer
in mind through three drops. Asking once every piece is hanging means the question is about what
is already on screen. The HUD holds the sign back until beat 2 and the spoken question waits with
it; a tap still skips the reading, now straight to the ice coming down.

The sign is held back by the HUD until beat 1 (its text is never blanked — `replayInstruction`
reads it — only its visibility is gated). Each option carries its place in the row as `order`, and
`updateL1` delays its drop by `order * dropStagger`. A tap still skips the reading, now by pushing
`introT` to the end of beat 1. Tests: stage.spec "the hole comes first".

### The puzzle framing, and the idle that stops

Asked for, over three rounds: push in further, keep the ditch visible, read the shot from the left,
do not crop Momo, and get the pieces off the right corner. `zoomK` is 1.24 (from 1.08 → 1.16 →
1.22 → 1.26 → 1.24). `viewFocus` solves the focus point from what must stay in shot, so the
framing is geometric rather than chosen, and its bounds are all measured now: `charBack` 212 is
his drawn rear (200 px behind `mammothX`, read off the frame) plus 12 px of margin, so he is whole
with very little space behind him; `skyTop` 200 says only sky sits above that line (the sign is a
DOM overlay and does not zoom), which is what lets the view sit low enough to hold the crossing;
and `rowRight` 1680 follows the row in. The row itself moved: `clearOfPlayer` 300 starts it closer
to him and `rowInset` 210 stops it short of the right edge, so the pieces are wider, sit in the
middle band, and have about 175 stage units of sky beyond the last one.

What is NOT possible, for the record: the row cannot be centred on the frame while Momo is whole.
He occupies the left quarter of the shot, so the row's centre lands at about 63% of the width; the
only ways to 50% are cropping him or hanging a piece over his head, both of which the owner ruled
out. Measured at 1.24: his back at x 23, the row from 682 to 1744, the lip at 884, nothing above
him. Test: stage.spec "the puzzle framing keeps Momo whole". The idle plays ONE pass and
holds its last pose under the procedural breath while he waits (asked for: it should stop, so the
eye goes to the puzzle) — `IDLE_LOOK` and `CELEBRATE` still loop, because there the character is
what the player is watching.

### The instruction sign lives in the left band

Asked for: the panel overlapped the hanging options. The option row is centred on the safe area
(`mammothX + clearOfPlayer` = 770 to `W - 60`), so everything from the left edge to x 770 of the
1920-unit stage is clear sky above the character's head. The sign is now left-aligned at 1.6% with
a 40% cap instead of centred, and on a phone its height comes from the STAGE (17.4% of the stage's
own height) rather than from `vw` — the stage is letterboxed, so a vw-based height grew relative to
the stage on a short, wide phone and the plank ran back under the ropes. Measured for the longest
sentence ("Cut the QUADRILATERAL."): 718 of 1920 on desktop, 908 on a phone, against a leftmost
rope at 952. Test: stage.spec "the sign sits in the empty left band".

### The ending is the friend's words, not a scoreboard

Asked for: remove the shapes and make the card fit the moment. The row of seven gold coins, each
embossed with the polygon that mended its crossing, is gone — a scoreboard of shapes at the point
where the story pays off — and with it the count, the coin builder in `hud.js`, the `mendedKinds`
field the engine published for it, the `onStamp` handler and about forty lines of dead CSS. What
is there instead: "You did it!" waving a letter at a time, and under it **"Momo crossed the Frozen
Pass!"**, which answers the tutorial's own "Help Momo cross the Frozen Pass!" — the story closes
where it opened, in the same white-and-icy-blue speech as the dialogue. Design bugs fixed at the
same time: the title was a WHITE fill with a navy stroke, so on the new white banner only its
outline showed (it is navy ink now with an icy-blue drop), and the banner kept the old yolk yellow
after the dialogue had moved on. Test: skip-end.spec.

### The ask box sits up on the rope

Asked for: the box appeared under the pieces, over open ice, and read as unrelated to what it was
talking about. The ask's subject is now the rope's own cut stretch — the same line the hand sweeps
— so on a desktop stage the words sit above it with the tail down on the piece, and all three
pieces stay visible. A phone-landscape stage has no sky above the ropes (the box would have to be
clamped to the top edge with its tail pointing at nothing), so there the box falls back to under
the row (`belowY`) and the tail reaches up to the piece. Two shape bugs went with it: a tail is
never wider than it is long (a wide one-line box on a phone took the 150 px cap and drew a shard),
and the box is capped narrower on a phone so it does not span the stage.

### The dialogue box is in the game's palette

Asked for: the yellow was not the game's. The bubble is frost (`#EAF9FF`, `CFG.colors.frost`) with
the deep ice edge the hanging chunks are outlined in (`#14507A`), navy ink (`#0C3352`, about 11:1),
and the key word in bright orange (`#F26100`). The bubble went frost-and-navy first, then
white with a bright icy-blue keyline (`#FFFFFF` / `#3FB3E8`) on review; the key word was tried as
Momo's amber on an amber highlighter wash and the wash was removed on request — "no card, just the
colour" — so the word is picked out by hue alone, as the sign's noun is. The shadow is cool to match. `BUBBLE` in `js/bubble.js` and `.tut-face` in
`css/screens.css` draw the same shape and are kept in step; a test holds them together. The words
still rise one at a time but with no overshoot, and the instruction sentence now eases in a word at
a time too (`.instruction-text .iw`, 420 ms, 70 ms apart), both off under reduced motion.

### Every spoken line, in one place

`docs/VO-SCRIPT.md` lists every line the learner reads or hears — the seven tutorial lines, the
seven instruction sentences, and the interface strings — with an id per line for voice-over files
and a note on delivery. A test reads the config and the tutorial and fails if a line is missing
from the script, so the two cannot drift.

### The ending: the words are the reward

Asked for: remove the shapes and make the card fit the moment. The row of seven gold coins, each
embossed with the polygon that mended its crossing, is gone — it was a scoreboard of shapes at the
moment the story pays off. The banner is now the same white-and-icy-blue speech as the dialogue,
the title reads as navy ink (it was a white fill with a navy outline: invisible on a white card, so
only the outline showed and the letters looked hollow), and under it one line says what happened —
"Momo crossed the Frozen Pass!", answering the tutorial's "Help Momo cross the Frozen Pass!" — with
the place name in amber. `mendedKinds`, the stamp builder, the coin styles and the tap-a-coin
handler went with the coins, and the dead `.win-count` rules went too. Test: skip-end.spec.

### The dialogue box sits up on the rope

Asked for: the ask box should be on the rope, not parked under the pieces. The cut step's subject
is now the rope's own cut stretch (where the hand sweeps), so the words sit just above it with the
tail down on the piece — sentence and gesture in one place. Two things keep that honest: the box is
wide enough to hold the sentence on ONE line (a two-line box is too tall to fit above the rope, and
fell back over the answer), and it is pushed right until it clears the instruction plank in the
top-left band. Where there is no sky above the ropes at all — a phone-landscape stage — it falls
back BELOW the pieces (`belowY`) instead of half over them, tail still on the answer. The key word
is icy blue: an amber highlighter wash was tried and taken out on request ("no card, just the
colour").

### The puzzle framing pushes in

`zoomK` is 1.22 (was 1.08, then 1.16): the view pushes in until Momo's back is at the left frame
edge, and it sits lower — `skyTop` lets the empty sky above y 200 leave the frame, which is what
frees the view to drop, and the bottom bound is the lip plus 120 rather than the whole water. The
limit is geometric, not a preference: `viewFocus` solves the focus point from what must stay in
shot (his back, `charBack`, and the option row's glow, `rowRight`), so the framing cannot clip a
piece. Measured at 1.22: his back 56 units from the left edge, the row's right edge at 1918 of
1920, the ditch lip at screen 881. The idle he waits on plays ONE pass and holds its last pose, so
the eye goes to the puzzle rather than to a looping character.

### The voice

The owner recorded every line the learner is shown as ONE take (39 s, `assets/audio/vo-lines.mp3`),
in the order of docs/VO-SCRIPT.md. One file is one download and one decode, so `CFG.vo.lines` names
a WINDOW per line — [start, length] in seconds, measured off the recording's own energy envelope
(the gaps between lines run 0.46-0.67 s; a two-sentence line has a shorter internal pause and is
kept whole), each padded 60 ms before the attack and 120 ms after the tail. `audio.say(id)` plays
one and returns its length; one line at a time (a new line stops the one before it), the music
ducks while it speaks, and nothing blocks: no file, no context or sound off and it returns 0 and
the game is exactly as it was.

WHO SAYS WHAT. The seven tutorial lines are spoken by their steps (`VO` in tutorial.js). The seven
questions are spoken by the engine, with the id derived from the sentence itself
(`api.signVoId`: "Cut all the PENTAGONS." -> sign-pentagons), so a re-worded phase cannot drift
from the recording. The ending speaks its two lines in order.

THE WORDS KEEP PACE. Each line's reveal is spread across 82% of its clip — the step is measured on
the LAST word's delay, not the word count — so the sentence finishes arriving as the voice finishes
saying it (measured: 3.73 s of a 3.99 s clip, 2.78 of 2.83, 2.37 of 2.33). Divided by the count and
capped at 0.21 s, as it was first written, every word was up by the middle of the line.

TWO FAULTS WORTH REMEMBERING, both found by walking a whole playthrough and logging what was said
(`_voice().said`, which records the reason a line made no sound):
- the first question was never spoken. The only call was on entering PHASE_ACTIVE, and in the
  tutorial the teaching line still had the plank at that moment. It is now checked every frame
  while a question is up, once per phase (`G.saidQuestion`).
- the take never decoded. The bytes are fetched with the art (a gesture is needed for the context,
  not for the download) and decoded when the context opens — but a second caller saw a "fetching"
  flag and returned at once, so the decode ran before the bytes landed and gave up. The fetch
  promise is shared now, and a line asked for too early is held and spoken as soon as it can be
  (dropped only if its moment has passed by more than four seconds).
Tests: voice.spec.mjs.

### The bubbles point at the thing (tutorial)

Asked for: the ditch line must point at the ditch and the option line at the right option, not at
the air beside them. Two causes, both fixed in tutorial.js. (1) The tail's TIP is swept 0.62 of
its base width to the leaning side (bubble.js), so aiming the base at the subject put the tip up
to 93 px beside it — the base is now set back by that sweep and the tip lands on the aim
(\`aimX\`, the block's centre for the option line). (2) The body sat a fixed 54 px from a spot that
was a halo, not the thing: the gap spot is now the hole itself (an oval 62 tall about the ice
surface) and the gap between body and subject IS the tail's length plus 6 px, so the tip touches
the edge. The box is re-measured whenever its layout size changes, so the edge clamp never works
off a stale width (the option line used to run 44 px off the right of the stage on the rightmost
block). The cut-here dashes on the ropes are white with a cool white glow, on request (were gold).
The tremble sheet is the owner's second delivery of 2026-09-07 (same 12-pose performance,
tremble-src.png), built through the same pipeline; scale unchanged.

### The last tutorial line runs unblurred

"Perfect fit! Keep going!" is a describing step spoken over the resumed run (pause:false); the
veil was blurring the whole moving scene under it. The veil now shows only for a describing step
that has stopped the game.

Every slot uses the newest GIF delivered for it: run and jump from the first delivery,
`skid-new`, `ko-new` (the crash), `idle-new` (the finale and the wait at the edge), the owner's
`tremble-src.png` sheet (the edge), `celebrate-duo` (the ending dance); `ditch-new` and
`trample-new` are shelved.

**Resolution.** Three things kept the game soft on good screens, and all three are fixed:

1. `tools/gif-to-grid.mjs` pre-scaled every GIF to the size of the first sheets (~173 px of
   character, as the square root of the opaque area) — half the delivered size. It now scales
   to a fixed reference of 340 px, the top of the delivered range, so the grids hold native
   pixels. Every grid must be built with the same reference (`--ref=N` rebuilds the set).
2. `tools/slice-char.mjs` writes two sets from those grids: the base 420×320 cell in
   `game/assets/char/`, and a 1.5× cell (630×480) in `game/assets/char/hd/`, both downsampled
   from native. Sheets are six-column grids, not strips: a strip at the hd cell would pass
   WebP's 16383 px limit, and the old 15120 px strips were already past every GPU's texture
   size. The engine reads `(f % cols, f / cols)`; `CFG.sprite.cellK` (1 or 1.5) is the only
   number it multiplies by, so the character is the same size on stage either way. The bear
   has an hd cut too (`hd/bear.webp`, from his 1254 px source).
3. The canvas was a fixed 1920×1080 stretched by CSS. `createGame` now sizes it at
   `renderScale × 1920×1080` (up to 2×) and sets that scale as the base transform in
   `render()`; main.js picks the scale from the stage's CSS width × devicePixelRatio (`?rs=N`
   forces it) and re-picks it on resize. The hd art set is chosen once, at boot, when the
   scale is ≥ 1.15. A guard measures the frame rate and, on a machine that cannot fill the
   bigger buffer (mean under 40 fps after the first seconds), steps the scale down a quarter
   at a time towards 1 and caps it there — never back up, and never for a forced `?rs=`.

Phones keep the base set. A 16:9 stage on a 1080 px-tall screen is about 1920 device pixels
wide, so most phones land on scale 1 anyway; a 3× phone qualifies by scale but is excluded by
stage width — the hd set needs a stage at least 1000 CSS px wide (every phone is under, tablets
and laptops over) and, where the browser reports it, at least 4 GB (`main.js: wantHd`,
`?hd=1/0` forces it). That rule came from a real phone that showed no character at all after
the hd set shipped: a sheet it could not decode came back null and `drawImage` threw on every
frame. Two guards now stand regardless of the rule: the hd set is loaded as a whole and falls
back to the whole base set if any sheet is missing (`loadCharacterArt`), and a missing sheet is
skipped at draw time rather than thrown. A hi-DPI laptop, a tablet or a 4K screen gets the hd
set (3.7 MB) and a sharp backbuffer. The duo dance sheet is already at
its GIF's native size and has no hd cut; the painted environment (path, sky, caps) is at its
delivered resolution. The art budget test now budgets the two sets apart, because a client
fetches one of them.

### Launch lacks found on the deployment

Tested live at running-mammoth.vercel.app in five contexts (1080p desktop, Pixel 7 landscape
with touch, Pixel 7 portrait, a 2x laptop, an iPad) plus a full playthrough. Fixed from it:

- **The JUMP button hopped.** Juice.hop lifted the button 24 px and swelled it 7 px over 620 ms on
  every press — a quarter of its height on a phone — so the control left the finger. It now
  compresses in place (160 ms scale squash); the art swap and tap ring are unchanged.
- **Blank page while loading.** The cover waited for the whole art set (5–6 s on the deployment)
  before anything appeared. The cover now shows at once with PLAY held and a "Loading…" note;
  onReady releases it (`Frontend.setLoading`).
- **First sentence in a fallback face.** Baloo 2 was only fetched on first use; `document.fonts.load`
  warms it at boot.
- **Preload warnings.** The two pressed-button `<link rel=preload>` produced a Chrome warning on
  every load; they are warmed with `Image()` instead.
- **No icon.** `favicon.png` and `apple-touch-icon.png` are the character's face; `theme-color` set.

From a playtest as a grade-8 student (phone with a finger, then laptop with mouse and keyboard):

- **A tap on a block did nothing.** It was the student's first move. Now the block's halo
  flashes (light, not movement — the options hold still while they are read), the whiff
  plays and the demonstration hand comes forward at once, on the rope of the answer. A short stroke is still never told it "missed".
- **The tutorial's hand demonstrated on the middle rope**, so a student who copied it cut the
  wrong block two times in three. The tutorial's hand and the engine's tutorial-phase demo
  now cross the rope of the answer, and the sentence names the shape ("Swipe across the
  triangle's rope!"). The idle hint later in the game aims at the answer too — asked for: the
  hand only ever goes on the right option, never a wrong one.
- **The tutorial's swipe bubble hid the blocks on a phone.** The zone it kept clear was a 90 px
  box around the rope; a phone's taller bubble could not fit above that and was placed "below" —
  over the blocks, hiding the very block the sentence named. The zone now runs from the top of
  the stage to under the blocks (`Tutorial.ropeBox`), so the bubble lands beneath them over open
  ice, with its tail rising to the rope; the hand keeps aiming at the rope itself (`handY`).
- **The JUMP hand covered the button.** Asked for: small, upright, fingertip a little inside the
  button's lower edge, pulsing. The tap hand is 45% of the button's width, squared up with a base
  rotation (the icon is drawn leaning left), its centre placed just under the button's edge so the
  fingertip reaches ~25 stage px in (`domSpot(sel, pad, 'bottom')` → `handX/handY`); the press
  pulse is a scale about the fingertip with the contact ring.
- Checked and fine: a late jump crashes and the run resumes by itself in about five seconds
  with no tap needed; a wrong cut splashes, the instruction comes back and the other blocks
  stay; JUMP is hidden during a puzzle so it cannot be spammed; rotating to portrait shows the
  prompt and the game continues where it was; Play again restarts cleanly.

Still open for launch: remove the review control below; the duo dance sheet is at its GIF's
native size (no hd cut possible); a phone on slow data still downloads ~8 MB before PLAY.

### No sweat, and sheets decoded up front

The sweat beads at the edge were tried three ways in this round — one small bead, a burst of
three with motion lines ("look like bullets fired"), an upward fan — and removed on request:
none read as sweat on the delivered art. The gulp stays as the nervous cue. The particle kind,
its draw branch and its settings are gone with it, not parked.

Every sheet is decoded during preload (`img.decode()` in `loadImg`), not on its first draw, so
the first jump, the first crash and the first stomp cannot hitch on a decode.

### Asset caching: versioned URLs

The deployment serves everything under `game/assets` as immutable for a year (`vercel.json`).
That is right for files that never change under one name — and it is what blanked the character
for every returning browser the day the sheets were rebuilt as grids under the same names: the
cached strips were fed to code reading rows they did not have. The fix is in the URL, not the
header: `tools/build-bundle.mjs` hashes every file under `game/assets` into
`game/js/asset-versions.js`, `assetUrl()` in the engine appends `?v=<hash>` to every image and
audio load, and the two stylesheets get the same hash on their `url()`s at build time. A changed
file is a new URL; an unchanged one keeps its cache. `tests/bundle.spec.mjs` (via
`node tools/build-bundle.mjs --check`) fails if any of the three is out of date — so a rebuild
is part of changing any asset. Paths in CFG stay bare so the asset tests can read them.

### The sweep-slash on a cut

Asked for: "add sweep slash effect when user cut the rope". The stroke detector hands `cutShape`
the crossing point and the finger's direction; `particles.slashMark` draws a comic lens there — a
gold body with a glow, a fine cocoa edge so it reads on pale sky, a white core — that flashes to
full length over its first third and thins away (0.32 s), with a fainter echo 40 ms behind, plus a
small sparkle burst at the snip point. A test cut with no stroke gets a level slash at the rope's
middle. Test: controls.spec "a real swipe leaves a sweep-slash where it crossed the rope".

### Tap anywhere to jump

Asked for: "user can tap anywhere to jump the mammoth like button, bg, mammoth etc like real game".
A pointerdown on the canvas in any run state with jumping allowed (`RUN_STATES` and
`G.jumpEnabled`) calls `requestJump` exactly as the button does (a mid-air tap is buffered the
same way) and flashes the JUMP button (`hooks.onJumpInput` → `hud.flashJump`), so the two read as
one control. In puzzle states nothing changes: a tap is still a stroke, a tap on the mammoth at
the edge is still a poke, a tap on the water still splashes. The tutorial's button step says so:
"This is the JUMP button. It makes him hop. A tap anywhere does too!" Tests: game.spec "a tap
anywhere jumps" and "a tap in a puzzle is a stroke, never a jump".

### The notch — TEMPORARY, and OFF after review

Reviewed and switched off (`CFG.levelOne.notch: 'off'`): the plain undercut neck looked natural and
the faceted break did not ("make ditch natural like previous"). The code stays behind the flag for
a later look; its tests skip while it is off. What it was:

Point 5 asked for a polygon-shaped cut in the gap's top edge. Taken literally it would let a
learner match a silhouette without knowing what a triangle is, so it is built in two states, per
the owner's gap-notch brief, behind `CFG.levelOne.notch` ('reveal' now; 'exact' cuts the answer's
outline from the start; 'off' is the plain neck): BEFORE the answer the gap shows a generic faceted
break — nine straight facets with a near-flat seat, deterministic per gap, resembling no option
("clean geometry goes here", not "a triangle goes here"); AFTER the right piece seats the break
resolves to the exact answer outline over 0.45 s (`g.reveal`) and the plug fills it. Each slot is
bound to its target up front (`slot.kind`, `slot.notch`) so the outline it resolves to and the
piece that lands agree, and `targetFor` sends a cut piece to the slot cut for it. Below the
deepest point the chasm stays open, so a wrong piece still falls through. A leak check
(`_notchLeak`) holds that the pre-answer break stays far from the answer's outline. Instruction
noun and target kind are checked against each other by test. Test: tests/notch.spec.mjs.

### The instruction stays, with the polygon set apart

Asked for: the sentence must stay visible until the question is done. It is up from the intro
until the last wanted piece has fitted, through wrong answers, and leaves on completion (the HUD
state's `instruction` reads the open question, not only the hold). The plank shows the sentence
with the polygon in capitals, heavier, in the key-word blue, full stop kept — "Cut the
TRIANGLE.", "Cut all the QUADRILATERALS.", the owner's wording (`Hud.setInstruction`,
`.instruction-text .key`, 126 art-px); the engine's sentence itself is unchanged. The sign still sits in the top band clear of the options and takes
no pointer events. Test: ui.spec "the instruction stays for the whole question".

### A respawn blinks

Asked for: platformer manners after a crash. `retryObstacle` arms `G.invincibleT`
(`CFG.juice.respawnBlinkS`, 1.0 s — was 1.6, which read as two seconds); the character flickers at ten a second (never fully gone)
and no collision counts until it is spent. Test: controls.spec "after a crash Momo blinks".

### The plank's seam, and strokes on its letters

A rope hanging behind the sign showed through a hairline at the right cap on phones ("the blue
cut line"): the middle slice overlapped the caps by 1 px and a fractional device pixel left a
half-covered column. It now runs 12 px under each opaque cap. The letters carry a cream stroke
(white around the blue polygon name) behind the fill, so the words lift off the wood grain.

### The wait is one still pose, and the hand-overs dissolve

Three complaints with one cause: the character CUT between sheets. (1) The wait at the ditch
played the idle sheet once (twelve poses at 6 fps beside a zoom-in, which read as a stutter) and
played it again every time LOOK_DOWN was re-entered after a wrong drop. (2) Tremble -> idle was a
cut from one sheet to another. (3) The celebration hop was |sin(7t)| with frames flipping on
thresholds, then a freeze, then a cut to the idle.

- **LOOK_DOWN holds the tremble's own last frame** (the settle) with the procedural breath. So
  tremble -> wait is the same sheet and frame — no hand-over — and there is nothing to restart
  on a wrong drop. The idle sheet plays only where the character is the thing being watched:
  the title (IDLE_LOOK) and the ending.
- **`CFG.sprite.handover` (0.18 s)**: a held or standing state entered from a different pose
  draws the pose it came from over the new one and fades it out (`fromSheet/fromFrame`, set by
  setState; drawn in the same cell geometry). On for LOOK_DOWN, IDLE_LOOK, SHAKE and SURPRISED —
  skid -> tremble, wait -> recoil -> wait. Off for the run, jump, landing and crash, whose cuts
  are the timing.
- **`CFG.sprite.hop`**: the celebration as a timeline — crouch 0.12 s, two parabolic arcs
  (0.48 s/42 px, 0.42 s/28 px) with a landing frame between, the settle, then the idle sheet
  entered through a 0.22 s dissolve from the settle. In flight the frame follows the arc
  (launch, rise, apex, fall, pre-land) with a dissolve over the last 40% of each; measured:
  two peaks, frames never step back, hand-over blend 0.98 -> 0. A mid-level celebration
  (`T.celebrate` 0.7 s) plays crouch, one arc and the landing before the run resumes.
- The idle crossfade holds half a step and dissolves the other half (was 60/40), off the idle's
  own clock (`idleT`).

Tests: tremble.spec (the wait is `tremble:11`, held), hd.spec (the settle at both scales),
polish.spec (hop reacts to a poke, unchanged path). Probes: `qa-report/hop-strip.png`.

### The last review of the animations (owner: "make all gif smooth and perfect")

Measured with a per-frame trace that flags a pose change with no dissolve on either side; the
celebration, a wrong drop and a jump now report **no hard cuts**.

- **The startle fires at the cut**, not at the splash 1.3 s later (`cutShape`); the splash keeps
  the body jolt. It dissolves in over the wait, holds the alert pose for `CFG.sprite.startle`
  (0.8 s) with a small stretch on entry, then dissolves back down to the settle — so the wait
  re-enters on the same frame.
- **Between crossings the celebration is one arc**: `mammoth.hopShort` drops the second arc and
  HOLDS the landed settle (breathing) until the run takes it up by a dissolve; the idle sheet is
  not started only to be cut off. Both arcs and the idle run only at the ending — where the sprite
  fades into the duo picture within 300 ms anyway.
- **Every ground contact dissolves**: crouch → launch, pre-land → land, land → launch/absorb,
  LAND's land → absorb; the flight poses dissolve across the 180 units of speed before each
  threshold; the take-off's crouch dissolves into the launch.
- **Quick states hand over in 0.08 s** (`CFG.sprite.handoverFast`: JUMP_START, JUMP_AIR, LAND,
  SKID_STOP); the run is taken up from any other sheet by a dissolve; the celebration's crouch
  gets a short one (55% of the crouch). The idle's own clock waits for the settle→idle hand-over
  to finish before it steps.
- The ending's sprite fades into `duo-celebrate.webp` at `G.st/300`, so the visible ending
  celebration is the pair dancing — the sprite hop there is 0.3 s of crouch and launch.

Test note: tremble.spec "the last tutorial line" waited for "Use the right ice piece" in the
speech bubble long after that line moved to the plank; it now waits on `#instruction-text` and
measures the pill. Strips: `qa-report/startle-strip2.png`, `qa-report/hop-strip4.png`.

### The three transitions the owner named

| | before | after |
|---|---|---|
| jump to run: the landing state | 180 ms, last 90 ms a held crouch | 120 ms, absorb dissolves into the run |
| tremble to normal: the recovery tail | 1140 ms | 790 ms |
| a right answer to any reaction | 1.2-3.2 s of standing still | a bob in 2 ms |

The tremble's shake (steps 4-18, asked for "slower and more evident") and its approach are
untouched; only the tail tightened — it was the slowest stretch of the performance, sitting
exactly where the eye has had the joke and is waiting to get on. The whole performance is now
2.96 s: 800 ms approach, 1370 ms shake, 790 ms recovery.

The wait before the happy jump is real and stays: a repair completes when the bridge closes
over, and the ice has to fall and seat first. What was missing was any answer in the meantime,
so a right cut now gets an immediate bob (`hop` 15, a 1.05 stretch, both decaying, the collider
reads neither) the way a wrong one gets the startle. The hop still lands on the finished bridge.

The run picked up off a jump pose uses the quick hand-over (`handoverFast`), not the settle one.

Test note: the two hand-over tests pinned specific opacities, which only held for one dissolve
curve; they now hold the shape — present as the change starts, falling, gone by the end of the
span — so a curve change is not a test change.

### A hand-over leaves fast (the curve, not the length)

The owner: "the first gif to the second looks slow and unnatural." The dissolve was shaped like
a hold. `underA = 1 - easeInOut(u)` is an S-curve, and the flat part at the *start* of an S is
the outgoing pose sitting at almost full opacity:

| through the change | 10% | 20% | 33% | 50% | 67% |
|---|---|---|---|---|---|
| old pose, ease-in-out | 1.00 | 0.97 | 0.86 | 0.50 | 0.14 |
| old pose, cubed | 0.73 | 0.51 | 0.30 | 0.13 | 0.04 |

Two nearly-solid poses on screen at once for the first half of the change is a ghosted double
exposure, not a blend — and at `handover` 0.18 s that was ~120 ms of it. Now `(1-u)³` and 0.12 s:
measured on the skid→tremble hand-over (the first sheet change at a ditch), the outgoing pose is
below 10% by **67 ms** and gone by 100 ms. The same curve carries the settle→idle dissolve at
the ending and the startle's recovery. Strip: `qa-report/handover-strip.png`.

### The animation timing, measured

Every state walked frame by frame on a hand-driven clock, recording how long each pose is
actually held. What the owner reported as "the gifs feel slow, the transitions lag" was three
measurable things:

| | before | after |
|---|---|---|
| idle pose hold (12 poses) | 167 ms, 2.0 s loop | 111 ms, 1.33 s loop (`idleFps` 6 → 9) |
| startle held on the alert pose | 808 ms | 500 ms (`CFG.sprite.startle`) |
| ending: first idle pose after the settle | 383 ms stall | 111 ms, steps immediately |

The stall was self-inflicted: the idle clock had been delayed until the settle→idle dissolve
finished, so the first pose was held for the dissolve *plus* a full step. The idle runs on its
own clock from the moment it starts and the settle fades out over a moving idle instead.

Three dissolves are now told apart on the player, because conflating them cost a test its
meaning: `lastBlend` is a dissolve **within** a sheet (the idle crossfade, a flight pose into
the next), `lastCross` is a dissolve **from another sheet** over this one (the settle into the
idle), `lastUnder` is the pose being handed over **from**, fading out underneath.

Cost: the whole dissolve layer is **0.4 ms** of the median frame (32.7 ms with, 32.3 ms without,
same nine seconds of a crossing at DPR 2) — it is two or three extra blits of one 420×320 cell.

### The camera move is eased at both ends

The push-in and the pull-out ran on an exponential approach — a fixed share of the remaining
distance each frame — which is fastest on its first frame and then creeps: it read as a snap
followed by a drift. They now run a normalised progress through `easeInOut` from where the move
started to where it is going (`G.zoomFrom` / `zoomTo` / `zoomP`), on the game clock, so the move
is identical at any frame rate, slower in (900 ms) than out (520 ms), and it ARRIVES instead of
tailing off. Measured through a push-in: the speed starts near zero, peaks in the middle at about
six times the opening quarter, and ends near zero.

### The runs are a journey, one obstacle at a time

Asked for, replacing the tightening curve: after the tutorial every obstacle is far from the next
and arrives alone. `CFG.obstacle.roomMin` (2.6 s) is the floor every gap is held to, enforced both
in the table and in the spawner, so no entry can undercut it; at 520 px/s that is about 1350 px of
clear ice on top of the leap, and measured on the hardest stretch there is never more than ONE
obstacle on screen at a time. What still grows with the level is the count (two, three, four) and
the variety (rock, log and bone together later) — the difficulty of this game lives in the
polygons, not in the timing of jumps. The lead before a stretch appears is 3.0 s, so a run opens
as travel. The tutorial's own rock is untouched: `timing.run1` 1.4 s, spawned 2150 px off-screen,
described at 1050 px. Tests: difficulty.spec holds the floor, the growth and the families.

### The journey lead after a puzzle

Asked for: after the tutorial the obstacles are placed far, so the running shows a journey like a
real game. `CFG.obstacle.leadS` (2.4 s) is the clear running after a puzzle before a stretch is
laid out; it spawns off-screen at 2150 px and takes a further ~3.3 s to reach Momo, so the first
rock of a stretch arrives ~5.7 s into the run and the run ends only once the stretch is passed
(`PHASE_RUN` waits for `clear`). A retry keeps a short lead (`retryLeadS`, 0.7 s): a failed jump
is tried again at once, not after the journey again (`G.retryRun`, set by `retryObstacle` and
consumed when PHASE_RUN is entered). Test: difficulty "after a puzzle the stretch is placed far".

### The brief's combination checks

The owner's sequenced brief lists six cross-item conflicts. How each is closed here:
1. A tap that dismisses a dialogue line never jumps — describing lines freeze the game, and a
   frozen tap arms a jump only when the freeze is an ASK (`setPaused(v, { asking })`, set by the
   tutorial for the jump line alone). Test: controls "dismissing a dialogue line never jumps".
2. The tap that completes a question is a stroke in a puzzle state; a jump needs a fresh
   pointerdown in a run state, so nothing crosses the boundary. Tests: game "a tap in a puzzle is a
   stroke, never a jump".
3. Invincibility suppresses collision only; input is untouched. Test: controls "a jump works
   during the blink".
4. Notch outline and instruction come from one answer: the slot's target kind; the instruction's
   noun is checked against every target kind. Test: notch "one source of truth".
5. A respawn re-spawns the stretch fresh 2150 px ahead, so it never lands inside a cluster. Test:
   difficulty "a respawn on the densest stretch lands on clear ground".
6. No dead zone: every spacing is one leap plus at least 0.6 s of running room, and a jump is
   accepted the moment he lands (LAND allows requestJump). Test: difficulty "every gap is
   clearable".
A progress tally on plural signs ("1 of 3", the brief's phase-4 suggestion) was tried and removed on request: the pieces filling the crossing are the progress.

### Two interaction modes

Running mode: a tap or click anywhere jumps (see "Tap anywhere to jump"). Polygon mode: while a
question is open, jumping is off (`G.jumpEnabled` false) and a tap or drag answers the question
only; running resumes the global tap-to-jump by itself.

### The runs get harder (a difficulty curve)

Asked for: the running should feel like a real game with increasing challenge. `CFG.obstacle.runs`
is one entry per stretch between puzzles: `room` is the running room in seconds after one leap
before the next obstacle (3.4 generous, 1.0 a near pair, 0.6 land-and-jump-again), one per
obstacle after the first; `kinds` names families (rock, log, bone) for combinations. The curve:
two far apart → three spaced → one then a near pair → three consecutive timed jumps → rock → log
→ bone with the last two close → a pair, a breath, a pair. The spawner always adds the leap, so
nothing sits inside a jump; the three-strike crumble stays, so no stretch dead-ends. The tutorial's
single obstacle before puzzle 1 is unchanged. Test: tests/difficulty.spec.mjs.

### The dialogue box hugs its words

`width: max-content` capped by `max-width` gives the box the whole cap whenever the sentence is
longer than it, and `text-wrap: balance` then wraps to lines much shorter than the cap: measured
82 px of empty yellow beside a three-line sentence. `Tutorial.hugWords` measures the laid-out
lines (each word is its own inline-block, so `offsetTop` groups them and offsetLeft/offsetWidth
bound them — layout, immune to the pop animation's transforms) and sets the box to the widest
line, once per sentence and per stage size; a narrower box cannot pull a word up a line, and
`balance` gets one chance to re-break the sentence with the wider result winning. The bottom
padding is trimmed by `descent - (ascent - cap height)` (`inkTrim`, from the font's own metrics)
so the air under the last line matches the air over the first line's capitals — measured 47 px
against 42 px before. The box is also capped as a share of the STAGE (`min(46%, 500px)`) rather
than of the viewport: the stage is letterboxed, so on a 844x390 phone the old `62vw` was 72% of
the ice and the longest line ran to 464 px with the box hanging 77 px off the left edge, its
first two words off screen. It now wraps to two lines there, and the placement clamp uses the
box's own half-width so no edge can leave the stage. The sign needs none of this: it is `nowrap` and every phase sentence fits
the plank's safe box with room at both sizes. Test: tests/fit.spec.mjs.

### The tutorial script (seven lines)

Rewritten to the owner's script, short and action-oriented: "This is Momo. He needs to find his
friend." · "Help Momo cross the Frozen Pass!" · "Watch out!" · "Tap to jump over obstacles." ·
"Oh no! The path is broken." · "Use the right ice piece to fix the path." · "Perfect fit! Keep
going!" The obstacle step triggers at 1050 px (was 1500, then 1200 — both still "looked far"), so Momo
is right behind what "Watch out!" points at, and the run before it is short: `timing.run1` is
1.4 s (was 7 s, which left Momo running alone for ~8 s after the second line and read as delay),
so after "Help Momo cross the Frozen Pass!" the rock spawns off-screen almost at once and is
about 2.4 s away, visibly approaching, when "Watch out!" freezes on it; the jump ask is frozen 1.2 s for reading, and a tap
during that freeze is armed rather than dropped: the engine jumps when the obstacle is in range
(`G.jumpArmed`), so a child who taps at once still clears it; a tap after the resume has ~0.8 s. Lines 1–3 and 5 are describing steps (game frozen, subject lit); 4 and 6 are the asks
(tap hand on JUMP, sweep hand on the rope of the answer); 7 runs over the celebration and lets
go by itself. The old "this is the button" step and the "Nice hop!" follow-up are gone; the
obstacle is no longer named in words (the picture is lit instead), so `thingAhead`/`wantedNoun`
went with them. One key word pops per line: friend, cross, Watch, Tap, broken, right, Perfect.

### A temporary review control

"Skip to ending" sits bottom-left during play (`#btn-skip-end`). It calls `game.skipToEnd()`,
which counts every crossing as mended and starts the run home with the friend a short way
ahead, so the real ending plays: arrival, cross-fade into the dance, confetti, the banner with
all seven stamps. It is for reviewing the ending, not part of the game, and comes out in one
pass: the button in `index.html`, its rule in `style.css`, the three `skipEnd` lines in
`hud.js`, the `onSkipEnd` handler in `main.js`, `skipToEnd`/`skippable` in `engine.js`, and
`tests/skip-end.spec.mjs`.

The tutorial names what is ahead — rock, log or fossil — from the obstacle's kind (`obstacleName`).

---

## 12. The six-point round (September 2026)

Six items, in the owner's order. Each is a rule now.

### 1. The dialogue speaks a sentence at a time

Asked for: shorter, simpler sentences, arriving in sequence rather than a whole paragraph
landing at once — "make it feel like comic dialogue".

A step's line is now split at its own full stops and the sentences take the box in turn
(`Tutorial.beats`): "This is Momo." lands, is read, pops out, and "He needs to find his
friend." pops in behind it. Each sentence gets its own pop, its own hug to the words and
its own beat, which is what makes it read as someone speaking rather than as a caption
appearing. Three lines split: 1, 5 ("Oh no!" / "The path is broken.") and 7.

**The words themselves are not rewritten in `tutorial.js`.** Every line is one recorded
take (`CFG.vo.lines`) and is listed verbatim in `docs/VO-SCRIPT.md`; changing a sentence
in one of the three without the others is how the voice ends up saying something the
screen is not showing, and a test holds them together. The split happens on the way to
the screen. A line that has to be genuinely shorter is shortened in the script, re-recorded
and moved in the doc — all three at once.

When there is a voice, the sentences share the clip in proportion to their own length, and
each one's words rise across its own share (`setWords`), so what is on screen is what is
being said. Measured on line 1 (a 3.99s clip): "This is Momo." holds 1.27s, "He needs to
find his friend." 3.17s. Silent, each sentence gets a beat to look at it plus ~55ms a
character, floored at 1.55s so a two-word beat is not a flash.

### 2. The rope and the block it carries move together

Reported as the rope and the shape travelling in opposite directions. Two unrelated
clocks: the rig swings on `comedy.swayHz` (0.22Hz, one shared angle for every option) and
the rope's bend ran on `rope.swayHz` (0.35Hz) **with a random phase per rope**. Two sine
waves at different frequencies drift in and out of step, so for most of every cycle a
block leaned one way while its own cord bowed the other.

The bend is now the swing's own angular VELOCITY (`rigLag()`, the derivative of
`rigSwing()`, negated so it trails): dead straight at each end of the arc where the rig is
momentarily at rest, bowed furthest back as it passes through the middle at speed. That is
what a rope on a pendulum does, it is one number for the whole row, and it cannot disagree
with the block. `rope.swayHz` and the per-shape `phase` are gone — there is nothing left to
desynchronise.

### 3. One cut line, and everything points at it

Three things aimed at the stretch of rope a swipe has to cross, and all three worked it
out for themselves: the marching dashes interpolated along the swaying rope 60px above the
block, the idle hand hint sat at the rope's MIDPOINT (about 180px higher), and the
tutorial's sweep hand sat at the block's anchor x — the rope's top end, not where the rope
is at the height of the dashes.

`cutGuide(sh)` is the one source now. It is published on the shape each frame (`sh.guide`),
`drawCutGuide`, `updateHints` and `Tutorial.ropeBox` all read it, and a hand cannot drift
off its own dashes because there is only one number. A real bug went with it: `toView`
rebuilt the mapped box field by field and **dropped `handX`/`handY`**, so a spot that put
its hand anywhere other than its own centre lost that the moment the puzzle zoomed — which
is every moment the rope hand is ever shown.

Both hands are also smaller, and anchored by the FINGERTIP rather than the middle of the
hand (`--tip-x`/`--tip-y`, 20%/4% of the art). Centred, the tip sat half a hand-height
above the line it was meant to be sweeping along. The idle hand goes from 5 stage units
wide to 3.4, the sweep hand from 5.6 to 3.6.

### 4. A cut rope shows where it was cut

Both halves used to be constants: the falling block carried a 34px snippet of cord whatever
happened, and 72% of the rope was left on the rig. So a swipe just under the fog and a
swipe just above the block produced exactly the same picture, and the one thing the learner
had just DONE left no trace of where they did it.

Both are measured from the crossing point now (`cutShape`, from `hit.y`): the cord below
the cut goes down with the block, the cord above it stays hanging, and the two add up to
the rope that was there. The stub's recoil is 0.78 of its length rather than 0.42 — a rope
does spring back when it parts, but it does not lose most of itself, and taking three
fifths away threw the information out again. Floors of 22px and 16px so a cut at either
extreme still parts visibly instead of looking like the knot came undone.

Nothing about the mechanic moved: where a rope may be cut is unchanged and the hit test is
still `ropeSpan`'s straight line.

### 5. There is no JUMP button

A tap anywhere already jumped, so the button was a second way to do one thing — and on a
phone it was a corner target competing with the one instruction that matters, which is
"touch the screen". Gone from the markup, the stylesheet and the HUD, along with the
pressed-art swap, the tap ring, the focus outline, `hud.flashJump()`, the keydown listener
that existed only to flash it, and `G.jumpPulse` (which had no other reader). `.tut-lift`
and `Tutorial.domSpot` went too: the button was the only DOM thing the tutorial ever
pointed at, so every subject it has left is drawn on the canvas.

The fourth tutorial line still says "Tap to jump over obstacles." — the recorded words are
now literally true — and its hand taps in open sky at stage (1080, 470), deliberately not
on an object: a finger on the rock or on Momo would read as "tap THIS", which is the
opposite of the lesson. Space / ↑ / W still jump, handled where they always were, in the
engine's own key listener.

### 6. The leap travels forward

The character's world position is fixed at `mammothX` and the ground scrolls past him,
which is what keeps the collider, the obstacle spacing and every distance in the game
arithmetic rather than simulation. The cost of it was that a jump was a pure vertical: he
rose 360px and came down on the pixel he left, like a character bouncing on a treadmill.

The DRAWN character now carries a forward offset through the flight — 0 at the take-off,
`CFG.jumpLead` (120px) by the landing, linear in time, which against a parabolic height is
exactly a projectile's arc — and over the next `jumpLeadBackS` (0.75s) of running the frame
eases back to him, so nothing accumulates across a stretch of four rocks. How far through
the flight he is comes off `vy` rather than a second clock, so it cannot disagree with the
physics and a jump cut short by a rock simply stops where it was.

**It is a draw offset and nothing else**, the same rule the whole comedy layer follows:
`mammothX` is the collider and never moves, the arc's height, airtime and press window are
untouched, and the jump is exactly as hard as it was tuned to be. `player.drawX` is the
drawn position and the contact shadow, the take-off and landing clouds and the footfall
spray all read it, so the effects travel with him. Test: game.spec "the leap travels
forward and lands ahead, without moving the collider".

---

## 13. The sign, the cut line and the jump prompt (September 2026)

### The instruction panel is a hanging board

The owner delivered a new plank — a snowy board on two ropes with a knot and a steel
eyelet at each end (`art-source/sign-hanging-src.png`, 2172 x 724).

**It is three slices, cut by `tools/make-sign.mjs`,** which measures the delivery and
prints every number the stylesheet uses. The two ends are pinned at their natural aspect
and only the middle stretches, because the panel grows with its sentence and a rope
stretched to 1.6x reads as a smear.

**The middle slice is everything BETWEEN the caps, and that is the whole trick.** The
first cut took a narrow clean sample from the centre of the board, and the joins were
visible — reported as "the crop looks visible, not a natural single hanging board". The
plank is hand-drawn, so its top edge, its pale inner panel and its bottom edge all wander
by a few pixels along its length: measured, the sample's pale panel started 6px higher and
ended 8px lower than the cap it butted against, which is a two-pixel step in the board's
own edge at each join. Cutting the middle out of the span between the caps makes both
seams continuous **by construction** — the middle's first column is the cap's next column
— and the tool now measures both joins and refuses to write files if either is more than
1px out. It also keeps the snow in the middle of the delivered board, which the narrow
sample threw away.

**The ropes are in the picture and the panel sits at `top: 0`,** so they run off the top of
the frame exactly as the ice blocks' ropes do. Everything above the plank is transparent.
That is why `--sign-h` is 9.4 stage units where the old flat art wanted 7.6: only 285 rows
of the 652 are the plank.

**It drops in and is pulled back up** (`signDrop`, `signPullUp`). The drop settles in three
decaying swings — 4%, -2.4%, 1.2% — about a pivot set above the panel where the ropes leave
the frame, because a single overshoot reads as a bounce off a floor, which is the opposite
of hanging. The exit dips before it goes, which is what makes it read as a pull rather than
a slide, and finishes inside the 300ms the HUD waits before hiding the panel. Both are off
under reduced motion. `pillIn` went with the flat sign.

The words still reveal in step with the voice (`Hud.setInstruction` spreads the reveal
across the spoken clip), and the panel still shrinks to fit its sentence — that is all the
middle slice does.

### The cut line: one height, the middle of what is on screen

Reported as the dashes being low and not lining up. Both were true, and each had its own
cause.

- **They did not line up** because the height was worked out per block, 60px above its own
  top edge — and a phase's shapes are fitted uniformly, so a triangle and a hexagon have
  tops up to forty pixels apart. Three marks that are one instruction stepped up and down
  across the row. `rowGuideY()` now sets ONE height for the whole row.
- **They were low** because 60px above the block is the bottom of the rope. The mark now
  goes on the middle of the rope — and *the middle of what is on screen*, not of the world:
  the puzzle pushes in at `zoomK` 1.24 and the push-in crops the top of the world, so the
  world middle (y 171) came out a fifth of the way down the visible rope. Solving the view
  transform for the frame's top edge (world y 109 at that zoom) puts it at y 237, which is
  the middle of the picture at any zoom, including none.
- **The dash sits ON the cord**, bend included: the guide adds the rope's bow, which is at
  its widest exactly where the mark now goes.

Everything that points at a cut reads `cutGuide` — the dashes, the idle hand, the tutorial's
sweep hand and the engine's demo stroke. That last one was a third place deriving its own
position (the rope's midpoint at the anchor's x, about 180px above the marks).

### A rope never moves on its own

Reported twice: first as the rope and the shape moving in opposite directions, then as the
two waving differently and looking detached. Both times the cause was the cord's bend having
a CLOCK.

| | what it was | why it read wrong |
|---|---|---|
| first | its own frequency (0.35Hz) with a random phase per rope, against a rig swaying at 0.22Hz | two unrelated sine waves drift in and out of step |
| second | the swing's own angular velocity | honest physics, but velocity is 90° out of phase with position, so the cord's middle still travelled on a different schedule from the block on its end |

A rope and the thing tied to it are one object, and the only way that is certain on screen
is for them to share ONE transform and nothing else. The bend is now a constant per rope
(`ropeBow`, deterministic from the shape's seed so the row is not stamped out), rotated with
the rig exactly as the block is. Test: tremble.spec "the rope moves with the block it carries
and never on its own" holds that every rope's bend is the same number after six seconds of
swinging as it was at the start.

### The jump prompt is words on Momo

No hand (asked for). A hand tapping one spot is the one thing that must not be said once the
control is the whole stage — it teaches that the spot is the control. The fourth tutorial
line keeps its recorded words, "Tap to jump over obstacles.", and its box sits on Momo, who
is the one doing the jumping. The tap hand, its press keyframes and its contact ring are gone
from the stylesheet with it; the sweep hand on the rope is the only hand left in the game.

### The cover, the PLAY button and the snow

**The banner is the owner's `FROZEN RUSH` art** (`art-source/cover-frozen-rush-2.png` →
`game/assets/art/cover.webp`, 1672 x 941, the same box as the take it replaces, so nothing
in the cover's layout moved).

**The PLAY button is the owner's stone-rimmed pair**, built by `tools/make-buttons.mjs`
from the two delivered takes. The press is in the art, as it is for every button in this
game — measured, the "pressed" take is the darker of the two (mean luminance 122 against
157), which is the family's rule holding by itself. The pair's common box changed from
1880 x 711 to 1764 x 621, and `aspect-ratio` in `screens.css` had to move with it or the
art letterboxes inside its own element and the picture stops matching the hit area.

**The snow is six-armed flakes, not dots.** Three depths: the far layer stays dots — at a
pixel and a half a dendrite is a grey smudge and costs a blit to say nothing — and the mid
and near layers are the drawn flake. Two things make them read, and both were needed:

- **The arms are fat.** A dendrite at true proportions is hairline-thin at 20px across and
  disappears; these are a cartoon flake, arms an eighth of the radius.
- **They are bigger and more solid than the dots were**: a near flake is about 22–33px
  across where the dot was 9, at 0.62–0.86 alpha where the dot was 0.3–0.46.

Each turns as it falls, at its own rate and its own direction — a flake that keeps one
orientation all the way down reads as a sticker on the screen, and the spin is the whole
difference between falling and scrolling. It goes with the rest of the motion under
`?reduced=1`.

**It is one sprite, drawn once.** A dozen strokes per flake per frame for thirty flakes is
the "gradient per particle" mistake the house rules warn about, so the flake is rasterised
into one 96px offscreen canvas the first time it is needed and blitted from then on: one
image, thirty draws, no paths. Test: ui.spec "the snow is fairy flakes, and they are
evident" — which also fails if the sprite is ever null, since that silently falls back to
dots.

### The hanging rig holds still

Reported three times — the rope and the shape moving in opposite directions, then the two
waving differently, then *still* not synced. The first two were real and are written up
above (the cord's bend had a clock, twice). The third was measured and was not:

```
135 samples over six seconds of play
  block travel  12.46 px      rope travel  11.90 px   (halfway up the cord)
  frames moving the SAME way: 130      OPPOSITE: 0
```

They were rigid, and it still looked wrong. That is not a synchronisation fault, and no
amount of correctness fixes it: a big solid block travelling 12px is visible, the thin cord
travelling the same 12px is not, and the eye reads the difference as the two coming apart.
The only thing that fixes it is for neither to move.

So `CFG.comedy.swayRad` is **0**, and that also puts the row back where this game's own rule
had it — *"the options are the question being asked and a question should hold still while
it is read"* (2026-09-04, when the sway, the arrival bounce and the missed-swipe jiggle went
together). What keeps the row alive is light rather than movement: the halo, and the sheen
sweeping the ice. The ropes still carry their fixed curve; they simply do not move. The
mechanism is untouched and one number turns it back on. Test: tremble.spec "the hanging rig
does not move: not the cord, not the ice, not ever".

### The snow is on the banner, not over the answer

Both asks, together: real flakes and evident — then fewer of them, no clutter over what the
player is reading. A flake reads by its shape and its size, not by how many there are, so
each one keeps its size and its opacity and the counts came down: mid 20 → 9, near 10 → 4,
far 34 → 26.

**Nothing falls in front of an open question.** The near layer is the only snow drawn OVER
the ice blocks, and a 30px flake tumbling across the shape a child is counting the sides of
is exactly the distraction that was asked to go — so it stops for as long as a crossing is
open (`drawFront(..., quiet)`, and `quiet` is simply "a puzzle exists"). The two layers
behind it never stop, so the weather does not blink off with the question.

**The banner is where the snowfall lives.** `.cover-snow` was six radial-gradient dots
drifting as one sheet; it is now fourteen real six-armed flakes, each with its own column,
size, fall time, head start and spin direction. They are elements rather than a background
layer for one reason: a flake has to TURN as it falls and a background cannot rotate. The
flake itself is a data-URI SVG in the stylesheet, so the layer still costs no asset and no
request. Off under reduced motion — and held part way down rather than parked at the top of
the fall, so it cannot vanish with the animation. Tests: ui.spec "the snow is fairy flakes:
evident one at a time, and few of them" and "nothing falls in front of an open question".

### The rig moves again — a little, and visibly as one piece

The still rig (above) was reviewed as dead: "add minor evident motion, but keep it in
sync". `CFG.comedy.swayRad` is 0.030 (1.7°, the block travels ~17px) and the cord's bend is
now **locked to the swing's position** (`ropeBow`): a fixed curve per rope, plus
`rope.bowSwing` (9px) times the swing's own normalised angle. So the rope is at its most
curved on the very frame the block is at its furthest — both extremes land together, which
is what "moving together" looks like on a thin line. Measured: block 17px, cord 30px at its
middle, same direction on 108 of 108 frames, opposite on none. The test holds it as a
correlation: every rope's bend against the swing, > 0.95.

The velocity-locked version is the one to avoid: it is honest physics and it is 90° out of
phase, which the eye reads as two schedules.

### The board is lowered, not swung

The first drop pivoted the sign above the frame with a 2.2° tilt, reviewed as unnatural —
and a sign on TWO ropes cannot swing like that; the ropes keep it level. `signDrop` is now a
fall: ease-in (gravity) to the mark at 44%, the ropes stretch 5% past it, then two return
bobs (−2%, +0.8%) with a third of a degree of tilt as one rope takes the weight first. 760ms
and `linear` on the outside, because each keyframe carries its own curve.

### The jump line sits in the middle

Words alone, no hand (a hand tapping one spot teaches that the spot is the control), and now
in the CENTRE of the stage rather than on Momo — asked for, and right: "Tap to jump" is an
instruction about the whole screen, and a box in the middle of the sky says "anywhere" the
way a box parked on one character cannot. The tail still leans toward Momo (`aimX`).

### The rope and the block WERE on opposite sides — a sign error, found on the fourth report

Everything above about the bend was real, and none of it was the fault the owner kept
seeing. The block is drawn with `ctx.rotate(a)` then a step of `len` down the rope, and the
canvas matrix takes (0, len) to (−len·sin a, len·cos a): a positive swing carries the block
to the **left**. `ropeSpan()` put the rope's end at `anchorX **+** sin(a)·len` — to the
right. So every hanging block and its own rope leaned to opposite sides of the anchor, up to
30px apart at the end of the arc, and swapped sides every half cycle. The hit test and the
drawn rope agreed with each other (both read `ropeSpan`), which is why no cut test caught
it; only the picture was wrong.

**Why three fixes missed it.** Each was verified by measuring the model against itself —
`sh.x` (computed with the same +sin) against the guide point (computed from `ropeSpan`,
also +sin) — and each came out "in sync" because both numbers shared the error. The proof
that finally counts reads the **backbuffer**: `qa-report/probe-pixels.mjs` finds the painted
cord just above the block and the painted ice at the block's top edge, through a full swing.
Before: the two reversed sides. After (`-sin` in `ropeSpan` and in `updateL1`'s `sh.x`):

```
38 samples, swing -0.030 .. +0.030 rad
painted rope-end minus painted block-centre:  1.7 .. 7.8 px, at BOTH ends of the arc
moving the same way: 33 frames    opposite: 1 (centroid noise)
```

**The rule this leaves behind:** when the complaint is about what is on screen, measure
the pixels. A model that is consistent with itself proves nothing about the picture.

### The flakes are smaller, softer, and have depth

Reviewed after the first flake pass: "big, and not like inside the game". Both were true.
In play a near flake reached 31px at 0.7 alpha — a third of an ice block's edge, pure white —
and on the cover the biggest was ~75px. White shapes that size and that solid sit ON the
picture; they read as stickers, not weather. Now: in play `FLAKE_K` 5.2 (near 17–24px, mid
9–15px) at 0.34–0.6 alpha; on the cover 2.0 stage units × size (17–44px) at 0.44–0.72, and
the far (small) flakes carry a per-flake `blur(0.35–1.1px)` while the near ones stay crisp.
That depth-of-field is the thing that puts them inside the scene: snow in a picture is sharp
close up and soft further back, never uniformly crisp.

---

## 14. The review round: dialogue completion, the drop, the tail, the button

### A tutorial line finishes before anything moves on

The rule, and it is now the only thing that advances a step: a line is finished when **both**
its text has fully arrived **and** its voice-over has stopped — and then it is held, complete
on screen, for a reading pause (`Tutorial.READ_PAUSE`, 1.0s, one number).

Three faults were in the way, all measured:

1. **A sentence could be replaced while its last word was still animating in.** The words
   arrive one at a time and each takes 460ms to land (`.tut-text .w`), but the beat's length
   was shared out from the clip by character count alone, so a short beat could end before its
   own reveal. `beats()` now floors every beat at `(words-1)·step + WORD_IN + SETTLE`, and
   `setWords` takes the animation and a settle off the top before spreading the words — so the
   reveal always completes inside its beat.
2. **The reading pause did not exist.** The hold was the clip plus 0.45s. It is
   `max(text, voice) + READ_PAUSE` now.
3. **The tutorial's clock was capped at 50ms a frame** — the right cap for a simulation, wrong
   for text timed against a voice, because the voice plays on the audio clock in real seconds.
   Measured on a headless run at ~8fps: the sentences arrived at a quarter speed while the
   recording ran on, and the second half of a line appeared as the voice was finishing it. The
   cap is 0.25s now (still swallowing a tab switch, tracking real time at 4fps or better).

Traced end to end with audio on, the four frozen lines:

```
 1.00s "This is Momo."            VO starts        paused
 2.34s "He needs to find his friend."
 5.02s                            VO ends
 6.71s next line                                   -> 1.69s of reading pause
 6.71s "Help Momo cross the Frozen Pass!"  VO 6.71-9.64  -> 1.36s pause
13.50s "Watch out!"                        VO 13.5-14.51 -> 1.92s pause
16.43s "Tap to jump over obstacles."       VO 16.4-18.76 -> 2.62s pause, then the world resumes
```

**Nothing interrupts it.** A new flag, `G.dialogue`, is pushed into the engine by the tutorial
(`api.setDialogue`) and two things read it: `skipPreRoll()` refuses to skip a beat while a line
is up, and `updateHints()` will not even accumulate its idle clocks, so a hand cannot appear
the instant a line ends. Measured: twelve rapid taps during line 1 changed the state, the game
clock and the sentence by nothing at all.

**The jump ask freezes until its line is finished** (`pause: 'line'`) rather than for a guessed
1.2s, so the order is always: line → voice → pause → the interaction is enabled. The rock is
frozen with everything else, so the jump is exactly as hard as it was tuned to be.

**Audio failure cannot deadlock it.** `api.say()` returns the clip's length, or 0 when it will
not be heard — muted, no context, no file, a failed decode. Nothing waits on an `ended` event,
so a line with no audio is gated on its text alone and still completes, and a clip that dies
half way through cannot hang the step.

### The sign drops straight, and never shows a cut rope end

The panel is the plank AND its two ropes, resting with its top edge on the top of the stage so
the ropes run off the frame. The first cut of `signDrop` overshot 5% DOWNWARD past that rest —
which is what a falling weight really does, and which brought the top of the element into the
picture: the ropes' cut ends appeared as two stubs hanging in the sky, 11px of them, for about
150ms, twice per crossing.

The rebound is **upward** instead: it falls to the mark, springs up, and settles back onto it.
Every keyframe is at or above the rest line. The tilt is gone too (a board on two ropes cannot
swing like a pendulum — the ropes hold it level), and so is any scaling. Measured over the
arrival: **0.00px below the rest line, 0.00px sideways, 0.000° of rotation, scale 1.000 flat,
4 direction changes** — a straight fall with two rebounds.

The exit was dipping 3.5% down before leaving, for the same reason and with the same effect;
it holds instead and then goes straight up. And the HUD will not restart a drop that is already
running (`_dropAt`, the 760ms of the animation), so rapid input or a scene change cannot stack
two arrivals on top of each other.

### The tail sits on the mammoth's head

It used to be aimed at a 165 x 205 oval around his whole body, so it landed over his back or in
the air beside him depending on the pose. His head was then measured off the delivered run sheet
— 36 frames of `mammoth-run.webp`, the median topmost opaque row and head centre column,
converted through the renderer's own cell geometry (420 x 320 cell, baseGap 27, character scale
1.75, so the drawn cell is 735 x 560):

> **the crown is 362px above the foot line and 86px right of his own x**

Both are read from the LIVE player every frame, so the anchor carries the forward offset of a
leap (`drawX`) and the hop and crouch (`feetY`), and holds through a change of sheet at any
stage size. The median rather than the per-frame top, because his head bobs 56px across a run
cycle and a box chasing it would jitter. Measured on line 1: head at (516, 478), the tail tip at
(517, 477) — **1px out on each axis** — with the box above the crown, clear of his eyes.

The one line whose box is NOT on him is the jump ask, centred on the stage on the owner's call;
its tail still leans at his head (`momoHeadX`).

### The PLAY button

Raised from 2.8% to **7%** of the stage off the bottom — at 2.8% it sat almost on the frame edge,
which on a phone in landscape is where the browser's chrome and the gesture bar arrive. And the
press keeps the resting state's box exactly: the compression is gone, so pressed is a darkening
only. Measured: resting 216x227, pressed 216x227, centre moved 0.00px.

### A voice that throws does not stop the lesson

Found by the test written for it, not by reading the code. `api.say()` returns a length, or 0
when the line will not be heard, and the completion gate is built on that — but it can also
THROW: a revoked AudioContext, a decode that blew up, a host that has torn the audio layer
down. Unguarded, that exception left `Tutorial.update()` before it had drawn anything, which
killed the animation frame driving the layer — so the tutorial stopped dead on its first line
**and the game stayed frozen behind it**, because this layer pauses the simulation while a
line is read. Measured with `say()` replaced by a thrower: not one sentence ever appeared.

Two guards, because either alone leaves a hole:

- the call is wrapped, so a throwing voice is simply a line with no voice — gated on its text
  alone, the same path muting already takes;
- and the tick behind it catches anything else, finishes the tutorial properly (which resumes
  the game and clears the overlay) and reports the fault, so no future error in this layer can
  leave a player looking at a frozen screen.

Test: fit.spec "muted, and with the voice throwing, the tutorial still shows every line and
never hangs" — it drives both the muted case and the throwing case.

---

## 15. Level 2 — "Cut the shape along its diagonal." (version 2.0.0)

Level 1 asks **which** shape. Level 2 asks **where to cut one**, and that is the whole
difference: recognition becomes construction. It was written as a draft alongside Level 1,
detached before v1 shipped, and brought back for v2 — `drafts/level-2.draft.js` is kept
verbatim as the record of the original brief, but it is no longer the source of anything.

### The run of play

```
… PHASE_DONE (the seventh crossing)
   → RUN_SEGMENT_2 → JUMP_CHALLENGE_2 → POST_JUMP_RUN_2 → GLACIER_BREAK_2
   → LEVEL_2_INTRO → LEVEL_2_FOCUS → LEVEL_2_ACTIVE ⇄ LEVEL_2_WRONG_FEEDBACK
   → LEVEL_2_SUCCESS → BRIDGE_2_COMPLETE → FINAL_RUN → COMPLETE
```

- **RUN_SEGMENT_2 …** the same three beats the game opens with — run, a rock, recover.
  There is no card and no level number: the only thing announcing a new question is the
  different thing standing on the ice. Two rocks, not one; the jump is long learned here.
- **GLACIER_BREAK_2** is the *same collapse* as Level 1's, routed through the same
  `startBreak()` with a `level` argument. Only the layout differs — everything after it
  (the skid, the quake, the crack, the fright, the water) is the identical beat.
- **LEVEL_2_INTRO** holds the slab where it stands, so it is read before it moves. The
  clock does not run while the tremble is still playing.
- **LEVEL_2_FOCUS** brings the slab to the middle of the stage at 1.22.
- **LEVEL_2_ACTIVE** is playable. Dragging is the only input.
- **LEVEL_2_WRONG_FEEDBACK** holds a nudge for `wrongMs`, then returns. Nothing is
  removed, nothing is locked out, and there is no attempt limit.
- **LEVEL_2_SUCCESS** is the answer's choreography: it parts, is held apart, goes back to
  where it was standing, and *then* each half flies to its hole.

### The mechanic

A **diagonal joins two corners that are not next to each other.** The drag is anchored on
the way down at whatever corner it starts near and committed on the lift at whatever
corner it is released over. A press with no travel commits nothing — the same guard
Level 1's swipe has, and for the same reason: an accidental commit is the worst input bug
this game can have.

Three wrong things can be done, they are three different misunderstandings, and they get
three different lines. "Wrong" alone would teach none of them apart:

| what happened | the nudge |
|---|---|
| the stroke reached no corner | *Connect two corners.* |
| it ran along a side | *That's a side — try a diagonal.* |
| it was a **short** diagonal | *Cut right across, corner to opposite corner.* |

### Only the main diagonals complete it, and that is a decision

A regular hexagon has two kinds of diagonal, and they are not interchangeable here:

- the three **main** ones (0-3, 1-4, 2-5) halve it into two congruent trapezoids, each
  `0.866R` tall;
- the six **short** ones (0-2, 1-3, …) cut off a triangle and leave a five-sided piece
  `1.5R` tall — half again as tall as the 234px cavity under the walking line.

That five-sided piece cannot bridge at *any* size. Seat it and it has to be shrunk to
0.62, and its cut edge then spans 270 over a 414 hole: daylight through the crossing, and
a plug that visibly resized on the way in, which §10 forbids. No choice of `hexR` fixes
it — the piece is tall because of the cut, not because of the size.

So the level accepts only the main diagonals. **A short diagonal is never called wrong**:
it *is* a diagonal, the learner has understood the idea, and telling them otherwise would
unteach the thing they just got right. It gets its own nudge and the corners stay live.
The nudge is tested for not containing the word "side".

### Why `hexR` is 220

Every one of these binds, and together they bracket it to 213–223:

| constraint | why |
|---|---|
| `2R(1-2·bearing) > 400` → **R > 213** | under 400 a crevasse is jumpable and the puzzle becomes optional (§6) |
| `2·gapW + ditchGap ≤ 960` → **R ≤ 223** | the pair must fit between x 900 and the 1860 the row can reach — the same wall Level 1's two crevasses hit |
| `0.866R ≤ 234` → **R ≤ 270** | a half must fit the cavity whole, or it is shrunk to fit (§10 forbids it) |

At 220: each crevasse is **414** wide, the group is **948** against Level 1's proven 950,
a half's cut edge is **440** with **13px** of bearing on each lip, and the seating fit
comes out at **exactly 1.0** — the halves land at the size they were cut.

### What it does NOT own

This is the part worth holding on to. Level 2 writes no gap record of its own, no seal, no
finished-state renderer:

- `layoutLevelTwo()` builds **Level 1's gap record, field for field** — `slots`, `pieces`,
  `throat`, `crackPts`, the lot. Everything downstream (the collapse, the water, the
  cracks, the pruner, `drawRepairedPieces`) therefore reaches it through paths that
  already existed.
- On landing, each half is pushed onto its crevasse as **an ordinary piece**, the same
  record `lockIn()` writes for a Level 1 plug. From there the mend is drawn, grown and
  frosted by the code that already does that.
- The pre-cut slab and the halves in flight are drawn with `paintIce`, the material Level
  1's chunks already fall back to when a shape has no delivered artwork. There *is* no
  picture for a piece the learner has just invented with a cut, and there could not be —
  the two halves depend on which diagonal was chosen.

### The framing is the object, not the camera

Level 1 zooms the world for a puzzle (`CFG.levelOne.zoomK`). Level 2 does not: there is
one subject, so it **moves the subject**. The slab travels to centre stage and grows to
1.22 while the question is up, and goes back when it has been answered. That is steadier
than zooming, and it leaves the character, the holes and the water exactly where the
learner last saw them.

### What was wrong with the draft, and had to change

Re-attaching was not a paste. Four things in `drafts/level-2.draft.js` were already dead:

1. **`kind: 'span'` gaps and the `piece2` seal.** Neither concept survives in the ground
   model; a crevasse carries `slots` and `pieces` now, and the ditch is cut *from* the
   piece that bridges it. Replaced with the real records, which is what deleted the
   draft's hand-rolled seal stroke entirely.
2. **`G.focus`.** The draft drove a blur-and-dim layer through it. That layer was removed
   from `render()` — the comment there records that `G.focus` was never assigned a
   non-zero value and the branch could not run. Dropped, not wired up.
3. **`G.helper`.** The draft's three feedback lines were written here, and the HUD stopped
   reading it. They go through the plank (`G.signSay`) now, the channel every other
   sentence in the game uses.
4. **`startBreak(2)` opening two fixed 320px gaps.** Sized from the hexagon instead, so
   the halves are the bridges.

### What the tests hold you to

`tests/level-two.spec.mjs`, 19 tests, and they are the contract:

- exactly 0-3, 1-4 and 2-5 are accepted; all six sides and all self-joins are refused
- each of the three main diagonals completes the level, on its own
- a side, a short diagonal and a corner-less stroke each get their **own** feedback, and
  the short-diagonal nudge never says "side"
- four wrong cuts in a row take nothing away, move nothing, and the level is still winnable
- both crevasses are over 400px, equal, and on a 1920 stage
- both halves seat at fit **1.0** and span their holes with no daylight
- the sentence avoids "regular", "irregular", "convex", "concave", "sides" — *and* any word
  that would point at one diagonal ("left", "opposite", "first"…), because there are three
  right answers
- a real pointer drag corner-to-corner cuts the slab; a tap on a corner does not

### Turning it off

`CFG.levelTwo.enabled = false` puts the game back to Level 1 only: the last mended
crossing leads straight into the run home, exactly as it did in v1. The journey's sky
bands follow it automatically (`L1_SKY_END`), and `playLevelOne()` in the test helpers
stops at either hand-over, so nothing in the suite has to know which way it is set.
