# Part 2 — the nine lines to record

Nine sentences, one per level. **Record them in this order, as ONE continuous take**,
the way Part 1's were: the game downloads a single file and cuts it into windows, so
one take is one request and one decode instead of nine.

Leave **a clear second of silence between lines** — the split tool finds the gaps by
energy, and anything under about half a second runs two lines together.

| # | id | say this |
|---|----|----------|
| 1 | `p2-1-diagonal` | Cut along a diagonal. |
| 2 | `p2-2-diagonals` | Draw all the diagonals. |
| 3 | `p2-3-samevertex` | Draw 2 diagonals from one corner. |
| 4 | `p2-4-concave` | Cut the concave polygon. |
| 5 | `p2-5-convex` | Cut the convex polygon. |
| 6 | `p2-6-concave-pentagon` | Cut the concave pentagon. |
| 7 | `p2-7-convex-hexagon` | Cut the convex hexagon. |
| 8 | `p2-8-all-concave` | Cut all the concave ones. |
| 9 | `p2-9-all-convex` | Cut all the convex ones. |
| 10 | `p2-tut-6-cut` | Cut this ice block to fix the path. |

Line 10 REPLACES a tutorial line, and is the one item here that is not a question. The
take holds `tut-6-use` — "Use the right ice piece to fix the path." — recorded when the
tutorial ran over a row of hanging blocks. It now runs over Part 2's crossing 1, which
has a single slab and nothing to choose between, so the step was rewritten to "Cut this
ice block to fix the path." The old window is still in `CFG.vo.lines` and is now unused;
until line 10 is recorded the step is silent. Do not re-record `tut-1` … `tut-5` or
`tut-7`: those still match their steps exactly.

Read line 3 as **"draw two diagonals"** — the numeral is how it is written on the
board, not how it is spoken.

## How to say them

The same voice and pace as the Part 1 take. These are questions put to a child who is
about to do something, not narration: the shape word carries the sentence, so let
**concave**, **convex**, **pentagon**, **hexagon** and **diagonal** land. The board
reveals each word as it is spoken, and a rushed line leaves the words chasing the
voice.

Lines 8 and 9 say **"all"** and mean it — the crossing wants every matching shape, so
that word is doing work.

## What happens to the file

1. Drop the take in `art-source/audio-source/` as a WAV or MP3.
2. `node tools/vo-split.mjs <file>` measures the gaps and writes a window per line.
3. Add the windows to `CFG.vo.lines` in `game/js/engine.js`, keyed by the ids above.
4. `node tools/make-ogg.mjs` writes the Ogg twin; the game picks whichever the browser
   takes (Safari under 17.4 cannot play Ogg, so both ship).
5. `node tools/build-bundle.mjs`.

## Until then

Every line is **silent and harmless**. `audio.say()` returns 0 for an id it has no
window for and logs it as `no-window`; the board still reveals its words on the
fallback pace and nothing waits on a voice that is not coming. So the game is
playable now and the recordings drop in without touching any other code.

## Not needed any more

Part 1's seven question lines are dead — `sign-triangle`, `sign-quadrilateral`,
`sign-pentagon`, `sign-hexagon`, `sign-heptagon`, `sign-pentagons`, `sign-hexagons`.
Their crossings were replaced by Part 2's, so nothing asks for them. The seven
**tutorial** lines (`tut-1-meet` … `tut-7-fit`) are all still used and still correct —
do not re-record those.
