/* Generates the game's vector UI.
 *
 * Real SVG geometry only — no embedded raster, no base64, no emoji, no icon-library
 * glyphs. 48x48 viewBox with safe padding, named groups so parts can be animated.
 *
 * ICON RULE, taken from the reference sheets: a control glyph sits on a COLOURED
 * BUTTON FACE, so the glyph itself is a solid white silhouette — no gradients, no
 * outline strokes, no interior detail. Gradient-filled glyphs with navy outlines
 * turn to mush at 48px on a blue face; a flat white silhouette stays legible down to
 * 24px. The button's depth (ring, bezel, gloss) is built in CSS around it, not baked
 * into every icon file.
 *
 * The SHAPE glyphs are the exception: they are the subject being taught, not a
 * control, so they keep the ice fill and navy outline the hanging chunks use.
 *
 *   node tools/make-ui.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, '..', 'game', 'assets', 'ui');

/* Palette lifted from the game, not invented. */
const P = {
  frost: '#FBFEFF', ice: '#C9E9FA', cyan: '#8FD3EF', mid: '#4FC0EE',
  deep: '#2A6E9E', ink: '#14496F',
  amberLit: '#FFFBEA', amber: '#FFDE86', amberDeep: '#F0A82C',
  greenLit: '#8CEFA6', green: '#34C069', greenDeep: '#14803D',
  coralLit: '#FFC59E', coral: '#FF8A5B', coralDeep: '#D4552B'
};

const W = '#FFFFFF';

const svg = (body, { w = 48, label = '' } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" width="${w}" height="${w}"` +
  (label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"') + `>\n${body}\n</svg>\n`;

const grad = (id, stops) =>
  `  <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">\n` +
  stops.map(([o, c]) => `    <stop offset="${o}" stop-color="${c}"/>`).join('\n') +
  `\n  </linearGradient>`;

/** A control glyph: one solid white group, optically centred in 48x48. */
const glyph = (label, geometry) => svg(`  <g id="icon" fill="${W}">\n${geometry}\n  </g>`, { label });

const files = {};

/* ---------------- controls: solid white silhouettes ---------------- */

files['icons/sound-on.svg'] = glyph('Sound on',
  `    <path d="M8 19h6.6L24.6 10a1.6 1.6 0 0 1 2.7 1.2v25.6a1.6 1.6 0 0 1-2.7 1.2L14.6 29H8a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z"/>
    <path d="M32.6 17.4a1.9 1.9 0 0 1 2.8-.2 10.4 10.4 0 0 1 0 13.6 1.9 1.9 0 0 1-2.9-2.4 6.6 6.6 0 0 0 0-8.7 1.9 1.9 0 0 1 .1-2.3z"/>
    <path d="M38.2 11.6a1.9 1.9 0 0 1 2.8-.1 18.3 18.3 0 0 1 0 25 1.9 1.9 0 0 1-2.8-2.6 14.5 14.5 0 0 0 0-19.8 1.9 1.9 0 0 1 0-2.5z"/>`);

files['icons/sound-off.svg'] = glyph('Sound off',
  `    <path d="M8 19h6.6L24.6 10a1.6 1.6 0 0 1 2.7 1.2v25.6a1.6 1.6 0 0 1-2.7 1.2L14.6 29H8a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z"/>
    <path d="M33.3 19.1a1.9 1.9 0 0 1 2.7 0l2.6 2.6 2.6-2.6a1.9 1.9 0 1 1 2.7 2.7L41.3 24l2.6 2.6a1.9 1.9 0 1 1-2.7 2.7l-2.6-2.6-2.6 2.6a1.9 1.9 0 1 1-2.7-2.7l2.6-2.6-2.6-2.6a1.9 1.9 0 0 1 0-2.7z"/>`);

files['icons/pause.svg'] = glyph('Pause',
  `    <rect x="13" y="10" width="8.4" height="28" rx="3.2"/>
    <rect x="26.6" y="10" width="8.4" height="28" rx="3.2"/>`);

files['icons/play.svg'] = glyph('Resume',
  `    <path d="M16 11.4a2.4 2.4 0 0 1 3.7-2l16.6 12.6a2.5 2.5 0 0 1 0 4L19.7 38.6a2.4 2.4 0 0 1-3.7-2z"/>`);

files['icons/restart.svg'] = glyph('Start over',
  `    <path d="M24 8.4a15.6 15.6 0 1 1-13.5 7.8 2.4 2.4 0 0 1 4.2 2.4A10.8 10.8 0 1 0 24 13.2z"/>
    <path d="M22.4 5.2a1.6 1.6 0 0 1 2.6-1.3l7.6 5.8a1.6 1.6 0 0 1 0 2.6L25 18a1.6 1.6 0 0 1-2.6-1.3z"/>`);

/* CHOSEN. A tick means "marked correct" — it belongs on a wrong/right answer, not on
   a character you picked, where it reads like homework. A star reads as chosen and
   as a reward, which is what selecting your explorer should feel like. */
files['icons/star.svg'] = glyph('Chosen',
  `    <path d="M24 3.6a2.3 2.3 0 0 1 2.1 1.35l4.5 9.9 10.7 1.35a2.3 2.3 0 0 1 1.25 4L34.6 27.2l2 10.7a2.3 2.3 0 0 1-3.4 2.4L24 35.1l-9.2 5.2a2.3 2.3 0 0 1-3.4-2.4l2-10.7-7.95-6.95a2.3 2.3 0 0 1 1.25-4l10.7-1.35 4.5-9.9A2.3 2.3 0 0 1 24 3.6z"/>`);

/* SELECTED. A bare solid tick for the chosen character card. The CSS-border tick
   it replaces was thin and sat off-centre, and a star read as a reward for doing
   something rather than as the state of a choice. */
files['icons/tick.svg'] = glyph('Selected',
  `    <path d="M39.4 11.6a3 3 0 0 1 4.5 3.9L23.6 38.2a3 3 0 0 1-4.5.1L5.2 24.4a3 3 0 0 1 4.2-4.3l11.5 11.2z"/>`);

files['icons/hint.svg'] = glyph('Hint',
  // a question mark drawn as geometry, not typed: the universal "help" glyph and the
  // only one a pre-reader recognises without words
  `    <path d="M24 6.6c6.2 0 10.8 3.9 10.8 9.4 0 4.2-2.4 6.3-5.4 8.2-2 1.3-2.7 2.1-2.8 3.7l-.1 1.5h-5.2l.1-2.2c.2-3.2 1.7-4.9 4.6-6.8 2.2-1.5 3.2-2.4 3.2-4.3 0-2.3-2-3.9-5.2-3.9-3 0-5.2 1.6-5.7 4.3l-5.4-.9C13.9 10.2 18.2 6.6 24 6.6z"/>
    <circle cx="24.1" cy="37.6" r="3.6"/>`);

/* ---------------- correct / incorrect marks ----------------
   These are not controls: they are full badges that pop over the world, so they
   carry their own disc, rim and gloss. */

const disc = (id, lit, mid, deep, icon) => `  <defs>
${grad(id, [[0, lit], ['.55', mid], [1, deep]])}
  </defs>
  <g id="shadow"><ellipse cx="24" cy="43.2" rx="13.6" ry="2.8" fill="#0B2C4E" opacity=".26"/></g>
  <g id="base"><circle cx="24" cy="22.4" r="17.4" fill="url(#${id})"/></g>
  <g id="rim">
    <circle cx="24" cy="22.4" r="17.4" fill="none" stroke="#FFFFFF" stroke-width="3.8"/>
    <circle cx="24" cy="22.4" r="19.6" fill="none" stroke="${P.ink}" stroke-width="2.4"/>
  </g>
  <g id="highlight" opacity=".5">
    <path d="M13.4 14.4A13.4 13.4 0 0 1 23 9.2" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round"/>
    <circle cx="16.6" cy="12.8" r="1.9" fill="#FFFFFF" opacity=".85"/>
  </g>
  <g id="icon" fill="#FFFFFF">
${icon}
  </g>`;

files['icons/check.svg'] = svg(disc('ckd', P.greenLit, P.green, P.greenDeep,
  `    <path d="M31.4 15.2a2.7 2.7 0 0 1 4.1 3.5L23.7 32.4a2.7 2.7 0 0 1-4-.1l-6-6.6a2.7 2.7 0 0 1 4-3.6l4 4.4z"/>`),
  { label: 'Correct' });

// warm coral, not alarm red: a wrong answer here is a normal part of learning
files['icons/wrong.svg'] = svg(disc('wrd', P.coralLit, P.coral, P.coralDeep,
  `    <path d="M16.4 14.8a2.7 2.7 0 0 1 3.8 0L24 18.6l3.8-3.8a2.7 2.7 0 0 1 3.8 3.8L27.8 22.4l3.8 3.8a2.7 2.7 0 0 1-3.8 3.8L24 26.2l-3.8 3.8a2.7 2.7 0 0 1-3.8-3.8l3.8-3.8-3.8-3.8a2.7 2.7 0 0 1 0-3.8z"/>`),
  { label: 'Not that one' });

/* ---------------- tutorial ---------------- */

files['tutorial/hand-slash.svg'] = svg(`  <defs>
${grad('hsSkin', [[0, '#FFF3E2'], ['.5', '#FFD9AE'], [1, '#E8A968']])}
  </defs>
  <g id="shadow"><ellipse cx="30" cy="58.4" rx="12" ry="3" fill="#0B2C4E" opacity=".22"/></g>
  <g id="trail">
    <!-- the swipe being demonstrated, so the gesture reads even in a still frame -->
    <path d="M6.4 40.6c4-3.4 8.4-5.4 12.8-6" fill="none" stroke="#FFFFFF" stroke-width="4.4"
          stroke-linecap="round" opacity=".92"/>
    <path d="M4 47.6c5-4.2 10.6-6.8 16.4-7.6" fill="none" stroke="#FFFFFF" stroke-width="3"
          stroke-linecap="round" opacity=".5"/>
  </g>
  <g id="base">
    <!-- a mitten with one pointing finger: reads at 40px, unlike a five-finger hand -->
    <path d="M25.6 10.4a4.4 4.4 0 0 1 8.8 0v16.2h4.2a9 9 0 0 1 9 9v9.6c0 5.6-4.6 10.2-10.2 10.2h-9.2c-6.4 0-11.6-5.2-11.6-11.6V28.2a4.2 4.2 0 0 1 8.4 0v4.2h.6z"
          fill="url(#hsSkin)" stroke="${P.ink}" stroke-width="3.2" stroke-linejoin="round"/>
  </g>
  <g id="highlight" opacity=".8">
    <path d="M29.8 14.2v11.2" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round"/>
  </g>`, { w: 64 });

/* ---------------- shape glyphs ----------------
   The subject being taught, so these keep the ice fill and navy outline the hanging
   chunks are drawn with — the instruction and the chunks then read as the same
   material. Shown beside the instruction so the objective is legible to a child who
   cannot yet read the shape's NAME; it reveals nothing the words do not already say. */

const shapePts = {
  triangle:      '24,5 43,42 5,42',
  square:        '8,8 40,8 40,40 8,40',
  quadrilateral: '6,11 42,6 40,41 9,37',
  trapezoid:     '15,7 33,7 43,41 5,41',
  pentagon:      '24,4 43,18 36,41 12,41 5,18',
  hexagon:       '15,6 33,6 43,24 33,42 15,42 5,24'
};

for (const [name, pts] of Object.entries(shapePts)) {
  files[`shapes/${name}.svg`] = svg(`  <defs>
${grad('shp', [[0, '#FFFFFF'], ['.34', '#DCF2FD'], ['.72', P.mid], [1, P.deep]])}
  </defs>
  <g id="base">
    <polygon points="${pts}" fill="url(#shp)" stroke="${P.ink}" stroke-width="3.4" stroke-linejoin="round"/>
  </g>
  <g id="highlight" opacity=".8">
    <polyline points="${pts.split(' ').slice(0, 2).join(' ')}" fill="none" stroke="#FFFFFF"
              stroke-width="2.6" stroke-linecap="round"/>
  </g>`, { label: name });
}

/* ---------------- write ---------------- */

const dirs = new Set(Object.keys(files).map(f => f.split('/')[0]));
for (const d of dirs) await mkdir(join(OUT, d), { recursive: true });

let total = 0;
for (const [rel, body] of Object.entries(files)) {
  await writeFile(join(OUT, rel), body, 'utf8');
  total += Buffer.byteLength(body);
  console.log('  ' + rel.padEnd(30) + Buffer.byteLength(body) + ' bytes');
}
console.log('\n' + Object.keys(files).length + ' SVG files, ' + (total / 1024).toFixed(1) + ' KB total');
