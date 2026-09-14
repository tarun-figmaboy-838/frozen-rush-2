/* EDIT THE PROGRESS PANEL IN THE RUNNING GAME.
 *
 * Loaded only when ?panel=1 is on the URL (main.js imports it dynamically), so it costs
 * a shipped build nothing: the file is never fetched unless the flag is set.
 *
 * WHY IT IS HERE AND NOT IN tools/. The dev server serves game/ as its root and refuses
 * anything above it, so a module in tools/ cannot be imported by the page at all. The
 * alternative was a separate mock-up page — which is what tools/panel-lab.html is, and
 * the reason it was not enough: a mock-up is not the game. Momo is not walking, the
 * crossings are not arriving, the card is not sliding away for a question. Alignment
 * that looks right in a still frame can still be wrong in play.
 *
 * WHAT IT DOES. Every number the panel is laid out from is a CSS variable with the
 * shipped value as its fallback (see style.css), so this sets variables on the .trail
 * element and the real panel re-lays out. Nothing is drawn by this file and no layout
 * rule is duplicated here — if it were, the thing you tuned would not be the thing that
 * ships.
 */

/* part -> the variable it writes, and what a percentage of it is a percentage OF.
 *
 * ONE PIXEL OF CURSOR IS ONE PIXEL OF MOVEMENT, and it was not. Sensitivity used to be a
 * fixed number per value, which cannot be right for both: a stage unit is ~16px while 1%
 * of a grid cell is ~0.34px, so the same constant that suited the card made a stone move
 * 0.12px per pixel dragged and Momo 0.09px. That is the whole of "I still cannot move it"
 * — the handle followed the cursor at a twelfth speed and read as dead.
 *
 * So `ref` names the length the value is measured against and the scale is worked out at
 * drag time from the element actually on screen. `sign` is -1 where the value grows as
 * the cursor moves the other way (an inset, or a distance from the bottom). */
const PARTS = [
  { id: 'card', label: 'Card', sel: '.trail-card', band: 'top',
    x: { key: 'pw', unit: 'u', min: 20, max: 48, step: 0.5 },
    y: { key: 'ph', unit: 'u', min: 4, max: 14, step: 0.25 } },
  { id: 'rail', label: 'Safe area', sel: '.trail-rail',
    x: { key: 'safe-x', unit: '%', ref: 'cardW', sign: -1, min: 4, max: 26, step: 0.5 },
    y: { key: 'safe-t', unit: '%', ref: 'cardH', min: 10, max: 40, step: 1 } },
  { id: 'lane', label: 'Lane', sel: '.journey-lane',
    y: { key: 'lane-y', unit: '%', ref: 'railH', min: 20, max: 90, step: 1 },
    shiftY: { key: 'lane-h', unit: 'u', sign: -1, min: 0.1, max: 1.4, step: 0.02 } },
  { id: 'stone', label: 'Stone', sel: '.level-track .level-node:nth-child(3) .trail-node',
    x: { key: 'stone-w', unit: '%', ref: 'cellW', min: 40, max: 100, step: 1 } },
  { id: 'momo', label: 'Momo', sel: '#trail-momo',
    y: { key: 'momo-b', unit: '%', ref: 'stoneH', sign: -1, min: 10, max: 90, step: 1 },
    shiftY: { key: 'momo-w', unit: '%', ref: 'stoneW', sign: -1, min: 50, max: 140, step: 1 } },
  { id: 'bear', label: 'Friend', sel: '.bear-destination',
    x: { key: 'goal-w', unit: 'u', min: 1.5, max: 6, step: 0.1 } }
];

/* The shipped values, which are also the fallbacks in style.css. Reset restores these,
   and Copy JSON prints whatever is current against them. */
const SHIPPED = {
  pw: 34, ph: 7, 'safe-x': 17, 'safe-t': 22, 'safe-b': 20, 'safe-gap': 1.1,
  'stone-w': 82, 'goal-w': 3.2, 'momo-w': 92, 'momo-b': 46, 'lane-h': 0.44, 'lane-y': 58
};
const UNIT = { pw: 'u', ph: 'u', 'safe-x': '%', 'safe-t': '%', 'safe-b': '%',
  'safe-gap': 'u', 'stone-w': '%', 'goal-w': 'u', 'momo-w': '%', 'momo-b': '%',
  'lane-h': 'u', 'lane-y': '%' };

export function startPanelEditor(trail) {
  if (!trail || trail.dataset.editor) return;
  trail.dataset.editor = '1';

  const vals = Object.assign({}, SHIPPED);
  let sel = null, drag = null, hits = [];

  const css = v => UNIT[v] === 'u' ? `calc(${vals[v]} * var(--u))` : `${vals[v]}%`;

  /* THE CARD'S FRAME SCALES WITH ITS HEIGHT. panel.webp is 1100x341 with 264/265px cloud
     caps and a 55/50px rim, so every border-width is its slice times height/341 — which
     is what keeps the clouds the shape they were painted. Recomputed here so dragging
     the card taller cannot silently stretch them. */
  function write() {
    const s = trail.style;
    s.setProperty('--pw', css('pw'));
    s.setProperty('--ph', css('ph'));
    const k = vals.ph / 341;
    s.setProperty('--bw-t', `calc(${(55 * k).toFixed(3)} * var(--u))`);
    s.setProperty('--bw-r', `calc(${(265 * k).toFixed(3)} * var(--u))`);
    s.setProperty('--bw-b', `calc(${(50 * k).toFixed(3)} * var(--u))`);
    s.setProperty('--bw-l', `calc(${(264 * k).toFixed(3)} * var(--u))`);
    for (const key of ['safe-x', 'safe-t', 'safe-b', 'stone-w', 'goal-w', 'momo-w', 'momo-b', 'lane-h', 'lane-y']) {
      s.setProperty('--' + key, css(key));
    }
    s.setProperty('--safe-gap', `calc(${vals['safe-gap']} * var(--u))`);
    layout();
    readout();
  }

  // ---- the handles ----
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;z-index:60;pointer-events:none';
  trail.appendChild(layer);

  function layout() {
    hits.forEach(h => h.remove());
    hits = [];
    const base = trail.getBoundingClientRect();
    for (const part of PARTS) {
      const el = trail.querySelector(part.sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      /* The card contains every other part and the later handles paint over it, so its
         own handle is the frame strip above the journey — otherwise dragging the middle
         of the card would move whatever is on top of it there. */
      let top = r.top, hgt = r.height;
      if (part.band === 'top') {
        const inner = trail.querySelector('.trail-rail');
        if (inner) hgt = Math.max(10, inner.getBoundingClientRect().top - r.top);
      }
      const d = document.createElement('div');
      d.dataset.part = part.id;
      d.title = part.label;
      d.style.cssText =
        'position:absolute;pointer-events:auto;border-radius:4px;cursor:move;' +
        'left:' + (r.left - base.left) + 'px;top:' + (top - base.top) + 'px;' +
        'width:' + r.width + 'px;height:' + hgt + 'px;' +
        (sel === part.id
          ? 'outline:2px solid #FFC44A;background:rgba(255,196,74,.16)'
          : 'outline:1px dashed rgba(127,240,255,.5)');
      layer.appendChild(d);
      hits.push(d);
    }
  }

  // ---- the readout ----
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;left:10px;bottom:10px;z-index:9999;pointer-events:auto;' +
    'background:#071730;border:1px solid #2E8BD6;border-radius:6px;padding:10px 12px;' +
    'font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#9fe9ff;max-width:360px';
  document.body.appendChild(box);

  function readout() {
    const changed = Object.keys(vals).filter(k => vals[k] !== SHIPPED[k]);
    box.innerHTML =
      '<b style="color:#FFC44A">Panel editor</b> — drag a part, or arrow keys. ' +
      'Shift+drag on Momo/lane = size.<br>' +
      (sel ? 'selected: <b style="color:#7FF0FF">' + sel + '</b><br>' : 'nothing selected<br>') +
      (changed.length
        ? changed.map(k => k + ' ' + vals[k] + (UNIT[k] === 'u' ? 'u' : '%')).join('  ')
        : '<i>unchanged from shipped</i>') +
      '<br><button id="pe-json">Copy JSON</button> ' +
      '<button id="pe-reset">Reset</button> ' +
      '<span id="pe-said" style="color:#8CFF6B"></span>';
    box.querySelector('#pe-json').onclick = copyJson;
    box.querySelector('#pe-reset').onclick = () => { Object.assign(vals, SHIPPED); write(); };
  }

  function copyJson() {
    const text = JSON.stringify(Object.assign({ panel: 'frozen-rush-2 progress panel' }, vals), null, 2);
    /* navigator.clipboard is refused on a file:// page even though it is exposed, so the
       textarea route is the one that works in both places; selecting it is the fallback. */
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    const said = box.querySelector('#pe-said');
    if (ok) { said.textContent = 'copied'; setTimeout(() => { said.textContent = ''; }, 1600); }
    else { console.log(text); said.textContent = 'in the console'; }
  }

  // ---- gestures ----
  /* The lengths a percentage can be measured against, read off the page as it is now —
     the panel resizes with the stage, so these cannot be constants. */
  function refs() {
    const box = s => { const e = trail.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    const card = box('.trail-card'), rail = box('.trail-rail');
    const cell = box('.level-node'), stone = box('.trail-node');
    const u = parseFloat(getComputedStyle(trail).getPropertyValue('--u')) || 16;
    return {
      u,
      cardW: card ? card.width : 0, cardH: card ? card.height : 0,
      railW: rail ? rail.width : 0, railH: rail ? rail.height : 0,
      cellW: cell ? cell.width : 0,
      stoneW: stone ? stone.width : 0, stoneH: stone ? stone.height : 0
    };
  }

  /** Pixels on screen per one unit of this value — so a drag can be 1:1. */
  function pxPerUnit(map, R) {
    if (map.unit === 'u') return R.u || 16;
    const len = R[map.ref] || 0;
    return len ? len / 100 : 1;          // 1% of whatever it is a percentage of
  }

  function nudge(axis, px, shift) {
    const part = PARTS.find(p => p.id === sel);
    if (!part) return;
    const map = (shift && part.shiftY && axis === 'y') ? part.shiftY : part[axis];
    if (!map) return;
    const per = pxPerUnit(map, refs());
    if (!(per > 0)) return;
    const delta = (px / per) * (map.sign || 1);
    const next = Math.min(map.max, Math.max(map.min,
      Math.round((vals[map.key] + delta) / map.step) * map.step));
    if (next === vals[map.key]) return;
    vals[map.key] = +next.toFixed(3);
    write();
  }

  layer.addEventListener('pointerdown', e => {
    const hit = e.target.closest('[data-part]');
    if (!hit) return;
    sel = hit.dataset.part;
    drag = { x: e.clientX, y: e.clientY, shift: e.shiftKey };
    layer.setPointerCapture(e.pointerId);
    layout(); readout();
    e.preventDefault();
  });
  layer.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    if (Math.abs(dx) >= Math.abs(dy)) nudge('x', dx, drag.shift);
    else nudge('y', dy, drag.shift);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const end = e => {
    if (!drag) return;
    drag = null;
    try { layer.releasePointerCapture(e.pointerId); } catch (err) {}
  };
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);

  window.addEventListener('keydown', e => {
    if (!sel) return;
    const big = e.shiftKey ? 6 : 1;
    if (e.key === 'ArrowLeft')  { nudge('x', -big, false); e.preventDefault(); }
    if (e.key === 'ArrowRight') { nudge('x',  big, false); e.preventDefault(); }
    if (e.key === 'ArrowUp')    { nudge('y', -big, e.altKey); e.preventDefault(); }
    if (e.key === 'ArrowDown')  { nudge('y',  big, e.altKey); e.preventDefault(); }
    if (e.key === 'Escape') { sel = null; layout(); readout(); }
  });

  /* The panel moves: it slides away for a question and back after, and the row is
     rebuilt when the crossing count arrives. The handles have to follow it, and there is
     no event for "the layout settled" — so they are re-measured on a frame loop while
     the editor is up. It only runs when the flag is on. */
  let raf = 0;
  const follow = () => { layout(); raf = requestAnimationFrame(follow); };
  raf = requestAnimationFrame(follow);

  window.addEventListener('resize', layout);
  write();

  return () => { cancelAnimationFrame(raf); layer.remove(); box.remove(); };
}
