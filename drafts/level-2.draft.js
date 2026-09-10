/* SUPERSEDED — Level 2 is attached. See RUNNER.md §15.
   ===========================================================================
   THIS FILE IS HISTORY, NOT SOURCE. It was the parked draft up to version
   1.0.0; version 2.0.0 brought the level back into js/engine.js, and it is
   kept here verbatim only as the record of what was originally specified.

   DO NOT PASTE FROM IT. Four things below were already dead by the time the
   level was re-attached, and copying any of them back would reintroduce a
   fault that has been fixed:

     kind:'span' / piece2   the gap model moved on. A crevasse carries `slots`
                            and `pieces` now and the ditch is cut FROM the
                            piece that bridges it, so Level 2's halves are
                            ordinary seated pieces and the hand-rolled seal
                            stroke at the bottom of this file is gone.
     G.focus                drove a blur-and-dim layer that render() no longer
                            has. It was never assigned a non-zero value.
     G.helper               the HUD stopped reading it, so all three feedback
                            lines here would have been invisible. They go
                            through the plank (G.signSay) now.
     startBreak(2)          opened two fixed 320px gaps. They are sized from
                            the hexagon instead — see layoutLevelTwo().

   AND THE RULE CHANGED. attemptCut() below accepts ANY diagonal. The live
   level accepts only the three MAIN ones (0-3, 1-4, 2-5), because a short
   diagonal leaves a five-sided piece 1.5R tall against a 234px cavity and it
   cannot bridge at any size. A short diagonal is still never called wrong —
   it gets its own nudge. RUNNER.md §15 has the arithmetic.

   ---------------------------------------------------------------------------
   The original note follows, unedited.
   ---------------------------------------------------------------------------

   Detached from the live game on request, so Level 1's six phases stand alone
   and the journey ends after them. Nothing imports this file; it is kept
   verbatim so the level can be brought back without rebuilding it.

   To re-attach, in js/engine.js:
     1. paste the functions below back inside createGame();
     2. restore the onEnter cases and update-switch cases listed below;
     3. restore the startBreak(2) branch that opens the two span gaps
        (G.gapA / G.gapB), and point the final phase in PHASE_DONE back at
        RUN_SEGMENT_2 instead of FINAL_RUN;
     4. restore the LEVEL_2_ACTIVE branches in onDown / onMove / onUp, the
        drawL2 call in render(), G.l2 / G.gapA / G.gapB in resetAll(), and
        `if (G.l2) updateL2(dt)` in update();
     5. put back the JOURNEY progress bands for the level-2 states.

   PolygonCutManager and regularHexagon stay in engine.js — the cut manager is
   exported and independently checkable, and is the part of this level most
   worth keeping in the bundle.
*/

/* ============ onEnter cases ============
      case 'RUN_SEGMENT_2':
        G.l1 = null; G.moving = true; G.jumpEnabled = true; mammoth.setState('RUN'); break;
      case 'JUMP_CHALLENGE_2':
        obstacles.spawn(G.worldX, 2150, 2); break;
      case 'GLACIER_BREAK_2': G.jumpEnabled = false; G.jumpPulse = false; startBreak(2); break;
      case 'LEVEL_2_INTRO':
        G.level = 2; G.instruction = CFG.levels[1].instruction; G.jumpEnabled = false;
        if (mammoth.state !== 'SHAKE') mammoth.setState('LOOK_DOWN');
        buildLevel2(); break;
      case 'LEVEL_2_FOCUS': audio.setDuck(0.75); break;
      case 'LEVEL_2_ACTIVE': G.idle = 0; break;
      case 'LEVEL_2_SUCCESS': G.instruction = ''; G.helper = ''; break;
      case 'BRIDGE_2_COMPLETE':
        G.focus = 0; G.helper = ''; mammoth.setState('CELEBRATE'); audio.success(); atmos.pulse(); break;
      case 'FINAL_RUN': G.l2 = null; G.moving = true; G.jumpEnabled = true; mammoth.setState('RUN'); break;
============ */

/* ============ update-switch cases ============
      case 'RUN_SEGMENT_2': if (G.st > T.run2) setState('JUMP_CHALLENGE_2'); break;
      case 'JUMP_CHALLENGE_2':
        if (obstacles.list.length && obstacles.list.every(o => o.passed)) setState('POST_JUMP_RUN_2');
        break;
      case 'POST_JUMP_RUN_2': if (G.st > T.postJump2) setState('GLACIER_BREAK_2'); break;
      case 'LEVEL_2_INTRO': if (G.st > T.levelIntro) setState('LEVEL_2_FOCUS'); break;
      case 'LEVEL_2_FOCUS': if (G.st > T.focus) setState('LEVEL_2_ACTIVE'); break;
      case 'LEVEL_2_WRONG_FEEDBACK':
        if (G.st > 700) { G.helper = ''; setState('LEVEL_2_ACTIVE'); }
        break;
      case 'LEVEL_2_SUCCESS': updateL2Success(dt); break;
      case 'BRIDGE_2_COMPLETE': if (G.st > T.celebrate) setState('FINAL_RUN'); break;
============ */

/* ============ startBreak(2) ============
    } else {
      const a0 = targetWorldX + 640, a1 = a0 + 320;
      const b0 = a1 + 320, b1 = b0 + 320;
      G.gapA = ground.addGap({ x0: a0, x1: a1, open: 0, kind: 'span', repaired: false, crack: 0, crackPts: makeCrack() });
      G.gapB = ground.addGap({ x0: b0, x1: b1, open: 0, kind: 'span', repaired: false, crack: 0, crackPts: makeCrack() });
    }
============ */

/* ============ input branches ============
    // onDown, after the PHASE_ACTIVE branch:
    else if (G.state === 'LEVEL_2_ACTIVE') {
      const L = G.l2;
      const vi = nearestVertex(p.x, p.y);
      L.dragFrom = vi;
      L.dragStart = vi >= 0 ? hexScreenPts()[vi] : p;
      L.dragPt = p;
      if (vi >= 0) L.cornerPulse = Math.max(L.cornerPulse, 0.6);
    }
    // onMove:
    else if (G.state === 'LEVEL_2_ACTIVE' && G.l2 && G.l2.dragPt) { G.l2.dragPt = p; }
    // onUp:
    else if (G.state === 'LEVEL_2_ACTIVE' && G.l2 && G.l2.dragPt) {
      const L = G.l2;
      const from = L.dragFrom;
      const to = nearestVertex(p.x, p.y);
      const moved = Math.hypot(p.x - L.dragStart.x, p.y - L.dragStart.y) > 24;
      const end = { x: p.x, y: p.y };
      L.dragPt = null;
      if (!moved) { L.cornerPulse = 0.8; return; }
      if (from >= 0 && to >= 0 && from === to) { L.cornerPulse = 0.8; return; }
      attemptCut(from, to, end);
    }
============ */

/* ============ the level ============ */
  const HEX_R = 190;
  function buildLevel2() {
    G.attempts = 0; G.idle = 0;
    const base = regularHexagon(HEX_R);
    const island = { x0: G.gapA.x1, x1: G.gapB.x0 };
    const cx = (island.x0 + island.x1) / 2 - G.worldX;
    G.l2 = {
      pts: base, home: { x: cx, y: CFG.surfaceY - 0.866 * HEX_R - 6 },
      pos: { x: cx, y: CFG.surfaceY - 0.866 * HEX_R - 6 }, scale: 1, rot: 0,
      wrong: 0, focusT: 0, dragFrom: -1, dragPt: null, pieces: null, split: 0,
      badLine: null, cornerPulse: 0, ghost: 0, sealA: 0, sealB: 0, flyT: 0
    };
  }
  function hexScreenPts() {
    const L = G.l2;
    return L.pts.map(p => ({ x: L.pos.x + p.x * L.scale, y: L.pos.y + p.y * L.scale }));
  }
  function nearestVertex(x, y) {
    const pts = hexScreenPts();
    let best = -1, bd = 1e9;
    pts.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } });
    const tol = CFG.cut.vertexSnap * 1.9;
    return bd <= tol ? best : -1;
  }
  function attemptCut(i, j, end) {
    const L = G.l2;
    G.attempts++;
    if (i < 0 || j < 0) {
      L.wrong++;
      // `end` is captured before onUp() nulls dragPt — spreading the nulled value
      // gave {} here, so lineTo(NaN) silently dropped the whole feedback stroke
      const e = end || L.dragStart;
      L.badLine = { a: L.dragStart, b: { x: e.x, y: e.y }, t: 0, kind: 'corner' };
      G.helper = 'Connect two corners.'; audio.reject();
      setState('LEVEL_2_WRONG_FEEDBACK'); return;
    }
    if (!PolygonCutManager.isDiagonal(6, i, j)) {
      L.wrong++;
      const pts = hexScreenPts();
      L.badLine = { a: pts[i], b: pts[j], t: 0, kind: 'side' };
      G.helper = "That's a side — try a diagonal."; audio.reject();
      setState('LEVEL_2_WRONG_FEEDBACK'); return;
    }
    // valid diagonal
    const [pa, pb] = PolygonCutManager.split(L.pts, Math.min(i, j), Math.max(i, j));
    L.pieces = [PolygonCutManager.toPiece(pa), PolygonCutManager.toPiece(pb)];
    L.pieces.forEach(pc => { pc.cx = pc.x; pc.cy = pc.y; });
    L.cutIdx = [Math.min(i, j), Math.max(i, j)];
    const vi = L.pts[Math.min(i, j)], vj = L.pts[Math.max(i, j)];
    let nx = -(vj.y - vi.y), ny = (vj.x - vi.x);
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    L.pieces.forEach(pc => {
      const side = Math.sign((pc.cx - vi.x) * nx + (pc.cy - vi.y) * ny) || 1;
      pc.sep = { x: nx * side, y: ny * side };
      pc.rotTarget = rand(-0.06, 0.06);
    });
    audio.crack();
    setState('LEVEL_2_SUCCESS');
  }
  function planFlight() {
    const L = G.l2;
    const gaps = [G.gapA, G.gapB];
    // piece with larger area -> whichever; assign left/right by current x
    const order = L.pieces.slice().sort((a, b) => a.x - b.x);
    order.forEach((pc, idx) => {
      const g = gaps[idx];
      // longest edge = cut edge -> make it the top, horizontal
      let bi = 0, bl = -1;
      for (let k = 0; k < pc.local.length; k++) {
        const a = pc.local[k], b = pc.local[(k + 1) % pc.local.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > bl) { bl = len; bi = k; }
      }
      const a = pc.local[bi], b = pc.local[(bi + 1) % pc.local.length];
      let ang = Math.atan2(b.y - a.y, b.x - a.x);
      let rot = -ang;
      // after rotation, centroid (0,0) should be BELOW edge midpoint
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rm = { x: mid.x * Math.cos(rot) - mid.y * Math.sin(rot), y: mid.x * Math.sin(rot) + mid.y * Math.cos(rot) };
      if (rm.y > 0) rot += Math.PI;
      const rm2 = { x: mid.x * Math.cos(rot) - mid.y * Math.sin(rot), y: mid.x * Math.sin(rot) + mid.y * Math.cos(rot) };
      const gx = (g.x0 + g.x1) / 2 - G.worldX;
      const targetScale = clamp((g.x1 - g.x0 + 60) / bl, 0.96, 1.04);
      pc.flyFrom = { x: pc.x, y: pc.y, rot: pc.rot, scale: pc.scale };
      pc.flyTo = { x: gx - rm2.x * targetScale, y: CFG.surfaceY - 2 - rm2.y * targetScale, rot, scale: targetScale };
      pc.gap = g;
    });
  }
  function updateL2(dt) {
    const L = G.l2; if (!L) return;
    L.cornerPulse = Math.max(0, L.cornerPulse - dt * 1.4);
    L.ghost = Math.max(0, L.ghost - dt);
    if (L.badLine) { L.badLine.t += dt; if (L.badLine.t > 0.65) L.badLine = null; }
    if (G.state === 'LEVEL_2_FOCUS' || G.state === 'LEVEL_2_ACTIVE' ||
      G.state === 'LEVEL_2_WRONG_FEEDBACK') {
      const p = G.state === 'LEVEL_2_FOCUS' ? clamp(G.st / T.focus, 0, 1) : 1;
      L.focusT = p;
      const e = easeInOut(p);
      L.pos.x = lerp(L.home.x, CFG.W * 0.5, e);
      L.pos.y = lerp(L.home.y, CFG.H * 0.52, e);
      L.scale = lerp(1, 1.22, e);
      G.focus = e;
    }
  }

/* ============ success choreography ============ */
  function updateL2Success(dt) {
    const L = G.l2;
    const splitEnd = T.split, holdEnd = splitEnd + 200, unfocusEnd = holdEnd + 320, flyEnd = unfocusEnd + T.fly;
    const place = () => L.pieces.forEach(pc => {
      pc.x = L.pos.x + pc.cx * L.scale; pc.y = L.pos.y + pc.cy * L.scale; pc.scale = L.scale;
    });
    G.focus = G.st <= holdEnd ? 1 : G.focus;
    if (G.st <= splitEnd) {
      L.split = clamp(G.st / splitEnd, 0, 1);
      place();
      L.pieces.forEach(pc => { pc.offset = L.split * 15; pc.rot = pc.rotTarget * L.split; });
      if (G.st > splitEnd * 0.5 && !L.chipped) { L.chipped = true; particles.chips(L.pos.x, L.pos.y, 6, -140); }
      return;
    }
    L.split = 1;
    if (G.st <= unfocusEnd) {
      const q = clamp((G.st - holdEnd) / (unfocusEnd - holdEnd), 0, 1), e = easeInOut(q);
      G.focus = 1 - e;
      L.scale = lerp(1.22, 1, e);
      L.pos.x = lerp(CFG.W * 0.5, L.home.x, e);
      L.pos.y = lerp(CFG.H * 0.52, L.home.y, e);
      place();
      return;
    }
    if (!L.planned) {
      L.planned = true;
      G.focus = 0; L.scale = 1; L.pos.x = L.home.x; L.pos.y = L.home.y;
      place(); planFlight();
    }
    if (G.st <= flyEnd) {
      const q = clamp((G.st - unfocusEnd) / T.fly, 0, 1), e = easeInOut(q);
      L.pieces.forEach(pc => {
        if (!pc.flyFrom || !pc.flyTo) return;
        pc.x = lerp(pc.flyFrom.x, pc.flyTo.x, e);
        pc.y = lerp(pc.flyFrom.y, pc.flyTo.y, e);
        pc.rot = lerp(pc.flyFrom.rot, pc.flyTo.rot, e) + Math.sin(q * Math.PI) * 0.22;
        pc.scale = lerp(pc.flyFrom.scale, pc.flyTo.scale, e);
        pc.offset = (1 - e) * 15;
      });
      if (q > 0.94 && !L.locked) {
        L.locked = true; audio.clunk(); audio.seal(); atmos.pulse();
        L.pieces.forEach(pc => { if (pc.flyTo) particles.frost(pc.flyTo.x, CFG.surfaceY, 4); });
        shake(reduced ? 1 : 2.5, 170);
      }
      return;
    }
    L.sealA = Math.min(1, L.sealA + dt * 2.2);
    if (L.sealA >= 1) {
      [G.gapA, G.gapB].forEach(g => { g.repaired = true; });
      L.pieces.forEach(pc => {
        if (!pc.flyTo || !pc.gap) return;
        pc.gap.piece2 = { local: pc.local, rot: pc.flyTo.rot, scale: pc.flyTo.scale, x: pc.flyTo.x + G.worldX, y: pc.flyTo.y };
      });
      setState('BRIDGE_2_COMPLETE');
    }
  }

/* ============ drawing ============ */
  function drawPiecePoly(ctx, pc) {
    ctx.save();
    ctx.translate(pc.x + (pc.offset || 0) * (pc.sep ? pc.sep.x : 0), pc.y + (pc.offset || 0) * (pc.sep ? pc.sep.y : 0));
    ctx.rotate(pc.rot || 0);
    ctx.scale(pc.scale || 1, pc.scale || 1);
    paintIce(ctx, pc.local, ICE_PIECE);
    ctx.restore();
  }
  function drawL2(ctx) {
    const L = G.l2; if (!L) return;
    if (!L.pieces) {
      const pts = hexScreenPts();
      ctx.save();
      ctx.translate(L.pos.x, L.pos.y); ctx.scale(L.scale, L.scale);
      paintIce(ctx, L.pts, ICE_PIECE);
      ctx.restore();
      // Corners are always faintly visible, so the learner can see there is
      // something to grab without being told which pair to use. The pulse just
      // raises the same six dots — it never singles any of them out.
      {
        const a = Math.max(L.cornerPulse, 0.34);
        pts.forEach((p, i) => {
          const held = L.dragFrom === i;
          const alpha = held ? 0.95 : 0.42 * a + 0.16;
          const r = held ? 15 : 11;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832);
          ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = `rgba(45,130,181,${alpha * 0.9})`; ctx.stroke();
        });
      }
      // live cut preview
      if (L.dragPt && L.dragStart) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(L.dragStart.x, L.dragStart.y); ctx.lineTo(L.dragPt.x, L.dragPt.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(140,220,250,0.9)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      }
      // bad line
      if (L.badLine && Number.isFinite(L.badLine.b.x) && Number.isFinite(L.badLine.b.y)) {
        const a = clamp(1 - L.badLine.t / 0.65, 0, 1);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.lineCap = 'round';
        ctx.strokeStyle = C.amber; ctx.lineWidth = 6 + Math.sin(L.badLine.t * 30) * 1.5;
        ctx.beginPath(); ctx.moveTo(L.badLine.a.x, L.badLine.a.y); ctx.lineTo(L.badLine.b.x, L.badLine.b.y); ctx.stroke();
        if (L.badLine.kind === 'side') {
          const mx = (L.badLine.a.x + L.badLine.b.x) / 2, my = (L.badLine.a.y + L.badLine.b.y) / 2;
          ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(mx - 14, my - 14); ctx.lineTo(mx + 14, my + 14);
          ctx.moveTo(mx + 14, my - 14); ctx.lineTo(mx - 14, my + 14); ctx.stroke();
        }
        ctx.restore();
      }
    } else {
      L.pieces.forEach(pc => drawPiecePoly(ctx, pc));
      if (L.sealA > 0) {
        ctx.save();
        ctx.globalAlpha = L.sealA;
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 8; ctx.lineCap = 'round';
        [G.gapA, G.gapB].forEach(g => {
          const x0 = g.x0 - G.worldX, x1 = g.x1 - G.worldX;
          ctx.beginPath();
          ctx.moveTo(x0 - 20, CFG.surfaceY - 2);
          ctx.lineTo(lerp(x0 - 20, x1 + 20, L.sealA), CFG.surfaceY - 2);
          ctx.stroke();
        });
        ctx.restore();
      }
    }
  }
