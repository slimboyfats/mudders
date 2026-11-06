import { Shape, type QuadBatch } from './batch';

/**
 * Pixel-art Magnet Mine (render-only, §2a) for the sim's per-tick `magnet` effect events: a squat
 * steel mine with red and silver pole caps and a blinking light, and while its field is on,
 * dotted rings of "iron filings" that crawl in from the rim to the mine, plus short field-line
 * dashes streaming inward along the ground. Everything sits on whole map cells in hard colours,
 * no smooth glow, and the look is a pure function of the event stream, so captures replay exactly.
 */

export interface MagnetFx {
  x: number;
  y: number;
  r: number;
  /** Sim age of the latest event, arming ticks, field life. */
  age: number;
  arm: number;
  life: number;
  /** 0..1 field strength. */
  strength: number;
  /** Render tick of the latest event. */
  last: number;
}

const STEEL = 0x4a5058;
const STEEL_LIT = 0x8a929c;
const STEEL_DARK = 0x262a30;
const POLE_RED = 0xd8303a;
const POLE_SILVER = 0xd8dce4;
const FIELD = [0xbff4ff, 0x7fd8f0, 0x4aa8d8] as const;
const LIGHT_ON = 0xff4040;
const LIGHT_OFF = 0x5a1a1a;

/** Number of filing rings in flight at once, and ticks for one ring to crawl rim to centre. */
const RINGS = 3;
const RING_TICKS = 42;

function px(b: QuadBatch, x: number, y: number, color: number, alpha = 1): void {
  b.push(Math.round(x) + 0.5, Math.round(y) + 0.5, 1, 1, color, alpha, Shape.Rect);
}

function rect(b: QuadBatch, x0: number, y0: number, w: number, h: number, color: number): void {
  b.push(x0 + w / 2, y0 + h / 2, w, h, color, 1, Shape.Rect);
}

/** Integer hash for stable per-dot variety. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return (h ^ (h >>> 13)) >>> 0;
}

/** Draw one magnet mine and its field at render time `t`. */
export function drawMagnet(m: MagnetFx, normal: QuadBatch, additive: QuadBatch, t: number): void {
  const age = m.age + Math.max(0, t - m.last);
  const on = age - m.arm;
  const live = on >= 0 && on < m.life && m.strength > 0;
  const cx = Math.round(m.x);
  const by = Math.round(m.y);

  if (live) {
    const s = m.strength;
    // rings of filings crawling inward; each ring is a dotted circle, dots snapped to cells
    for (let k = 0; k < RINGS; k++) {
      const ph = (((on + (k * RING_TICKS) / RINGS) % RING_TICKS) + RING_TICKS) % RING_TICKS;
      const f = 1 - ph / RING_TICKS;
      const rr = 6 + (m.r - 6) * f * f;
      const dots = Math.max(16, Math.round(rr * 1.6));
      const col = FIELD[f > 0.66 ? 2 : f > 0.33 ? 1 : 0]!;
      const a = Math.min(1, s * (0.6 + 0.4 * (1 - f)));
      const spin = k * 0.7 + (on - ph) * 0.013;
      for (let i = 0; i < dots; i++) {
        if (hash(i, k + Math.floor((on - ph) / RING_TICKS) * 7) % 4 === 0) continue; // gaps
        const ang = spin + (i / dots) * Math.PI * 2;
        const y = by - 2 + Math.sin(ang) * rr * 0.75;
        // the field only shows in the air: a dome of filings over the mine
        if (y > by - 2) continue;
        px(normal, cx + Math.cos(ang) * rr, y, col, a);
        if (f < 0.4) px(additive, cx + Math.cos(ang) * rr, y - 1, col, 0.5 * a);
      }
    }
    // field-line dashes skating along the ground toward both poles
    const n = 6;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < n; i++) {
        const span = m.r - 8;
        const d = 8 + (((((i * span) / n - on * (1.2 + s)) % span) + span) % span);
        const lift = Math.round(Math.sin((d / m.r) * Math.PI) * m.r * 0.22);
        const x = cx + side * d;
        const y = by - 3 - lift;
        const col = FIELD[d < m.r * 0.33 ? 0 : 1]!;
        px(normal, x, y, col, s);
        px(normal, x + side, y, col, 0.6 * s);
      }
    }
  }

  // the mine: a squat steel puck, red pole on the left, silver on the right, light on top
  const w = 9;
  const h = 4;
  const x0 = cx - (w >> 1);
  const y0 = by - h;
  rect(normal, x0, y0, w, h, STEEL);
  rect(normal, x0, y0, w, 1, STEEL_LIT);
  rect(normal, x0, y0 + h - 1, w, 1, STEEL_DARK);
  rect(normal, x0 - 1, y0 + 1, 2, h - 1, POLE_RED);
  rect(normal, x0 + w - 1, y0 + 1, 2, h - 1, POLE_SILVER);
  // blink: slow while arming, fast and steady-bright while the field is on
  const period = live ? 6 : 16;
  const lit = Math.floor(age / (period / 2)) % 2 === 0;
  rect(normal, cx - 1, y0 - 2, 3, 2, STEEL_DARK);
  px(normal, cx, y0 - 2, lit ? LIGHT_ON : LIGHT_OFF);
  if (lit) px(additive, cx, y0 - 3, LIGHT_ON, 0.6);
}
