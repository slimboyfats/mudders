import type { QuadBatch } from './batch';
import { compile, rgb, texture, uniforms } from './gl';
import { FULLSCREEN_VS, NOISE } from './shaders';

/**
 * The edge walls as a living body of fallout that behaves like a liquid turned on its side
 * (cosmetic, renderer-only). Three layers:
 *
 * - A fragment shader paints the whole wall, every cell from its face out to the screen edge:
 *   currents of dark fallout pouring and swirling through it, a face that keeps rolling with
 *   waves running up and down it, and the ripple field below lit as a surface.
 * - A 2D damped wave equation over the wall (`h`, `v` on a 2-cell grid reaching `DEPTH` cells
 *   behind the face, the full screen height), stepped once per cosmetic tick. A shell going in
 *   pushes a cavity into the face and rings spread from it over the whole wall; the face rides
 *   the field, so it caves in, rebounds and sloshes.
 * - Particles with plain Newtonian motion: the swallowed shell ploughs in against quadratic
 *   drag, cooling through stepped colours and leaving a wake and a bubble trail; spray and a
 *   rebound jet are thrown back out, pulled down by gravity and back by the wall, and each drop
 *   that falls back in rings the surface again.
 *
 * Coordinates: `u` is the distance in cells from a side's map edge toward the middle and `d =
 * zone - u` the depth behind the wall's (undisplaced) face. The face itself bulges out by
 * `face(side, y)` cells.
 */

/** Grid cell in map cells, depth columns per side, wave speed² and damping per tick. */
const R = 2;
const COLS = 120;
const DEPTH = COLS * R;
const C2 = 0.2;
const DAMP = 0.994;
/** Cells the face moves out per unit of wave height. */
const KF = 0.6;
/** Analytic ring packets drawn at once, and how fast they run (cells/tick). */
const MAX_RINGS = 12;
const RING_SPEED = 0.8;
/** Gravity on spray (cells/tick²), and the wall's pull drawing it back in. */
const GRAVITY = 0.045;
const PULL = 0.08;

/** Shades, darkest first: the fallout body, then light catching crests. */
const PAL = [
  0x060908, 0x0b120d, 0x121c15, 0x1a281d, 0x243527, 0x304535, 0x3e5944, 0x3fae6a,
] as const;
const TOXIC = 0x2f8a52;
const BRIGHT = 0x7cf2a0;
/** The swallowed shell cooling: white-hot to dull ember to gone. */
const HEAT = [0xfff6d8, 0xffd070, 0xff8a30, 0xd0401c, 0x7a2412, 0x3d4a36] as const;

/** Integer hash → [0, 1). */
function h01(i: number, salt: number): number {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 11, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

/** The face's own roll: waves running both ways along it and a slow swell (cells, outward). */
export function faceRoll(side: number, y: number, t: number): number {
  const p = side * 1.7;
  return (
    1 +
    3.2 * Math.sin(y * 0.043 + t * 0.021 + p) +
    2.1 * Math.sin(y * 0.097 - t * 0.047 + p * 2) +
    1.1 * Math.sin(y * 0.21 + t * 0.09 + p * 3) +
    2.5 * Math.sin(t * 0.013 + p) * Math.sin(y * 0.018 - t * 0.006)
  );
}

const WALL_FS = `#version 300 es
precision highp float;
precision highp int;
#define MAX_RINGS ${MAX_RINGS}
in vec2 v_uv;
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_scale;
uniform vec2 u_map;
uniform float u_zone;
uniform float u_time;
uniform highp sampler2D u_wave;
uniform vec3 u_grid;        // rows, first row (map y), active sides bitmask
uniform vec3 u_pal[8];
uniform float u_fresh;
uniform vec4 u_rings[MAX_RINGS];   // depth, row, start tick, strength (side in the sign: < 0 right)
uniform int u_ringN;
out vec4 o;
${NOISE}
const float R = ${R.toFixed(1)};
const int COLS = ${COLS};
const float KF = ${KF};
// rings spreading from a disturbance as a dispersive wave packet: a leading crest running out
// at the group speed with smaller crests trailing behind it, the whole packet widening and dying
float rings(int s, float d, float y, float t) {
  float sum = 0.0;
  for (int i = 0; i < MAX_RINGS; i++) {
    if (i >= u_ringN) break;
    vec4 r = u_rings[i];
    if ((r.w < 0.0 ? 1 : 0) != s) continue;
    float age = t - r.z;
    if (age < 0.0) continue;
    float dist = length(vec2(d - r.x, y - r.y));
    float front = age * ${RING_SPEED.toFixed(2)};
    float behind = dist - front;
    if (behind > 2.0) continue;
    float spread = 6.0 + age * 0.12;
    float env = exp(behind / spread) * exp(-age / 110.0) / sqrt(1.0 + dist * 0.06);
    sum += abs(r.w) * 1.7 * env * cos(behind * 0.75);
  }
  return sum;
}

float tex(int s, int c, int r) {
  if (r < 0 || r >= int(u_grid.x) || c >= COLS) return 0.0;
  return texelFetch(u_wave, ivec2(s * COLS + max(c, 0), r), 0).r;
}
// the ripple field at depth d, map row y (bilinear between grid cells)
float wave(int s, float d, float y) {
  if (((int(u_grid.z) >> s) & 1) == 0) return 0.0;
  float cx = max(d, 0.0) / R - 0.5;
  float cy = (y - u_grid.y) / R - 0.5;
  float fx = floor(cx), fy = floor(cy);
  int c = int(fx), r = int(fy);
  float ax = cx - fx, ay = cy - fy;
  return mix(mix(tex(s, c, r), tex(s, c + 1, r), ax), mix(tex(s, c, r + 1), tex(s, c + 1, r + 1), ax), ay);
}
float roll(int s, float y, float t) {
  float p = float(s) * 1.7;
  return 1.0 + 3.2 * sin(y * 0.043 + t * 0.021 + p) + 2.1 * sin(y * 0.097 - t * 0.047 + p * 2.0)
    + 1.1 * sin(y * 0.21 + t * 0.09 + p * 3.0)
    + 2.5 * sin(t * 0.013 + p) * sin(y * 0.018 - t * 0.006);
}
void main() {
  vec2 dev = vec2(gl_FragCoord.x, u_view.y - gl_FragCoord.y);
  vec2 cell = floor((dev - u_origin) / u_scale);
  float x = cell.x + 0.5;
  float y = cell.y + 0.5;
  int s = x < u_map.x * 0.5 ? 0 : 1;
  float u = s == 0 ? x : u_map.x - x;
  float d = u_zone - u;
  if (d < -40.0) discard;
  float t = u_time;
  float depth = d + roll(s, y, t) + KF * wave(s, 0.0, y);
  if (depth < 0.0) discard;
  ivec2 ic = ivec2(cell);

  // the ripple field lit as a surface: crests catch the light, troughs fall into shadow
  float hw = wave(s, d, y);
  float gx = wave(s, d + R, y) - wave(s, d - R, y);
  float gy = wave(s, d, y + R) - wave(s, d, y - R);
  float rg = rings(s, d, y, t);
  float lit = clamp(rg * 1.2 - (gx * 0.45 + gy * 0.65) * 0.5, -3.0, 3.0);

  // currents: the fallout pours slowly down and curls on itself, warped twice
  vec2 q = vec2(u, y);
  vec2 w = vec2(fbm(q * 0.017 + vec2(0.0, t * 0.0035)), fbm(q * 0.017 + vec2(7.3, -t * 0.0028)));
  vec2 w2 = vec2(fbm(q * 0.034 + w * 2.0 + vec2(t * 0.004, 0.0)), fbm(q * 0.034 + w * 2.0 + vec2(3.1, t * 0.005)));
  float v = fbm(q * vec2(0.05, 0.036) + w2 * 2.8 + vec2(0.0, -t * 0.008));
  float near = 1.0 - smoothstep(0.0, 22.0, depth);
  float tone = v * 8.0 - 3.0 + near * 1.2 + lit + (narrow(ic) - 0.5);
  int k = clamp(int(floor(tone)), 0, 6);
  vec3 col = u_pal[k];
  // bright crests where a ring runs over a lit current
  if (rg > 1.2 && hash(ic + ivec2(int(t / 4.0), 0)) > 0.3) col = u_pal[7];
  // the face: a lit lip, frothing where it churns
  if (depth < 1.5) {
    col = u_pal[5 + int(hash(ic + ivec2(0, int(t / 3.0))) > 0.7)];
    if (u_fresh > 0.05 && hash(ic + ivec2(int(t / 8.0), 3)) < u_fresh * 0.6) col = u_pal[7];
  }
  // sparks drifting down through the dark, each on its own column and speed
  float sp = 0.15 + 0.3 * hash(ivec2(ic.x, 91));
  if (hash(ivec2(ic.x, ic.y - int(floor(t * sp)))) > 0.9992 && depth > 3.0) col = vec3(0.18, 0.54, 0.32);
  float a = mix(0.78, 0.97, smoothstep(0.0, 18.0, depth));
  o = vec4(col * a, a);
}`;

interface Sinker {
  side: number;
  d: number;
  y: number;
  vd: number;
  vy: number;
  age: number;
  /** Ticks since it came to rest (−1 while moving). */
  rest: number;
  seed: number;
}

interface Drop {
  side: number;
  d: number;
  y: number;
  vd: number;
  vy: number;
  age: number;
  col: number;
  /** A bubble rises back out to the face; a drop flies in the open and falls back in. */
  bubble: boolean;
}

interface Pending {
  side: number;
  y: number;
  speed: number;
  at: number;
  seed: number;
}

export class EdgeWall {
  private readonly rows: number;
  private readonly yMin: number;
  private readonly h: Float32Array;
  private readonly v: Float32Array;
  /** Active box per side: c0, c1, r0, r1 (inclusive), or c0 > c1 when asleep. */
  private readonly box = new Int32Array([0, -1, 0, -1, 0, -1, 0, -1]);
  private dirty = true;
  private sinkers: Sinker[] = [];
  private drops: Drop[] = [];
  private jets: Pending[] = [];
  private tickN = 0;
  private seq = 0;
  private prog!: WebGLProgram;
  private tex!: WebGLTexture;
  private u!: Record<string, WebGLUniformLocation | null>;
  private readonly pal = new Float32Array(PAL.length * 3);
  /** Ring packets, oldest first: depth, row, start tick, signed strength (negative: right side). */
  private readonly ringBuf = new Float32Array(MAX_RINGS * 4);
  private ringN = 0;

  constructor(
    readonly mapWidth: number,
    readonly mapHeight: number,
  ) {
    this.yMin = -mapHeight;
    this.rows = Math.ceil((mapHeight * 2.8) / R);
    this.h = new Float32Array(COLS * 2 * this.rows);
    this.v = new Float32Array(COLS * 2 * this.rows);
    for (let i = 0; i < PAL.length; i++) this.pal.set(rgb(PAL[i]!), i * 3);
  }

  init(gl: WebGL2RenderingContext): void {
    this.prog = compile(gl, FULLSCREEN_VS, WALL_FS);
    this.u = uniforms(gl, this.prog, [
      'u_view',
      'u_origin',
      'u_scale',
      'u_map',
      'u_zone',
      'u_time',
      'u_wave',
      'u_grid',
      'u_pal',
      'u_fresh',
      'u_rings',
      'u_ringN',
    ]);
    this.tex = texture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, COLS * 2, this.rows, 0, gl.RED, gl.FLOAT, this.h);
  }

  dispose(gl: WebGL2RenderingContext): void {
    gl.deleteProgram(this.prog);
    gl.deleteTexture(this.tex);
  }

  /** A new round: still water, nothing in flight. */
  reset(): void {
    this.h.fill(0);
    this.v.fill(0);
    this.box.set([0, -1, 0, -1, 0, -1, 0, -1]);
    this.sinkers = [];
    this.drops = [];
    this.jets = [];
    this.ringN = 0;
    this.dirty = true;
  }

  /** Start a ring packet at depth `d`, row `y` (drops the oldest when full). */
  ring(side: number, d: number, y: number, strength: number): void {
    const b = this.ringBuf;
    if (this.ringN === MAX_RINGS) {
      b.copyWithin(0, 4);
      this.ringN--;
    }
    const o = this.ringN * 4;
    b[o] = d;
    b[o + 1] = y;
    b[o + 2] = this.tickN;
    b[o + 3] = side === 1 ? -strength : strength;
    this.ringN++;
  }

  private pruneRings(): void {
    const b = this.ringBuf;
    let k = 0;
    while (k < this.ringN && this.tickN - b[k * 4 + 2]! > 600) k++;
    if (k === 0) return;
    b.copyWithin(0, k * 4);
    this.ringN -= k;
  }

  /** Where the face stands at row `y`: cells outward from the zone line. */
  face(side: number, y: number, t: number): number {
    return faceRoll(side, y, t) + KF * this.at(side, 0, y);
  }

  private at(side: number, d: number, y: number): number {
    const c = Math.max(0, Math.min(COLS - 1, Math.floor(d / R)));
    const r = Math.floor((y - this.yMin) / R);
    if (r < 0 || r >= this.rows) return 0;
    return this.h[r * COLS * 2 + side * COLS + c]!;
  }

  /** Push the surface at depth `d`, row `y` by `amp` (negative pushes in), over `rad` cells. */
  poke(side: number, d: number, y: number, amp: number, rad: number): void {
    const cc = d / R;
    const cr = (y - this.yMin) / R;
    const n = Math.max(1, Math.ceil(rad / R));
    const ci = Math.floor(cc);
    const ri = Math.floor(cr);
    const b = side * 4;
    const box = this.box;
    for (let r = ri - n; r <= ri + n; r++) {
      if (r < 0 || r >= this.rows) continue;
      for (let c = ci - n; c <= ci + n; c++) {
        if (c < 0 || c >= COLS) continue;
        const dx = c + 0.5 - cc;
        const dy = r + 0.5 - cr;
        const k = 1 - (dx * dx + dy * dy) / ((n + 0.5) * (n + 0.5));
        if (k <= 0) continue;
        this.v[r * COLS * 2 + side * COLS + c]! += amp * k * k;
      }
    }
    if (box[b]! > box[b + 1]!) {
      box[b] = ci - n;
      box[b + 1] = ci + n;
      box[b + 2] = ri - n;
      box[b + 3] = ri + n;
    } else {
      box[b] = Math.min(box[b]!, ci - n);
      box[b + 1] = Math.max(box[b + 1]!, ci + n);
      box[b + 2] = Math.min(box[b + 2]!, ri - n);
      box[b + 3] = Math.max(box[b + 3]!, ri + n);
    }
    box[b] = Math.max(0, box[b]!);
    box[b + 1] = Math.min(COLS - 1, box[b + 1]!);
    box[b + 2] = Math.max(0, box[b + 2]!);
    box[b + 3] = Math.min(this.rows - 1, box[b + 3]!);
  }

  /**
   * A shell went into the wall on `side` at map row `y`, flying (vx, vy) cells/tick: the face
   * caves in, spray flies back out, and the shell ploughs on inside.
   */
  absorb(side: number, y: number, vx: number, vy: number): void {
    const vin = Math.max(0.3, side === 0 ? -vx : vx);
    const speed = Math.hypot(vin, vy);
    const seed = ++this.seq;
    const amp = -Math.min(6, 1.5 + speed * 0.75);
    this.poke(side, 0, y, amp, 4 + speed * 0.8);
    this.sinkers.push({ side, d: 0, y, vd: vin, vy, age: 0, rest: -1, seed });
    this.ring(side, 0, y, Math.min(2.4, 0.8 + speed * 0.3));
    // the crown: spray thrown back out round the hole, fanning up and down the face
    const n = Math.round(16 + speed * 10);
    for (let i = 0; i < n; i++) {
      const a = h01(seed * 97 + i, 1);
      const b = h01(seed * 97 + i, 2);
      const out = (0.35 + a * 0.9) * (0.5 + speed * 0.15);
      this.drops.push({
        side,
        d: -this.face(side, y, this.tickN) + 0.5,
        y: y + (b - 0.5) * 4,
        vd: -out,
        vy: vy * 0.25 + (b - 0.5) * (0.9 + speed * 0.5) - 0.25,
        age: 0,
        col: PAL[4 + Math.floor(h01(seed * 97 + i, 3) * 4)]!,
        bubble: false,
      });
    }
    // the cavity closes and throws a jet straight back out a moment later
    this.jets.push({ side, y, speed, at: this.tickN + 10 + Math.round(speed * 2), seed });
  }

  /** One cosmetic tick: the wave field, the swallowed shells and every drop and bubble. */
  tick(t: number): void {
    this.tickN = t;
    this.pruneRings();
    this.stepField();
    this.stepJets(t);
    this.stepSinkers();
    this.stepDrops(t);
  }

  private stepField(): void {
    const h = this.h;
    const v = this.v;
    const TW = COLS * 2;
    const rows = this.rows;
    for (let s = 0; s < 2; s++) {
      const b = s * 4;
      const box = this.box;
      if (box[b]! > box[b + 1]!) continue;
      // waves travel under one grid cell per tick: grow the box by one each way
      const c0 = Math.max(0, box[b]! - 1);
      const c1 = Math.min(COLS - 1, box[b + 1]! + 1);
      const r0 = Math.max(0, box[b + 2]! - 1);
      const r1 = Math.min(rows - 1, box[b + 3]! + 1);
      box[b] = c0;
      box[b + 1] = c1;
      box[b + 2] = r0;
      box[b + 3] = r1;
      const off = s * COLS;
      for (let r = r0; r <= r1; r++) {
        const row = r * TW + off;
        for (let c = c0; c <= c1; c++) {
          const i = row + c;
          const hc = h[i]!;
          // the face (c = 0) is a free surface: it mirrors, so it sloshes hardest
          const l = c > 0 ? h[i - 1]! : hc;
          const rr = c < COLS - 1 ? h[i + 1]! : 0;
          const up = r > 0 ? h[i - TW]! : 0;
          const dn = r < rows - 1 ? h[i + TW]! : 0;
          v[i] = (v[i]! + C2 * (l + rr + up + dn - 4 * hc)) * DAMP;
        }
      }
      let peak = 0;
      for (let r = r0; r <= r1; r++) {
        const row = r * TW + off;
        for (let c = c0; c <= c1; c++) {
          const i = row + c;
          const nh = (h[i]! + v[i]!) * 0.999;
          h[i] = nh;
          const a = nh < 0 ? -nh : nh;
          if (a > peak) peak = a;
        }
      }
      if (peak < 0.02 && this.restingOn(s) === false) {
        for (let r = r0; r <= r1; r++) {
          h.fill(0, r * TW + off + c0, r * TW + off + c1 + 1);
          v.fill(0, r * TW + off + c0, r * TW + off + c1 + 1);
        }
        box[b] = 0;
        box[b + 1] = -1;
      }
      this.dirty = true;
    }
  }

  /** True while anything on `side` can still disturb the surface. */
  private restingOn(side: number): boolean {
    for (const k of this.sinkers) if (k.side === side) return true;
    for (const d of this.drops) if (d.side === side) return true;
    for (const j of this.jets) if (j.side === side) return true;
    return false;
  }

  private stepJets(t: number): void {
    for (let i = this.jets.length - 1; i >= 0; i--) {
      const j = this.jets[i]!;
      if (t < j.at) continue;
      this.jets.splice(i, 1);
      // the collapsing cavity: the face bulges back out and a narrow jet leaves it
      this.poke(j.side, 0, j.y, Math.min(2.2, 0.6 + j.speed * 0.3), 4);
      this.ring(j.side, 0, j.y, Math.min(1.4, 0.5 + j.speed * 0.15));
      const n = Math.round(10 + j.speed * 8);
      for (let k = 0; k < n; k++) {
        const a = h01(j.seed * 131 + k, 5);
        const b = h01(j.seed * 131 + k, 6);
        this.drops.push({
          side: j.side,
          d: -this.face(j.side, j.y, t) + 0.5,
          y: j.y + (b - 0.5) * 2,
          vd: -(0.5 + a * (0.6 + j.speed * 0.15)),
          vy: (b - 0.5) * 0.5 - 0.35 - a * 0.3,
          age: 0,
          col: a > 0.75 ? TOXIC : PAL[5 + Math.floor(b * 2)]!,
          bubble: false,
        });
      }
    }
  }

  private stepSinkers(): void {
    for (let i = this.sinkers.length - 1; i >= 0; i--) {
      const k = this.sinkers[i]!;
      k.age++;
      if (k.rest >= 0) {
        k.rest++;
        if (k.rest === 1) {
          // it gives up its last heat in one soft pulse
          this.poke(k.side, k.d, k.y, 0.6, 5);
          this.ring(k.side, k.d, k.y, 0.9);
        }
        if (k.rest > 50) this.sinkers.splice(i, 1);
        continue;
      }
      // ploughing through thick fallout: quadratic drag plus a little viscous drag; it still
      // sinks slowly under its own weight
      const s = Math.hypot(k.vd, k.vy);
      const drag = 0.07 * s + 0.025;
      k.vd -= k.vd * drag;
      k.vy -= k.vy * drag;
      k.vy += 0.006;
      k.d += k.vd;
      k.y += k.vy;
      // its wake pushes the surface down along the track
      if (k.d < DEPTH) this.poke(k.side, k.d, k.y, -Math.min(0.3, s * 0.08), 3);
      // a trail of bubbles, more while it is fast
      if (h01(k.seed * 7919 + k.age, 9) < Math.min(0.9, s * 0.8)) {
        const r = h01(k.seed * 7919 + k.age, 10);
        this.drops.push({
          side: k.side,
          d: k.d,
          y: k.y + (r - 0.5) * 2,
          vd: -0.05 - r * 0.1,
          vy: (r - 0.5) * 0.2,
          age: 0,
          col: r > 0.6 ? PAL[6]! : PAL[5]!,
          bubble: true,
        });
      }
      if (k.vd < 0.06 || k.age > 150 || k.d > DEPTH - 4) k.rest = 0;
    }
  }

  private stepDrops(t: number): void {
    const drops = this.drops;
    let w = 0;
    for (let i = 0; i < drops.length; i++) {
      const p = drops[i]!;
      p.age++;
      if (p.bubble) {
        // bubbles rise to the face (out is up for a wall lying on its side), wobbling
        p.vd -= 0.012;
        p.vd *= 0.96;
        p.vy = p.vy * 0.9 + (h01(i + p.age * 13, 21) - 0.5) * 0.08;
        p.d += p.vd;
        p.y += p.vy;
        if (p.d <= -this.face(p.side, p.y, t) + 1 || p.age > 400) {
          this.poke(p.side, 0, p.y, 0.12, 2);
          continue;
        }
      } else {
        // spray: gravity down, the wall's pull back in, a breath of air drag
        p.vy += GRAVITY;
        p.vd += PULL;
        p.vd *= 0.995;
        p.vy *= 0.995;
        p.d += p.vd;
        p.y += p.vy;
        if ((p.vd > 0 && p.d >= -this.face(p.side, p.y, t)) || p.age > 300) {
          this.poke(p.side, 0, p.y, -0.15, 2);
          continue;
        }
      }
      drops[w++] = p;
    }
    drops.length = w;
  }

  /** Paint the wall over everything drawn so far. Leaves the program and blend state changed. */
  draw(
    gl: WebGL2RenderingContext,
    vao: WebGLVertexArrayObject,
    view: [number, number],
    origin: [number, number],
    scale: number,
    zone: number,
    t: number,
    fresh: number,
  ): void {
    if (this.dirty) {
      this.dirty = false;
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, COLS * 2, this.rows, gl.RED, gl.FLOAT, this.h);
    }
    const u = this.u;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(vao);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(u.u_wave!, 0);
    gl.uniform2f(u.u_view!, view[0], view[1]);
    gl.uniform2f(u.u_origin!, origin[0], origin[1]);
    gl.uniform1f(u.u_scale!, scale);
    gl.uniform2f(u.u_map!, this.mapWidth, this.mapHeight);
    gl.uniform1f(u.u_zone!, zone);
    gl.uniform1f(u.u_time!, t);
    const box = this.box;
    const act = (box[0]! <= box[1]! ? 1 : 0) | (box[4]! <= box[5]! ? 2 : 0);
    gl.uniform3f(u.u_grid!, this.rows, this.yMin, act);
    gl.uniform3fv(u.u_pal!, this.pal);
    gl.uniform1f(u.u_fresh!, fresh);
    gl.uniform4fv(u.u_rings!, this.ringBuf);
    gl.uniform1i(u.u_ringN!, this.ringN);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }

  /** The swallowed shells, spray and bubbles, in map cells, snapped to whole cells. */
  drawParticles(normal: QuadBatch, additive: QuadBatch, zone: number): void {
    const W = this.mapWidth;
    const toX = (side: number, d: number) => {
      const u = zone - d;
      return side === 0 ? u : W - u;
    };
    for (const p of this.drops) {
      const x = Math.floor(toX(p.side, p.d)) + 0.5;
      const y = Math.floor(p.y) + 0.5;
      const fade = p.bubble ? 0.75 : p.age < 40 ? 1 : 0.8;
      normal.push(x, y, 1, 1, p.col, fade);
      if (!p.bubble && p.col === TOXIC) additive.push(x, y, 1, 1, TOXIC, 0.35);
    }
    for (const k of this.sinkers) {
      const s = Math.hypot(k.vd, k.vy);
      // heat drains with speed and time; stepped colours, no smooth glow
      const bySpeed = s > 1.2 ? 0 : s > 0.5 ? 1 : 2;
      const heat = Math.min(
        HEAT.length - 1,
        k.rest >= 0 ? 3 + Math.floor(k.rest / 18) : Math.max(bySpeed, Math.floor(k.age / 24)),
      );
      const col = HEAT[heat]!;
      const x = Math.floor(toX(k.side, k.d)) + 0.5;
      const y = Math.floor(k.y) + 0.5;
      const size = heat <= 1 ? 3 : 2;
      normal.push(x, y, size, size, col, 1);
      if (heat <= 2) {
        // a hard halo of lit fallout round it, one cell out
        additive.push(x, y, size + 2, size + 2, heat === 0 ? BRIGHT : TOXIC, 0.22);
      }
    }
  }
}
