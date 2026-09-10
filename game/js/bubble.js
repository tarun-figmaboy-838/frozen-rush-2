/* THE SPEECH BUBBLE — the supplied Bubble.svg, rebuilt as geometry.
 *
 * The asset (game/assets/art/Bubble.svg) is a rounded box with one swept tail hanging off
 * its bottom edge, a flat yellow fill and a thick black keyline. It cannot be used as an
 * image: a sentence wraps to any width and height, and stretching the picture would
 * stretch the stroke and smear the tail. So this draws the same shape for whatever box
 * the words need, with the tail on whichever edge faces the thing being talked about.
 *
 * Measured off the asset (1931 x 1134):
 *   corner radius     27 / 1909 body width      -> ~1.4% of the width, floored at 22px
 *   keyline           22 / 1931                 -> ~1.1% of the width; 7px at stage size
 *   tail base         1293..1676 of 1909        -> ~20% of the body width
 *   tail length       950.8 -> ~1117            -> ~17% of the body height
 *   tail tip          x 1275, left of its base  -> the tail LEANS: its tip is off to one
 *                                                  side of where it leaves the body
 * Everything below is those proportions, clamped so a short sentence still gets a real
 * tail and a long one does not get a comically wide one. */

export const BUBBLE = {
  /* THE GAME'S OWN PALETTE (asked for: the egg-yolk yellow was not the game's). Frost white
     (CFG.colors.frost) with the deep ice edge the chunks are outlined in — the bubble now reads
     as part of the Frozen Pass rather than a sticker on it. The keyline is the same colour the
     hanging ice is drawn with, so the speech and the world are edged alike. */
  fill: '#FFFFFF',        // white inside, on request
  ink: '#3FB3E8',         // a bright icy blue keyline, between CFG.colors.cyanIce and edge
  stroke: 7,              // px, at stage size
  radius: 26,             // px
  tailBase: 0.2,          // fraction of the body width
  tailBaseMax: 150,       // px
  tailLen: 0.17,          // fraction of the body height
  tailLenMin: 56, tailLenMax: 110
};

const lim = (v, a, b) => v < a ? a : v > b ? b : v;   // not `clamp`: the bundle shares one scope with engine.js
const f = n => (Math.round(n * 10) / 10).toString();

/**
 * The bubble outline for a body of w x h (CSS px), with an optional tail.
 * @param {number} w  body width
 * @param {number} h  body height
 * @param {{at?:number, lean?:number, len?:number}|null} tail
 *        at    where the tail leaves the bottom edge, 0..1 of the width
 *        lean  -1 tip to the left, +1 tip to the right (the asset leans left)
 *        len   tail length in px (default from the proportions above)
 * @returns {{d:string, tailLen:number}}  the path (tail pointing DOWN; flip the element
 *          for a tail on top) and how far it reaches below the body
 */
export function bubblePath(w, h, tail) {
  const s = BUBBLE.stroke, r = Math.max(22, Math.min(BUBBLE.radius, w * 0.08, h * 0.3));
  const x0 = s / 2, y0 = s / 2, x1 = w - s / 2, y1 = h - s / 2;
  let d = `M${f(x0 + r)} ${f(y0)} H${f(x1 - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(y0 + r)} ` +
          `V${f(y1 - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x1 - r)} ${f(y1)} `;
  let tailLen = 0;
  if (tail) {
    const L = tail.len || lim(h * BUBBLE.tailLen, BUBBLE.tailLenMin, BUBBLE.tailLenMax);
    tailLen = L;
    /* NEVER WIDER THAN IT IS LONG. The base is a share of the BODY's width, and a wide box on a
       short stage (a one-line sentence on a phone) took the 150px cap — a 150-wide, 155-long
       wedge, which reads as a shard of ice broken off the bubble rather than as a tail. */
    const bw = Math.min(BUBBLE.tailBaseMax, w * BUBBLE.tailBase, L * 0.8);
    const lean = tail.lean < 0 ? -1 : 1;
    const cx = lim((tail.at === undefined ? 0.5 : tail.at) * w, r + bw / 2 + 6, w - r - bw / 2 - 6);
    const b0 = cx - bw / 2, b1 = cx + bw / 2;          // where the tail leaves the body
    const tipX = cx + lean * bw * 0.62, tipY = y1 + L;   // the tip, off to the leaning side
    /* Two curves, as in the asset: the outer edge sweeps from the far base corner down to
       the tip, the inner edge climbs back to the near corner more steeply, which is what
       gives the tail its belly. Drawn right-to-left along the bottom edge, so the far
       corner is b1 when the tail leans left and b0 when it leans right. */
    if (lean < 0) {
      d += `H${f(b1)} C${f(b1 - bw * 0.08)} ${f(y1 + L * 0.62)}, ${f(tipX + bw * 0.34)} ${f(tipY - L * 0.28)}, ${f(tipX)} ${f(tipY)} ` +
           `C${f(tipX + bw * 0.06)} ${f(tipY - L * 0.5)}, ${f(b0 + bw * 0.1)} ${f(y1 + L * 0.3)}, ${f(b0)} ${f(y1)} `;
    } else {
      d += `H${f(b1)} C${f(b1 - bw * 0.1)} ${f(y1 + L * 0.3)}, ${f(tipX - bw * 0.06)} ${f(tipY - L * 0.5)}, ${f(tipX)} ${f(tipY)} ` +
           `C${f(tipX - bw * 0.34)} ${f(tipY - L * 0.28)}, ${f(b0 + bw * 0.08)} ${f(y1 + L * 0.62)}, ${f(b0)} ${f(y1)} `;
    }
  }
  d += `H${f(x0 + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x0)} ${f(y1 - r)} V${f(y0 + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x0 + r)} ${f(y0)} Z`;
  return { d, tailLen };
}

/**
 * Fit an <svg><path/></svg> shape layer to an element's current box and draw the bubble
 * into it. `side` 'below' hangs the tail from the bottom edge; 'above' flips the layer so
 * the tail rises from the top edge (the flip is done here, on the SVG, never on the text).
 * @param {SVGSVGElement} svg   the shape layer, absolutely positioned inside the bubble
 * @param {HTMLElement}   box   the bubble element whose size the words decided
 * @param {{side?:'below'|'above', at?:number, lean?:number}|null} tail
 */
export function fitBubble(svg, box, tail) {
  if (!svg || !box) return 0;
  /* LAYOUT size, not the transformed rect: the box pops in through a scale animation and
     getBoundingClientRect reported the shrunken mid-bounce box, so the shape came out
     narrower than the words. offsetWidth/Height ignore transforms. */
  const w = Math.max(40, Math.round(box.offsetWidth)), h = Math.max(30, Math.round(box.offsetHeight));
  const { d, tailLen } = bubblePath(w, h, tail ? { at: tail.at, lean: tail.lean } : null);
  const H = h + tailLen;
  svg.setAttribute('viewBox', `0 0 ${w} ${H}`);
  svg.style.width = w + 'px';
  svg.style.height = H + 'px';
  const above = tail && tail.side === 'above';
  svg.style.top = above ? (-tailLen) + 'px' : '0px';
  svg.style.transform = above ? 'scaleY(-1)' : 'none';
  const path = svg.querySelector('path');
  if (path) path.setAttribute('d', d);
  return tailLen;
}
