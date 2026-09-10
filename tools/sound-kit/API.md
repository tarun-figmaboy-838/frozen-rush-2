# Sound kit — API reference

Six files. Two ship with your game; the rest are authoring tools you run from
the VS Code terminal.

| File | Role | Ships in build? |
| --- | --- | --- |
| `sfx.js` | 45 effects, mixing, ducking, voice caps, key, comic timing | yes (~40 KB) |
| `pack.js` | Plays sampled effects and voice-over through the same mix | yes (~7 KB) |
| `fetch-sounds.js` | Freesound APIv2 client — pulls CC0 files into the project | no |
| `sounds.config.json` | Maps your event names to Freesound search queries | no |
| `tools/measure-loudness.js` | Renders every sound offline and derives its trim | no |
| `tools/verify-mix.js` | Proves ducking, levels and headroom by rendering them | no |

Synth first, samples only where synthesis can't reach.

## The mix

Everything goes through one graph. This is the part that matters for a game
with spoken instruction.

```
       recipes ──┐
  Pack.play(...) ─┴── sfxBus ───┐     ducked under speech
         music ────── musicBus ─┼──── master ── soft clip ── analyser ── out
  Pack.speak(...) ─── voiceBus ─┘     never ducked; triggers the duck
```

Three problems this solves that the one-shot version had:

**Speech was drowned.** Anything on `voiceBus` pulls `sfxBus` down to 25% and
`musicBus` to 15%, then releases. `Pack.speak()` holds the duck for the clip's
real length. Overlapping clips hold it until the last one ends — it is a
counter, not a flag.

**Bursts clipped.** Twenty cues in one frame peaked at 8.14 (full scale is
1.0). Per-sound voice caps bring that to 2.01 by stealing the oldest copy, and
the soft clip brings it to 0.93. Both numbers come from `verify-mix.js`.

**Levels were guessed.** Measured across the sounds, the spread was 26.8 dB —
`click` sat 27 dB under `powerDown`. Each sound is now trimmed to a per-family
target; verification puts the worst deviation at 0.5 dB.

| Family | Target | Reasoning |
| --- | --- | --- |
| Interface | −27 LUFS | Present, never obtrusive |
| Setup | −24 LUFS | `ratchet`, `anticipate` — must sit *under* the payoff |
| Movement | −23 LUFS | |
| Cartoon | −22 LUFS | |
| Comic | −21 LUFS | |
| Rewards | −20 LUFS | The thing the child is playing for |
| Punchline | −19 LUFS | `sadTrombone`, `rimshot`, `drumroll` |
| Drama | −18 LUFS | |

Those targets are a mix decision, not normalisation. Flattening all forty-five
to one number would make a UI tick as loud as an explosion, and would put a
wind-up at the same level as the gag it sets up.

## Comedy

Everything above is hygiene. None of it makes a sound funny. Three things do.

### Key

The reason a Mario coin is charming is not that it is funny — it is that it is
*consonant*. The coin is B5 to E6, a perfect fourth, pitched to sit in the
level music. Every Nintendo cue is scored to the soundtrack.

```js
SFX.key('C pentatonic');   // nothing in it can clash. Best default.
SFX.key('D minor');
SFX.key(null);             // off
```

Sustained notes snap to the nearest tone in the scale. Glides never snap: a
jump sweep or a laser drop is a gesture, not a note, and quantising it would
flatten the gesture. Scales available: `chromatic`, `major`, `minor`,
`pentatonic`, `minorPentatonic`, `blues`, `wholeTone`, `lydian`.

For a children's game, set pentatonic and stop thinking about it. Every cue
will agree with every other cue and with any bed you add later.

### Vocabulary

The arcade families are 8-bit vocabulary — blips, sweeps, noise bursts. Comic
scoring uses different gestures:

| Sound | What it is |
| --- | --- |
| `sadTrombone` | Wah-wah-wah-waaah. The most legible comic failure there is |
| `rimshot` | Ba-dum-tss |
| `drumroll` | Snare roll into a crash. Use before a reveal |
| `bonk` | Wood block. Dry, pitched, no tail |
| `doink` | Rounder bonk with rubber in it |
| `ratchet` | Accelerating wind-up |
| `anticipate` | Rising tension. Pairs with any payoff |
| `zip` | Fast rising whip |
| `recordScratch` | The needle coming off |
| `cuckoo` | Falling minor third, flute-like |
| `rubberChicken` | Squawk |
| `ricochet` | Pew-ee-ow, three decaying bounces |
| `pianoRun` | Descending run. Lands in tune when a key is set |
| `fallingWhistle` | The long descent before something lands |
| `kazoo` | Buzzy and nasal |

### Timing

Comedy is structure, and `vary` actively fights it — randomising every shot is
right for avoiding fatigue and wrong for a gag. Three helpers give repetition
a shape.

```js
// Rule of three: two setups, then the pattern breaks
SFX.gag('coin', 'sadTrombone');        // -> false, false, true, false...

// Escalation: each repeat steps up the scale, resets after a pause
SFX.escalate('coin');                  // -> 1, 2, 3... returns the run length

// Anticipation and payoff, scheduled on the audio clock
SFX.sequence(['ratchet', 0.52, 'boing']);
SFX.sequence(['drumroll', 1.22, 'rimshot']);
SFX.sequence([{ sound: 'coin', pitch: 1 }, 0.12, { sound: 'coin', pitch: 1.5 }]);
```

`sequence` schedules everything up front rather than through `setTimeout`,
because a gag that is 40 ms late is not a gag. Numbers in the array are gaps in
seconds; strings and objects are cues.

| Call | Returns | Notes |
| --- | --- | --- |
| `SFX.key(spec)` | string or `null` | `'C pentatonic'`, `'D minor'`, `null` to disable |
| `SFX.keys()` | string[] | Available scales |
| `SFX.snap(hz)` | number | Nearest in-key frequency. For your own recipes |
| `SFX.gag(setup, punch, opts?)` | boolean | `true` on the punchline. `opts.every` (3) |
| `SFX.escalate(name, opts?)` | number | `opts.step` (2 semitones), `cap` (7), `resetAfter` (1.8 s) |
| `SFX.sequence(items, opts?)` | number | Total length in seconds |

---

## 1. VS Code setup

```
your-game/
├─ .env                    ← FREESOUND_KEY, never committed
├─ .gitignore
├─ .vscode/tasks.json
├─ fetch-sounds.js
├─ sounds.config.json
├─ src/
│  ├─ sfx.js
│  └─ pack.js
├─ assets/audio/           ← written by fetch-sounds.js
└─ index.html
```

**Requirements:** Node 18 or newer (`node -v`) for global `fetch`. No `npm install`.

**Key:** request one at <https://freesound.org/apiv2/apply> — free, needs a
Freesound account. Then create `.env`:

```
FREESOUND_KEY=your_key_here
```

**`.gitignore`:**

```
.env
```

**Serve the folder, don't open the file.** `pack.js` uses `fetch()`, which is
blocked under `file://`. Install the Live Server extension and use *Open with
Live Server*, or run `npx serve` / `python3 -m http.server 8000`. `sfx.js`
alone works fine over `file://` — it has nothing to load.

**`.vscode/tasks.json`** so you can run the fetcher from the command palette
(*Tasks: Run Task*):

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Fetch sounds",
      "type": "shell",
      "command": "node fetch-sounds.js",
      "problemMatcher": [],
      "presentation": { "reveal": "always", "panel": "dedicated" }
    },
    {
      "label": "Fetch sounds (dry run)",
      "type": "shell",
      "command": "node fetch-sounds.js --dry-run",
      "problemMatcher": []
    }
  ]
}
```

**IntelliSense.** Add a `jsconfig.json` at the root so VS Code indexes your
plain scripts and completes `SFX.` and `Pack.`:

```json
{
  "compilerOptions": { "target": "ES2020", "checkJs": false },
  "include": ["src/**/*.js", "*.js"]
}
```

---

## 2. `sfx.js` — runtime synth

```html
<script src="src/sfx.js"></script>
<script>SFX.play('coin');</script>
```

### Methods

| Call | Returns | Notes |
| --- | --- | --- |
| `SFX.play(name, opts?)` | — | Main entry point |
| `SFX.coin(opts?)` | — | Shorthand exists for every name |
| `SFX.volume(v)` | number | Master, `0`–`1` |
| `SFX.mute(v?)` | boolean | Omit `v` to toggle |
| `SFX.isMuted()` | boolean | |
| `SFX.list()` | string[] | All registered names |
| `SFX.duck()` | function | Ducks until you call the returned release |
| `SFX.duckFor(seconds)` | — | Ducks for an exact span on the audio clock |
| `SFX.isDucked()` | boolean | |
| `SFX.bus()` | GainNode | Effects. Ducked under speech |
| `SFX.voiceBus()` | GainNode | Speech. Never ducked; triggers the duck |
| `SFX.musicBus()` | GainNode | Music. Ducks harder than effects |
| `SFX.masterBus()` | GainNode | Post-fader, pre-clip |
| `SFX.analyser()` | AnalyserNode | Post-clip, for meters |
| `SFX.state()` | object | `{volume, muted}` — for your save file |
| `SFX.restore(state)` | — | Apply a saved state at boot |
| `SFX.configure(opts)` | object | See below. Rewires live |
| `SFX.trim(name, v?)` | number | Read or override a measured trim |
| `SFX.define(name, fn, meta?)` | — | `fn(startTime, pitch)`; meta `{trim, duration}` |
| `SFX.unlock()` | AudioContext | Called automatically on first gesture |
| `SFX.context` | AudioContext | `null` until unlocked |

### `configure`

| Key | Default | Effect |
| --- | --- | --- |
| `maxVoices` | `4` | Concurrent copies per sound; oldest is stolen beyond this |
| `duckTo` | `0.25` | Effects bus gain while speech plays |
| `duckMusicTo` | `0.15` | Music bus gain while speech plays |
| `duckAttack` | `0.08` | Seconds down |
| `duckRelease` | `0.30` | Seconds back up |
| `limiter` | `true` | Soft clip on the master |
| `clipKnee` | `0.70` | Amplitude below which the clip is exactly unity |

### `opts`

| Key | Default | Effect |
| --- | --- | --- |
| `volume` | `1` | Scales this shot only |
| `pitch` | `1` | Frequency multiplier. `0.5` = octave down |
| `vary` | `0.05` | Random pitch jitter, ±5%. Set `0` for exact repeats |
| `trim` | `true` | `false` bypasses calibration. Only the measuring tool wants this |
| `delay` | `0` | Seconds ahead to schedule, on the audio clock |

### Names

| Family | Names |
| --- | --- |
| Rewards | `coin` `gem` `powerUp` `levelUp` `sparkle` `correct` |
| Movement | `jump` `doubleJump` `boing` `swoosh` `slice` `land` |
| Cartoon | `pop` `bubble` `squeak` `splat` `honk` `slideWhistle` |
| Interface | `click` `select` `tick` `wrong` `error` `menuWhoosh` |
| Drama | `laser` `explode` `hurt` `gameOver` `alarm` `powerDown` |
| Comedy | `sadTrombone` `rimshot` `drumroll` `bonk` `doink` `cuckoo` `rubberChicken` `kazoo` |
| Comic gestures | `ratchet` `anticipate` `zip` `recordScratch` `ricochet` `pianoRun` `fallingWhistle` |

### Custom sounds

Three primitives are exposed: `SFX._blip` (pitched tone), `SFX._hiss`
(filtered noise), `SFX._wobbler` (wobbling pitch).

```js
SFX.define('bigCoin', function (t, p) {
  SFX._blip({ at: t,        from: 988 * p,  dur: 0.07, type: 'square', vol: 0.3 });
  SFX._blip({ at: t + 0.07, from: 1568 * p, dur: 0.5,  type: 'square', vol: 0.3 });
});

SFX.bigCoin();
```

`_blip` takes `{ at, from, to, dur, type, vol, attack, glide, filter, tonal }`
where `filter` is `{ type, from, to, q }`. A blip with no `to` is treated as a
note and snapped to the key; pass `tonal: false` to opt out. `_hiss` takes
`{ at, from, to, dur, filter, q, vol, attack }` — `from`/`to` are filter
frequencies, not pitch.

**Unlock timing.** Browsers keep audio suspended until a real user gesture.
`sfx.js` listens for the first `pointerdown` / `keydown` / `touchstart` and
resumes itself. If your first sound must fire from a timer with no prior
interaction, it will be silent — put a Start button on the title screen.

**Backgrounding.** On a tablet the context suspends when the app loses focus
and does not reliably come back. `sfx.js` handles `visibilitychange`,
suspending on hide and resuming on show, and drops any duck that was open when
the app went away — otherwise effects stay at 25% forever after a home-button
press. That one only shows up on a real device.

**Offline rendering.** `sfx.js` will not auto-resume an `OfflineAudioContext`,
so you can render it headlessly. That is how the tools below work.

### Calibration tools

```bash
node tools/measure-loudness.js          # measure and write tools/calibration.json
node tools/measure-loudness.js --trims  # also print the TRIM literal
node tools/verify-mix.js                # render-test levels, ducking, headroom
```

`measure-loudness.js` renders each recipe through an `OfflineAudioContext` and
takes the maximum short-term K-weighted loudness over a 100 ms sliding window
(ITU-R BS.1770 filters, ungated). Integrated LUFS needs 400 ms blocks and
gating, which is meaningless for a 30 ms click; the sliding peak works for both
a click and an explosion. It also measures each sound's decay to −60 dBFS,
which is what the voice-stealing logic uses to retire finished voices.

Every sound is rendered seven times and averaged in the power domain. Noise
recipes read a random offset into a freshly generated buffer, so a single
render of a 35 ms click can sit 3 dB from its own mean — calibrating from one
draw bakes that error into the trim. Averaging took the worst residual
deviation from 3.5 dB to 0.5 dB.

The `TRIM` and `DUR` tables in `sfx.js` are generated. Change a recipe, re-run
the tool, paste the tables back. Don't hand-edit them.

**Why not `DynamicsCompressor` for the limiter.** It applies an internal makeup
gain — measured at +3.4 dB with limiter settings — which is not in the spec and
differs between engines. It would have silently undone the calibration, by a
different amount in Chrome than in Firefox. The soft clip is a `WaveShaper`
curve instead: fully specified, identical everywhere, exactly unity below the
knee, and incapable of boosting.

---

## 3. `fetch-sounds.js` — Freesound APIv2 client

```bash
node fetch-sounds.js --search "cartoon boing"   # browse, download nothing
node fetch-sounds.js --dry-run                  # show picks, download nothing
node fetch-sounds.js                            # fetch everything in the config
node fetch-sounds.js --only coin,jump           # fetch specific keys
node fetch-sounds.js --force                    # replace existing files
node fetch-sounds.js --out src/audio            # override output folder
```

Workflow: `--search` to find a query that returns good hits → paste it into
`sounds.config.json` → `--dry-run` to confirm the pick → run for real.
Existing files are skipped, so re-running is cheap.

### Config

```json
{
  "out": "assets/audio",
  "format": "preview-hq-mp3",
  "defaults": { "maxDuration": 2.5, "minRating": 3, "singleEvent": true },
  "sounds": {
    "coin":  { "query": "coin pickup collect game" },
    "boing": { "query": "boing spring bounce cartoon", "take": 2 }
  }
}
```

| Key | Default | Meaning |
| --- | --- | --- |
| `query` | — | Freesound text search |
| `take` | `0` | Which result to keep. `2` = third hit |
| `minDuration` / `maxDuration` | `0.05` / `3` | Seconds |
| `minRating` | — | `avg_rating` floor, 0–5 |
| `singleEvent` | — | `true` filters to one discrete sound, not a montage |
| `type` | — | `wav`, `aiff`, `flac`… filters the *original* format |
| `sort` | `downloads_desc` | Also `rating_desc`, `score`, `duration_asc` |
| `extraFilter` | — | Raw Solr appended to the filter string |

`format` is one of `preview-hq-mp3` (~128 kbps), `preview-lq-mp3` (~64),
`preview-hq-ogg` (~192), `preview-lq-ogg` (~80).

### Outputs

- `assets/audio/<key>.mp3` — one file per config key
- `assets/audio/manifest.json` — key → file, id, name, author, licence, source
- `assets/audio/CREDITS.md` — traceability table

### Licence handling

The script hard-filters to `license:"Creative Commons 0"` and there is no flag
to widen it. CC0 is public domain: commercial use, modification and
redistribution, no attribution required. The other two Freesound licences are
Attribution (credit required, workable) and Attribution NonCommercial (kills a
paid release). Keeping the filter closed means you never have to audit a
build. If you want a CC-BY sound, download it by hand and record it yourself.

### The OAuth2 limitation

Freesound has two download routes. The original-quality endpoint
(`/sounds/<id>/download/`) requires OAuth2 — an authorisation flow with a
redirect URL and 24-hour access tokens. Previews require only the API key.
This script uses previews, which is why it needs one line in `.env` instead of
a login flow. The cost is transcoded audio rather than the uploader's original
WAV. For short game effects mixed under gameplay that difference is inaudible;
for a title-screen music bed, download by hand.

### Rate limits

350 ms between requests, automatic backoff on 429, up to 3 retries on 5xx.
A full 22-sound config takes about 15 seconds.

---

## 4. `pack.js` — sampled effects and voice-over

```html
<script src="src/sfx.js"></script>
<script src="src/pack.js"></script>
<script>
  Promise.all([
    Pack.load('assets/audio/manifest.json'),   // effects
    Pack.load('assets/vo/manifest.json')       // voice-over, merged in
  ]).then(function () {
    Pack.play('coin');
    Pack.speak('now_measure_the_angle');       // effects duck for its length
  });
</script>
```

Decodes each file once into an AudioBuffer at load, then plays from memory. No
per-shot decode, no latency. `load()` is additive, so effects and voice-over
can live in separate manifests and share one store.

| Call | Returns | Notes |
| --- | --- | --- |
| `Pack.load(url, opts?)` | `Promise<string[]>` | Names that decoded. `opts.concurrency` (6), `opts.onProgress(done, total, name)` |
| `Pack.play(name, opts?)` | source node | Effects bus. `{ volume, rate, vary, delay, loop }` |
| `Pack.speak(name, opts?)` | `Promise<void>` | Voice bus. Ducks everything else. Resolves on end |
| `Pack.stopSpeaking()` | — | Cuts speech short and releases the duck |
| `Pack.isSpeaking()` | boolean | |
| `Pack.playOrSynth(name, opts?)` | node or `null` | Sample if loaded, else `SFX.play` |
| `Pack.duration(name)` | number | Seconds |
| `Pack.info(name)` | object | Manifest entry: author, licence, source |
| `Pack.has(name)` / `.list()` / `.isLoaded()` | | |

### Voice-over

`speak()` is the reason the buses exist. It routes to `voiceBus`, which is
never ducked, and holds a duck on effects and music for exactly as long as the
clip runs — the duck is held by the clip, not by a timer, so it can't drift
out of sync or get stranded open.

```js
// Sequential instruction, effects stay down across the whole run
await Pack.speak('find_the_right_angle');
await Pack.speak('try_the_next_one');

// Barge-in: kill the narration when the child acts
canvas.addEventListener('pointerdown', function () {
  if (Pack.isSpeaking()) Pack.stopSpeaking();
});
```

`speak()` sets `vary: 0` by default. Pitch jitter that makes a coin sound
lively makes a narrator sound broken.

If you already play voice through `<audio>` elements rather than buffers, wire
them in instead of rewriting:

```js
var el = document.getElementById('vo');
var node = SFX.context.createMediaElementSource(el);
node.connect(SFX.voiceBus());

el.addEventListener('play',  function () { el._duck = SFX.duck(); });
el.addEventListener('ended', function () { el._duck && el._duck(); });
el.addEventListener('pause', function () { el._duck && el._duck(); });
```

## 5. Wiring into a game

Route audio through one place rather than scattering `SFX.play` across the
codebase. Event names decouple game logic from sound choices.

```js
// audio.js
const CUES = {
  angleCorrect:  'correct',
  angleWrong:    'wrong',
  shipCollected: 'coin',
  levelFinished: 'levelUp',
  buttonPressed: 'click'
};

export function cue(event, opts) {
  const name = CUES[event];
  if (!name) return;
  window.Pack ? Pack.playOrSynth(name, opts) : SFX.play(name, opts);
}

export function say(clip) {
  return window.Pack ? Pack.speak(clip) : Promise.resolve();
}

export function bootAudio(saved) {
  SFX.restore(saved);            // {volume, muted} from your save file
}
```

Then `cue('angleCorrect')` and `await say('measure_the_angle')` at the call
site. Swapping a synth sound for a sampled one is a one-line edit in `CUES`.

Worth doing for a children's game:

- **Vary a repeated cue.** Rising pitch on a streak reads as progress:
  `cue('shipCollected', { pitch: 1 + streak * 0.06 })`.
- **Persist mute.** `SFX.state()` returns `{volume, muted}`; store it with the
  rest of your game state and pass it to `SFX.restore()` at boot. `sfx.js`
  does no storage of its own, deliberately.
- **Let speech win.** Don't fire a reward cue and an instruction in the same
  frame. Ducking keeps the instruction audible, but a cue on top of the first
  syllable still costs comprehension. `await say(...)` then `cue(...)`.

## 6. Honest limits

**Synthesis covers** 8-bit and cartoon material: coins, blips, boings, zaps,
whooshes, buzzers, fanfares.

**Synthesis does not cover** recorded material: voice, applause, animal calls,
orchestral stingers, realistic foley. Fetch those, or record them.

**Kenney's CC0 packs beat both for interface audio.** 100 interface sounds and
63 digital effects designed as matched sets, so a click and its error tone
belong to the same machine. Download from kenney.nl, drop into
`assets/audio/`, write a manifest by hand. No API needed, and `pack.js` plays
them identically.

**The soft clip is a backstop, not a mixing tool.** It engages above 0.70
amplitude. If it is working hard, something upstream is too loud — check
`maxVoices` and your per-cue `volume` before reaching for `clipKnee`.

**Trims are measured mono, at unity, one sound at a time.** They do not
account for what happens when six cues overlap, or for a device's speaker
response. A tablet speaker rolls off below about 500 Hz, so `land` and
`explode` will read thinner in a child's hands than on your monitors. Check on
the target hardware.

**Noise-based recipes vary by a dB or two shot to shot.** `swoosh`, `slice`,
`splat`, `explode` and friends read a random offset into the noise buffer each
time. That variation is the point, not a defect. It is why the calibration
averages seven renders rather than trusting one.

**Recorded comedy is still out of reach.** Ice Age is a voice actor; Fruit
Ninja's squelches are real foley — wet cloth, a melon, a microphone. No
oscillator gets there. `fetch-sounds.js`, or twenty minutes and a phone.

**Timing helpers use wall-clock state.** `gag` and `escalate` track runs with
`Date.now()`, so their reset windows are real time, not audio time. That is
correct for user-paced interaction and wrong if you ever drive them from a
fixed-step simulation.

**Still not covered:**

- **Music.** Loops need seamless boundaries and their own mastering. The bus
  and the duck are there (`SFX.musicBus()`); the loop handling isn't. Pixabay
  Music is royalty-free and commercially usable if you need a bed.
- **Audio in your test harness.** Headless Chromium makes no sound, so nothing
  currently proves a cue fired during a Playwright run. The approach that fits:
  instrument the `AudioContext` in the page, record scheduled events, and
  assert on that array — the same shape as the render-based checks in
  `verify-mix.js`, which do run headless and do catch regressions.
- **Per-device output profiles.** One master level for phone, tablet and
  desktop speakers.

---

## 7. `juice.js` — game feel

Squash, pop, shake, dust, hitstop. Ships with your build (~29 KB). Uses `sfx.js`
when it is loaded, works without it.

```html
<script src="src/sfx.js"></script>
<script src="src/juice.js"></script>
<script>
  Juice.stage(document.getElementById('game'));   // once
  Juice.impact(elephant, { power: 1.3 });
</script>
```

### Why it cannot break your animations

Every effect is a Web Animations API animation with `composite: 'add'`. The
browser composes it **on top of** whatever transform your render loop is
writing, every frame. Juice never assigns to `element.style.transform`, never
wraps your nodes, and never touches your loop.

Two guarantees follow, and both are tested:

- **No conflict.** Your loop keeps writing `translate(...)`; juice adds
  `scale(1.2) rotate(3deg)` over it. Neither overwrites the other.
- **No accumulation.** Every keyframe track starts and ends at identity with
  `fill: 'none'`, so firing an effect ten thousand times leaves the element
  exactly where it started. A sprite that slowly deforms over a play session is
  the classic failure here.

If a browser lacks additive composition, transform effects are **skipped rather
than applied**, because applying them would overwrite your transform. Particles,
flashes and sound still run. Check `Juice.additive` to see which path you are on.

### Combos

One call fires visual and audio from the same trigger. Two call sites drift
apart, and drift is what reads as cheap.

| Call | What happens |
| --- | --- |
| `Juice.impact(el, {power})` | Squash, dust, screen shake, hitstop, `land` |
| `Juice.trample(el)` | Anticipation, then deep squash, dust ring, shake, hitstop, `land`+`splat` |
| `Juice.bonk(el)` | Squash, dizzy sway, stars, `bonk` |
| `Juice.collect(el, {label})` | Pop, burst, sparkle, floating label, escalating `coin` |
| `Juice.celebrate(el)` | Tada, confetti, `levelUp` |
| `Juice.fail(el)` | Droop, wobble, `sadTrombone` |
| `Juice.appear(el)` | Pop in, sparkle, `pop` |
| `Juice.refuse(el)` | Shake, `wrong` |

`collect` escalates by default: repeated pickups rise in pitch, and the run
resets after a pause. Pass `streak: false` for a flat cue.

### Single effects

Element: `pop` `squash` `stretch` `wobble` `shake` `nudge` `hop` `spin` `dizzy`
`tada` `droop` `anticipate` `flash`

Squash and stretch are volume-preserving — wider means shorter — which is what
makes them read as physical rather than as scaling.

Screen: `shakeScreen` `punchZoom` `flashScreen` `hitstop`

Particles (one canvas, not N DOM nodes): `burst` `dust` `stars` `confetti`
`sparkle` `popText`. The canvas carries `pointer-events: none`; an overlay that
forgets this is the standard way to make a game look fine and stop responding.

### Hitstop

A few frames of stillness at the moment of contact reads as weight. It is the
most under-used trick in game feel.

```js
// in your loop
var dt = realDelta * Juice.timeScale;
```

That one line is what makes hitstop reach *gameplay*. Without it, `hitstop()`
still freezes juice animations and particles, so the punch lands, just softer.

### Config

```js
Juice.configure({
  intensity: 1,           // global amplitude multiplier
  reducedMotion: 'auto',  // 'auto' | true | false
  particles: true,
  sound: true,
  maxParticles: 320
});
Juice.clear();            // cancel everything, for scene transitions
```

Reduced motion **damps to 35% rather than disabling**, and drops screen shake
entirely. A child who needs less movement still needs to know their tap
registered.

### Limits

- **Rotation and scale pivot on the element's own centre.** If your game sets a
  custom `transform-origin`, juice inherits it. Usually right, occasionally not.
- **`Juice.stage()` needs a positioned ancestor.** It sets `position: relative`
  on your stage if the computed position is `static`. If that breaks your
  layout, position the stage yourself first.
- **Screen shake moves the whole stage**, including any HUD inside it. Put UI
  that must stay still outside the stage element.
- **Not tested on a device.** Everything here is verified headlessly against a
  stubbed DOM. Frame pacing, particle cost on a low-end tablet, and how heavy
  the shake feels in a child's hands are all open questions until you run it on
  the target hardware.
