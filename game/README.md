# Ice Age Mammoth Runner

A 2D side-scrolling educational runner. The mammoth runs through a frozen
world, jumps ice crystals, and cannot continue when a glacier breaks the path
— the learner repairs it with geometry.

```
RUN → JUMP → GLACIER BREAK → GEOMETRY PUZZLE → REPAIR → RUN → …
```

**Level 1** — seven crossings of polygon recognition, from "Cut the triangle." to
"Cut all the hexagons."  Ice chunks hang on frozen ropes; swipe across a rope to
drop that chunk. The right polygon wedges into the crevasse and the ice grows out
to meet it; a wrong one falls into the meltwater and splashes, and the crossing
stays open so you try again. Nothing is lost and nothing is scored.

The rule being taught is the number of sides — so a hexagon still counts when it is
irregular, and a heptagon still counts when it is concave. The full curriculum, and
what a brief may and may not ask of it, is in [RUNNER.md](../RUNNER.md).

**Level 2** — "Cut the shape along its diagonal."  Drafted and parked in
`drafts/level-2.draft.js`; not in the game.

## Run it

Serve the folder over HTTP (the code uses ES modules, which browsers block on
`file://`):

```bash
cd game
python3 -m http.server 8080
# then open http://localhost:8080
```

## Structure

```
game/
├── index.html          markup: canvas + HUD
├── css/
│   ├── style.css       shell, HUD, overlays, keyframes
│   └── screens.css     the cover, and the whole button family
├── js/
│   ├── main.js         entry point — boots the engine, wires the HUD, URL flags
│   ├── hud.js          all DOM outside the canvas
│   ├── frontend.js     the cover screen, and the Ouch panel's hero
│   ├── polygons.js     14 verified geometries — the one definition of each
│   ├── option-shapes.js GENERATED: the traced ring + texture of each ice block
│   ├── engine.js       the game itself (canvas, no dependencies)
│   └── game.bundle.js  GENERATED: all of the above as one classic script, so
│                       index.html also opens straight off the disk
└── assets/
    ├── sky/01-dawn.webp … 08-night.webp   8 skies, dawn → night
    ├── env/path.webp                      tiling foreground path
    ├── env/rock-wide.webp, rock-tall.webp jumpable obstacles
    ├── env/rope.webp                      the rope the chunks hang on
    ├── char/mammoth-run.webp              36-frame run cycle (420×320 cells)
    ├── char/mammoth-jump.webp             10-frame jump arc (420×320 cells)
    ├── char/mammoth-skid.webp             36-frame skid to a halt (420×320 cells)
    ├── option-shape/*.webp                one painted ice block per named shape
    ├── ui/plank-l/m/r.webp                the hanging instruction plank, in three
    │                                      slices so it grows with its sentence
    ├── ui/btn-play*.webp                   the picture buttons
    └── audio/*.mp3                        one music bed, six recorded cues
```

Everything under `assets` whose extension is `.png` or `.gif` is a BUILD INPUT, not
part of the site — see the two `.vercelignore` files and `tools/`.

`engine.js` holds the modules described below and exports two things:
`CFG` (all tuning values) and `createGame(canvas, hooks)`.

| Module | Responsibility |
| --- | --- |
| `createGame()` closure | the state machine (`RUN_SEGMENT_1` … `COMPLETE`), the level-1 puzzle, input, and the renderer |
| `PlayerController` | sprite state → frame selection, jump physics, coyote time, and the cartoon reaction layer |
| `GroundManager` | path tiling (mirrored alternate tiles), crevasses, broken lips, repaired plugs |
| `BackgroundTimeManager` | 8-phase day cycle with 1.5s crossfades |
| `Atmosphere` | clouds, snowfall, wind, aurora, frost |
| `ObstacleController` | rock spawn, telegraph, forgiving collisions, three-strike crumble |
| `PolygonFactory` | rings from `polygons.js` / `option-shapes.js`, seating, uniform fitting |
| `ParticleManager` | snow puffs, ice chips, splash, frost, sweat, sparkles |
| `AudioManager` | a synthesised palette, with six recorded cues layered over it |

`MammothController`, `WorldScroller`, `LevelOnePuzzle`, `LevelTwoCutPuzzle`,
`PolygonCutManager`, `FeedbackFX` and `HintManager` were names in an earlier plan and
are not classes in the file. The level-1 puzzle, the feedback and the hints all live
inside the `createGame()` closure.

## Controls

| Input | Action |
| --- | --- |
| `Space` / `↑` / `W` | jump |
| Tap / click anywhere on the stage | jump — there is no button, the stage is the control |
| Click-drag / swipe across a rope | cut it — the only puzzle input |
| Tap the mammoth | he toots and bounces. Changes nothing. |

There is no pause or mute control: the icon cluster that used to sit top-right was
removed. `?sound=0` and `?reduced=1` are the only way to set either.

Jumping allows ~90ms of coyote time and a ~110ms input buffer, and the
collision box is the mammoth's footprint rather than its full sprite, so the
timing window has about 0.26s of slack.

## Design rules baked in

- **No fail state.** Hitting a crystal is a stumble, a bonk and a short freeze;
  the crystal is pushed ahead and you carry on. Three bumps and it crumbles so
  progress can never deadlock.
- **Time follows milestones, not the clock.** Each flow state owns a slice of
  the day; the puzzle states hold the sky still, so a learner can think for ten
  minutes without skipping to night.
- **Colour never gives the answer.** Every option shares one ice material, so
  recognition comes from counting sides — and only from that. A hexagon counts
  whether it is regular, irregular or concave.
- **Hints escalate only on wrong attempts** (or genuine inactivity), and always
  time out.

## Tuning

Everything lives in `CFG` at the top of `js/engine.js`: run speed, gravity and
jump velocity, sprite cell size and fps, the phase → background mapping and its
progress thresholds, hint delays, vertex snap tolerance and the palette.

The curriculum is `CFG.levelOne.phases` — one entry per crossing, carrying its
instruction, its target and distractor geometries, how many crevasses open and how
many chunks hang. Adding or reordering a crossing is a data change; `runMs` moves
with it. Geometry itself is never defined there: a phase names a shape from
`js/polygons.js`, which is the single authority for all fourteen of them.

URL overrides for playtesting: `?speed=300–900`, `?sound=0`, `?reduced=1`,
`?skip=1`, `?fast=1–8`.

## Audio

All sound is synthesised in the browser behind `AudioManager` (wind ambience,
snow steps, whoosh, thud, ice chime, bonk, rumble, slice, clunk, frost sweep,
success accent). Browsers require a gesture before audio starts, so the first
tap or key press turns it on. To use real recordings, replace the method bodies
in `AudioManager` — no gameplay code refers to sound directly.

## Accessibility

- Honours `prefers-reduced-motion`: less shake, fewer particles, calmer sky.
- Wrong answers read through motion and form, not colour alone; correct answers
  read through fit, frost and sound.
- No flashing or strobing effects.
- Portrait phones get a "rotate your device" prompt instead of a squashed 16:9
  stage.
