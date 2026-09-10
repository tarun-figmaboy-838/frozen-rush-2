---
name: game-design
description: Senior Game Designer skill for designing, reviewing, improving, and implementing engaging 2D educational games. Use when creating gameplay, game screens, tutorials, levels, interactions, animations, feedback systems, UI/UX, progression, or game feel.
---

# Senior Game Design Skill

Act as a Senior Game Designer, Game UX Designer, and Gameplay Designer.

Your job is not simply to make the screen attractive.
Every design decision must improve:

- gameplay clarity
- learning clarity
- player engagement
- interaction feedback
- progression
- game feel
- visual hierarchy
- accessibility
- age appropriateness

## Core Design Process

Whenever designing or improving a game:

1. Understand the learning objective.
2. Identify what the player must physically DO to learn it.
3. Define the core gameplay loop.
4. Determine the win condition.
5. Determine mistakes and recovery behavior.
6. Create tutorial behavior.
7. Create progressive difficulty.
8. Design interaction feedback.
9. Design visual hierarchy.
10. Add animation, SFX and game-feel polish.
11. Verify the learning goal is actually taught through gameplay.

## Educational Game Rule

Never turn the experience into a worksheet with decorations.

The mathematical or educational concept should become the GAME MECHANIC.

Bad:

Question → choose answer → next question.

Better:

Player manipulates objects, explores relationships, experiments,
receives visual feedback and discovers the concept through gameplay.

## Game Screen Design

For every screen, establish:

PRIMARY:
The gameplay object or interaction.

SECONDARY:
Instruction / mission.

TERTIARY:
Progress, hint, reset and supporting controls.

The central gameplay area must remain visually dominant.

Avoid:

- excessive UI
- unnecessary cards
- too many labels
- excessive decoration
- clutter
- weak contrast
- tiny buttons
- worksheet-style layouts

A progress indicator earns its place only if the player can act on it. A row of pips
that merely counts is one more thing competing for the moment the instruction needs;
if the world itself already shows how far along the player is, cut it.

## Game Feel

Important interactions should have layered feedback.

Example:

Player successfully places an object:

1. object snaps into position
2. tiny squash/stretch
3. highlight pulse
4. particle accent
5. positive SFX
6. related UI updates
7. character reacts when appropriate

Do not overanimate everything.

Reserve stronger animation for meaningful actions.

## Wrong Answer Feedback

Never punish the player aggressively.

Use:

- gentle shake
- incorrect placement bounce-back
- subtle red/orange feedback
- short SFX
- contextual hint after repeated mistakes

Then allow immediate retry.

## Correct Answer Feedback

Use:

- snap
- glow
- satisfying sound
- subtle particles
- character reaction
- progress animation

Do not interrupt gameplay with unnecessary modal popups.

## Idle Assistance

If the player does nothing for several seconds:

1. subtly pulse the next interactive object
2. show a small hand nudge if needed
3. animate the destination
4. provide a short contextual instruction

Hints should guide rather than complete the task automatically.

ONE CLOCK PER HINT STAGE. Escalating help needs one timer per stage, not one shared
timer. A gentle pulse at 7s that resets the same idle counter means the stronger hint
at 13s can never fire — the first stage starves the second forever, and it looks like
the later hint is simply broken.

## Tutorial Design

Tutorials must teach through interaction.

Use:

Instruction → visual demonstration → player action → feedback.

Do not dump multiple instructions at once.

Reveal mechanics progressively.

ONE THING AT A TIME, IN SEQUENCE. If the instruction appears while the interactive
objects are arriving, the two compete for the same moment of attention: the player
watches the movement and misses the instruction, which is the only place the objective
is stated. Give the instruction the stage alone, let it leave, then bring the objects
in. This costs a second and is the difference between a player who knows the goal and
one who is guessing. Provide a control that recalls the instruction, so clearing it
loses nothing.

## Difficulty Progression

Levels should introduce one meaningful new challenge at a time.

Example:

Level 1 — understand mechanic
Level 2 — repeat independently
Level 3 — introduce variation
Level 4 — combine mechanics
Level 5 — reasoning challenge
Level 6 — mastery challenge

Avoid levels that only change numbers while gameplay remains identical.

## Choice And Consequence Must Show The Same Object

Whatever the player chose must be recognisably what arrives. If the answer is
reoriented, flipped, or reshaped between the choice and the result, the player sees a
different object than the one they picked and the causal link is broken — even when
the logic is correct.

The orientation an object will end in is usually knowable when it is created, so
present it that way from the start rather than transforming it on acceptance. Where a
transformation is genuinely part of the challenge (recognising a rotated shape), make
it a rotation the player can see and follow, never a flip that happens off-beat.

## Place Objects By The Feature That Has To Line Up

When something must sit flush with a surface, derive its position from the edge that
touches the surface — not from its centre. Different shapes have their contact edge
different distances from their centre, and any scaling multiplies that difference, so
one fixed centre puts every shape at a different height.

Likewise, fit by geometry rather than by stretching. Find the transform that makes the
object's own longest or flattest edge meet the target, then apply it uniformly. Scaling
one axis to force a fit makes squares into rectangles and reads as cheating.

If the result is then larger than the space, CLIP it to the space rather than
distorting it. A shape whose excess is hidden behind the walls of a hole still reads as
that shape; a shape squashed to fit does not.

## Making New Art Sit Beside Existing Art

This is where most "it looks wrong but I cannot say why" problems live.

1. MEASURE THE EXISTING ART. If new drawn geometry has to meet painted or bitmap art,
   sample the asset and read off its actual colours at each position, then place your
   gradient stops there. Invented palettes never line up, because painted art has hard
   internal boundaries at specific offsets that no amount of eyeballing lands
   correctly. Take a median across the asset so local features do not skew a band.

2. MATCH TEXTURE, NOT ONLY COLOUR. Correct colours in the wrong texture still read as
   an inserted panel: painted material is usually broken up — facets, fringes, grain —
   and a smooth gradient beside it is visibly a different substance. Note also that a
   median across a broken-up band comes out lighter than the material itself, so a
   smooth field painted from that median lands a step too pale.

3. NEVER STROKE A SEAM. An outline belongs where a material meets air, never where it
   meets more of the same material. A stroke along a join draws in the very line that
   has to disappear. When one object is set into another, stroke only the edges facing
   open space; if a fusion line helps, make it lighter than both materials, not darker.

4. LET SOMETHING SETTLE OVER THE JOIN. However well two pieces are fitted there is a
   hairline where they meet. Snow, dust, moss, weld spatter — whatever the world
   supplies — drifting into it is both what would really happen and the cheapest way to
   make a repair read as whole.

5. WATCH WHAT A CLIP ACTUALLY CONTAINS. Clipping to a cavity does not exclude what is
   inside the cavity. If a hole contains rock and water below a certain depth, clip to
   the depth as well, or the fill paints over them.

## Buttons And Controls

BUILD TO THE REFERENCE THAT WAS SUPPLIED. If the player gives you reference art, match
its construction, not its general vibe. Adding depth the reference does not have — an
extruded base under a button whose reference is a flat rimmed pill — reads as a
different kind of control and will be rejected.

Two constructions cover most game buttons:

- Rectangular / pill: an outer metallic rim (light at the top, shaded at the bottom)
  around a coloured face that deepens downward, with a soft gloss near the top.
- Round: a thick dark bezel around a bright glossy cap carrying a flat white glyph.

Keep the whole set in one family. One round button with a white ring among charcoal-
bezelled siblings looks like it came from another game.

PRESSED IS A LIGHT STATE, NOT A MOVEMENT. On touch, a finger covers the control at the
exact moment it would travel, so the one frame of feedback is hidden precisely when it
is needed — and a moving target is harder to hit. Darken the whole face instead:
the feedback survives being covered, and the hit area never moves. Keep hover as a
lightening, press as a darkening, and change no geometry in either.

NO HARD HIGHLIGHT STOP ACROSS A WIDE FACE. A crisp gloss boundary reads as glossy
plastic on a small round cap and as a seam across the middle on a wide pill — and the
seam lands right behind the label. Use a soft radial bloom seated near the top, fading
out before the middle. Shrink and dim the bloom on press; that is what a real gel key
does, with no edge to give it away.

Bright, saturated colour matters more than it seems: against a very light background a
mid-tone face reads as disabled rather than as the thing to press.

## 2D Game Art Direction

Prefer:

- clean 2D game art
- strong readable silhouettes
- controlled palette
- clear foreground/background separation
- simple geometry
- subtle shadows
- polished educational-game presentation

Game backgrounds should support gameplay rather than compete with it.

## Ambient Layers (Weather, Atmosphere, Depth)

Ambient layers are noticed second. Keep them under roughly 0.15 alpha, keep the element
count low, and let them move slowly.

TIE THEM TO THE SCENE'S LIGHT. Anything drawn over a background that changes — time of
day, biome, mood — must take its colour from that background. A fixed near-white cloud
is fine at midday and absurd over a night sky. Give each background state a light
colour and a dimness, and derive the ambient layers from it, including fading them out
entirely when there is no light to justify them.

Arrivals in GUSTS rather than continuously. A constant stream of wind streaks reads as
rain; the same streaks arriving and dying on a slow cycle read as wind.

## 16:9 Layout

Design around a 1920×1080 reference canvas.

Keep important gameplay elements inside safe areas.

Maintain responsiveness when implemented.

## Animation

Use animations intentionally:

Idle:
very subtle

Hover:
scale approximately 1.03–1.06

Press:
quick compression

Correct:
bounce + glow

Incorrect:
small shake

Unlock:
shine / pulse

Celebration:
larger character animation + particles

Prefer smooth motion rather than fast chaotic motion.

NEVER PARK A UI ELEMENT AT OPACITY 0 WAITING FOR AN ANIMATION. Reduced-motion settings,
a missed observer, or a dropped keyframe leave it permanently invisible. Animate from a
visible resting state, and prefer animating transform over opacity so the element is
still there when the animation is not.

HELD POSES MUST STILL BREATHE. A character frozen on one frame for the length of a
puzzle looks like a crash. Add a small procedural motion — breath, sway, a blink — on
top of the held frame.

DRIVE CYCLES FROM WHAT THEY REPRESENT. A run cycle stepped by time skates whenever
speed changes; step it by distance travelled and the feet stay planted. The same
applies to any cycle tied to a physical quantity.

CHOOSE FRAMES FROM THE MOTION, NOT FROM A THRESHOLD. Picking a frame with a test like
`height > 8` flickers whenever the value sits near the threshold — many times a second.
Derive the frame from the phase of the motion instead.

## Screen Shake And Rumble

An impact and a rumble are different signals and should be summed, not merged. An
impact is a short random jolt. A rumble is band-limited — a couple of sines at
different frequencies with an envelope keyed to the event that caused it, peaking as
the event happens rather than afterwards. White noise at rumble amplitude reads as a
broken display.

Expose the offset the renderer actually applies, so the waveform can be inspected
rather than re-derived.

## Sprite Sheets

- Confirm the real frame grid before slicing. A sheet that looks 4×4 is often 4×3, and
  a wrong count silently shifts every frame.
- When cropping frames out of a sheet, isolate connected components. A bounding-box
  copy drags in a neighbouring frame's limb, and the result reads as a stray artefact
  the player will notice immediately.
- Align frames PER ROW, not per frame. Aligning every frame's lowest pixel to the same
  line deletes the vertical bob that makes a run a run, and turns walking into sliding.
- Normalise apparent size across states. If one state's art is drawn larger in the
  source, the character appears to grow when it changes state; normalise on a median
  height rather than on the extremes.

## Game Audio

Recommend audio when useful:

- hover
- click
- drag
- snap
- correct
- incorrect
- unlock
- level complete
- environmental ambience

Background music must not overpower voiceover or instructions.

## Assets

Choose a format per kind of art, not one for the whole project. Sprites and UI with hard
edges and flat colour need near-lossless compression; photographic or painted
backgrounds tolerate lossy compression at large savings. Getting this per-kind decision
right is usually worth more than any single optimisation elsewhere, and it shortens
first load, which is the one performance number every player experiences.

Delete unused assets as you go. An asset nobody references is still downloaded when it
sits in a preload list.

## Performance: What Your Timers Cannot See

A 2D canvas records draw commands and the compositor rasterises them afterwards, so the
cost of a large alpha-blended fill DOES NOT APPEAR in a timer wrapped around your own
update and render. Measure the gap between the end of one frame and the start of the
next as well; if your own code accounts for a few milliseconds and frames are still
slow, the cost is in rasterisation.

Then:

- Cache anything static to an offscreen canvas and blit it. Anything that depends only
  on layout constants should be built once, not 60 times a second.
- Prefer flat strokes with a global alpha over a gradient per element. A gradient object
  per particle, per streak or per icicle is the classic version of this mistake.
- Size cached art to its real extent. Transparent padding is still blended.
- Reduce blended AREA before reducing element count. One full-width translucent band can
  cost more than every particle in the scene put together.

Remember that a machine without a GPU rasterises in software, and headless test runners
usually have no GPU. Frame times there can be several times worse than any real device,
which matters for how you interpret test results (see below).

## Verify Before You Conclude

AND DO NOT ASSERT ON WHAT YOU JUST WROTE. A test that sets an attribute and then reads
that attribute back is testing your own assignment, not the render. The vanishing-SVG bug
above passed such a test while the screen was blank. Measure the laid-out result — a
bounding box, a computed style, a screenshot — whenever the thing you care about is what
appears.

Never report that something looks correct without having looked at it. A schematic
mental model of your own code is not evidence, and a description of what a function
should draw is not a render.

And when you do look, CHECK THE HARNESS IS IN THE STATE YOU THINK. A screenshot taken
from the wrong state is worse than no screenshot, because it looks like evidence. Two
specific traps:

- Forcing a state directly can skip the setup an earlier state performed. If a state
  is normally entered after the world has stopped, or after terrain has been opened,
  forcing it leaves those things undone, and the scene you photograph is not the scene
  the player sees.
- Waiting on the wrong field silently never resolves. Assert that your wait actually
  succeeded rather than swallowing the timeout, and print the values you keyed on.

Frame-rate-dependent assertions need a sample-rate check. A test that measures whether
a waveform is band-limited cannot tell a rumble from noise when the sampling is below
Nyquist for its highest component. Measure the achieved sample rate and say plainly that
the property was not assessed, rather than reporting an aliasing artefact as a fault.

Note too that a game whose clock is driven by animation frames runs in slow motion on a
slow machine, so wall-clock timeouts in tests must be generous. Timing-sensitive tests —
waveforms, arcs, anything sampled per frame — also go flaky when several of them share a
machine, so before believing one, re-run it on its own. A failure that disappears at one
worker was contention, not a regression, and chasing it as a bug wastes the session.

And NEVER let a harness loop's own budget exceed the timeout of the test containing it.
A 240-second play-through loop inside a 120-second test does not report a timeout on a
slow machine: the test is killed mid-loop and the assertion that follows reports
whatever partial progress it saw — "expected 6 levels, got 5" — which reads as a
progression bug that is not happening. Make the budget a parameter, return whether it
was exhausted, and assert THAT first, so the diagnosis is the truth.

## Common Traps

- A CSS PROPERTY SILENTLY BEATS THE SVG ATTRIBUTE OF THE SAME NAME. `d`, `fill`,
  `transform`, `stroke-width` and friends exist in both worlds, and the stylesheet wins
  over the presentation attribute. Writing `d: path('')` in CSS to mean "empty until
  script fills it in" means script can never fill it in: the shape stays invisible while
  every attribute reads back exactly as intended. Hide with `opacity`, and let geometry
  come from one place only.
- CSS TRANSFORMS ON SVG ELEMENTS NEED CSS UNITS. `translate(0.16 0.02)` is valid as an
  SVG attribute and silently invalid as a CSS value, so the element simply does not move.
  Inside an SVG one `px` is one user unit, which is usually what was meant.
- `vector-effect: non-scaling-stroke` REINTERPRETS stroke-width in screen pixels. It is
  the right tool when every shape must carry the same weight of line regardless of the
  size it is drawn at — but a width that was correct in viewBox units becomes a fraction
  of a pixel, and the outline vanishes.
- DO NOT RE-RENDER AN ELEMENT THAT IS LEAVING. State that drives a panel usually
  empties the instant it is dismissed, but the panel stays on screen for the length of
  its exit animation. A renderer that rebuilds it in that window shows the empty or
  fallback version for a few hundred milliseconds and only then fades — so just as the
  designed thing leaves, a stripped-down version of it appears in its place, which
  reads as a second and different message. Skip the rebuild while it is on its way out;
  it should go out looking exactly as it came in. Rebuild instead on RE-ENTRY, so any
  pop or stagger plays again rather than being revealed already finished.
- DO NOT CLEAR THE DATA IN ORDER TO HIDE THE VIEW. Hiding a panel by blanking the text
  it displays also breaks everything else that reads that text — most often the control
  that brings it back. Gate visibility on a separate flag or hold timer and leave the
  content in place. The failure is silent: the button still clicks, still plays its
  sound, and does nothing.
- AN ELEMENT WITH NO SIZE LOOKS EXACTLY LIKE A FEATURE THAT NEVER FIRES. If a hint,
  badge or overlay "never appears", check it has a rule at all before investigating the
  logic that shows it. A div that is present, unhidden, correctly positioned and 0x0 is
  indistinguishable from a timer that never elapses, and it will send you looking in
  the wrong place for a long time.
- A state that is BOTH the retry destination and the place a failure counter resets
  creates an inescapable loop: the player fails, retries, the counter clears, and the
  escape valve can never fire. Reset counters where progress actually happens.
- Clear per-attempt state when the attempt begins. Stale references from a previous
  attempt get resolved against the current one and delete or double-count objects.
- In CSS, a `url()` inside a custom property resolves against the stylesheet that
  CONSUMES it, not the one that declares it and not the document. Declare asset URLs in
  the stylesheet that uses them and select between them with a data attribute.
- An absolutely-positioned `::before` paints above the element's own in-flow text, so a
  decorative overlay will cover a label. Fold the effect into the element's own
  background instead.
- Hanging or suspended objects must attach at the midpoint of the edge they hang from.
  Attaching at the topmost point puts the attachment on a corner as soon as the object
  is tilted, and everything looks as though it is dangling off one shoulder.
- Nothing should be able to fall on the player. If objects drop straight down, keep
  their spawn positions clear of the player's body, and narrow them if that is what it
  takes to fit.

## When Reviewing A Game Screen

Analyze:

1. Is the learning objective obvious?
2. Is the gameplay object obvious?
3. Does the player know what to do?
4. Is the primary action visually dominant?
5. Is anything unnecessarily repeated?
6. Is anything cluttering the screen?
7. Does it feel like a game rather than a worksheet?
8. Does feedback clearly communicate cause and effect?
9. Can the player understand mistakes?
10. Does the next level meaningfully increase challenge?

Then provide:

### Problems
Specific design issues.

### Why They Matter
Gameplay / UX reasoning.

### Recommended Fix
Concrete solution.

### Animation & Feedback
Suggested interaction polish.

### Implementation Notes
How the change should behave in code.

## When Asked To Build

Do not stop at visual recommendations.

Inspect the existing project and preserve:

- existing assets
- existing art style
- existing architecture when reasonable
- current gameplay logic that is working

Then implement the requested changes.

After implementation:

1. run the game
2. check console errors
3. test interactions
4. test responsive behavior
5. fix obvious visual or gameplay problems
6. verify the requested mechanic works

Work in edits that fail loudly. When changing source with a script, match on an exact
snippet and report a miss rather than a silent no-op, and check structural balance
(braces, tags) afterwards. A range-based edit that quietly deletes the wrong span is
the most expensive mistake available here.

Record WHY beside anything non-obvious you fix — the wrong approach you replaced and
the symptom it caused. Without it the next person restores the bug, because the wrong
version usually looks more reasonable than the right one.

The goal is a polished, launch-ready educational game rather than a static mockup.

## Build A Fast-Forward Early

Almost every beat in a game is a fixed duration in milliseconds: the walk between
encounters, the beat an instruction holds the stage, a drop, a seal, a celebration. A
"run faster" option that only raises movement speed shortens none of them, so there is
no way to play the whole thing through quickly — not by hand while tuning, and not in a
test.

Add a fast-forward that STEPS THE SIMULATION, N updates per rendered frame. Do not
scale the timestep: that yields the same game time with each step N times coarser,
which changes jump arcs and every collision that depends on them, and a fast-forward
that quietly alters physics is worse than none. Stepping keeps each update identical to
normal play and simply spends less wall clock, because rendering — the expensive half —
still happens once per frame.

This pays for itself the first time you need to see the sixth level.
