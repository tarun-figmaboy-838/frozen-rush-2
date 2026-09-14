/* EDIT THE PROGRESS PANEL IN THE RUNNING GAME.
 *
 * Loaded only when ?panel=1 is on the URL (main.js imports it dynamically), so it costs
 * a shipped build nothing: the file is never fetched unless the flag is set.
 *
 * WHY IT IS HERE AND NOT IN tools/. The dev server serves game/ as its root and refuses
 * anything above it, so a module in tools/ cannot be imported by the page at all. There
 * used to be a stand-alone mock-up page instead (tools/panel-lab.html, now deleted) and
 * the reason it was not enough is worth keeping: a mock-up is not the game. Momo is not
 * walking, the crossings are not arriving, the card is not sliding away for a question.
 * Alignment that looks right in a still frame can still be wrong in play. Worse, it kept
 * its own copy of the markup, so when the row stopped being a grid the page went on
 * showing the old even spacing and quietly tuned a layout that no longer existed.
 *
 * WHAT IT DOES. Every number the panel is laid out from is a CSS variable with the
 * shipped value as its fallback (see style.css), so this sets variables on the .trail
 * element and the real panel re-lays out. Nothing is drawn by this file and no layout
 * rule is duplicated here — if it were, the thing you tuned would not be the thing that
 * ships.
 */

/* EVERY ENTRY HERE IS A VARIABLE THE STYLESHEET ACTUALLY READS, and that had stopped
 * being true. The panel was rebuilt around absolute percentages of the card, and this
 * table was left describing the grid-and-safe-area layout that came before it: --ph,
 * --safe-x, --safe-t, --safe-b and --safe-gap had no reader left in style.css, --goal-w
 * and --lane-h had changed from stage units to percentages, and --stone-w had gone from
 * 82 (per cent of a grid cell) to 6.2 (per cent of the card). Reset wrote all of it
 * back, so the one button that promised to restore the shipped panel was the one that
 * destroyed it. Anything added here must exist in style.css with the SAME default.
 *
 * --lane-x0 and --lane-x1 are deliberately absent: hud.js writes them from MARKER_X so
 * the path always starts at the first platform and ends at the friend. Dragging them
 * apart from the markers they are derived from is not an alignment anyone wants.
 *
 * ONE PIXEL OF CURSOR IS ONE PIXEL OF MOVEMENT, and it was not. Sensitivity used to be a
 * fixed number per value, which cannot be right for both: a stage unit is ~16px while 1%
 * of a stone is ~0.24px, so the same constant that suited the card made a stone move
 * 0.12px per pixel dragged and Momo 0.09px. That is the whole of "I still cannot move it"
 * — the handle followed the cursor at a twelfth speed and read as dead.
 *
 * So `ref` names the length the value is measured against and the scale is worked out at
 * drag time from the element actually on screen. `sign` is -1 where the value grows as
 * the cursor moves the other way (a distance from the bottom). */
const PARTS = [
  { id: 'card', label: 'Card', sel: '.trail-card', band: 'top',
    x: { key: 'pw', unit: 'u', min: 14, max: 44, step: 0.5 } },
  { id: 'stone', label: 'Stones', sel: '.trail-rail .level-node:nth-child(6)',
    x: { key: 'stone-w', unit: '%', ref: 'cardW', min: 3, max: 12, step: 0.1 },
    y: { key: 'axis-y', unit: '%', ref: 'cardH', min: 20, max: 85, step: 0.5 } },
  { id: 'lane', label: 'Path', sel: '.journey-lane',
    y: { key: 'lane-y', unit: '%', ref: 'cardH', min: 20, max: 85, step: 0.5 },
    shiftY: { key: 'lane-h', unit: '%', ref: 'cardH', sign: -1, min: 0.5, max: 8, step: 0.1 } },
  { id: 'momo', label: 'Momo', sel: '#trail-momo',
    y: { key: 'momo-b', unit: '%', ref: 'stoneH', sign: -1, min: 10, max: 90, step: 1 },
    shiftY: { key: 'momo-w', unit: '%', ref: 'stoneW', sign: -1, min: 50, max: 140, step: 1 } },
  { id: 'bear', label: 'Friend', sel: '.bear-destination',
    x: { key: 'bear-x', unit: '%', ref: 'cardW', min: 70, max: 97, step: 0.1 },
    y: { key: 'bear-y', unit: '%', ref: 'cardH', min: 20, max: 85, step: 0.5 },
    shiftY: { key: 'goal-w', unit: '%', ref: 'cardW', sign: -1, min: 3, max: 14, step: 0.1 } }
];

/* The shipped values, which are also the fallbacks in style.css. Reset restores these,
   and Copy JSON prints whatever is current against them. Keep the two in step. */
const SHIPPED = {
  pw: 24, 'stone-w': 6.2, 'axis-y': 52, 'lane-y': 51.5, 'lane-h': 2.2,
  'momo-w': 92, 'momo-b': 46, 'bear-x': 87.4, 'bear-y': 50.8, 'goal-w': 7.4
};
const UNIT = { pw: 'u', 'stone-w': '%', 'axis-y': '%', 'lane-y': '%', 'lane-h': '%',
  'momo-w': '%', 'momo-b': '%', 'bear-x': '%', 'bear-y': '%', 'goal-w': '%' };

export function startPanelEditor(trail) {
  if (!trail || trail.dataset.editor) return;
  trail.dataset.editor = '1';

  const vals = Object.assign({}, SHIPPED);
  let sel = null, drag = null, hits = [];

  const css = v => UNIT[v] === 'u' ? `calc(${vals[v]} * var(--u))` : `${vals[v]}%`;

  /* THE FRAME IS NOT RECOMPUTED HERE ANY MORE, and it must not be. It used to derive
     --bw-t/r/b/l from a --ph the stylesheet no longer has, so vals.ph was undefined, k
     was NaN, and every border-image-width became calc(NaN * var(--u)) — invalid at
     computed-value time, which throws the whole shorthand back to its 100% initial and
     destroys the panel art the instant the editor opens.

     Nothing needs to replace it. The card carries `aspect-ratio: 1362 / 464`, so its
     height follows its width, and the slice percentages (264/1100 and 265/1100 across,
     55/341 and 50/341 down) are the same fractions of the border box at every size. The
     clouds keep their shape on their own; dragging the card cannot stretch them. */
  function write() {
    const s = trail.style;
    for (const key of Object.keys(SHIPPED)) s.setProperty('--' + key, css(key));
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
     the panel resizes with the stage, so these cannot be constants.

     stoneW/stoneH come from .level-node rather than from the .trail-node image inside it
     because they exist for Momo, and Momo is positioned against .level-node: it is the
     nearest positioned ancestor, so that is the box his bottom% and width% resolve
     against. --stone-w and --bear-x are percentages of the CARD, which is what the
     reference coordinates measure, so those take cardW. */
  function refs() {
    const box = s => { const e = trail.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    const card = box('.trail-card'), cell = box('.level-node');
    const u = parseFloat(getComputedStyle(trail).getPropertyValue('--u')) || 16;
    return {
      u,
      cardW: card ? card.width : 0, cardH: card ? card.height : 0,
      stoneW: cell ? cell.width : 0, stoneH: cell ? cell.height : 0
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
