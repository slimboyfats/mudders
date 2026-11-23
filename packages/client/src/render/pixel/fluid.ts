/**
 * GPU smoke and gas: an Eulerian fluid on a grid over the map, with the terrain as its walls.
 *
 * A stable-fluids solver (Stam's semi-Lagrangian advection, vorticity confinement, a Jacobi
 * pressure solve) in WebGL2 fragment passes, after the structure of Pavel Dobryakov's MIT
 * "WebGL Fluid Simulation" (https://github.com/PavelDoGreat/WebGL-Fluid-Simulation): advect,
 * curl, vorticity, divergence, pressure, gradient subtract. The shaders here are our own, written
 * for a grid with solid cells: velocity and dye are zero inside the terrain, so smoke pools under
 * overhangs, pours out of craters and climbs cliff faces instead of passing through them.
 *
 * Four dyes ride the velocity field: smoke, heat (which lifts the air around it and tints the
 * smoke orange), gas (which sinks) and fire. Fire is burning gas: it swells (a source in the
 * pressure solve, so a blast shoves the air away from itself and off the ground instead of
 * drawing a disc), climbs hard, and burns out into heat and soot. A fireball is therefore a hot
 * bubble that rolls up into a pair of vortices, one each side, like a real one. Effects feed them through {@link FluidSink.splat}, in tick
 * order; the passes are deferred to draw time and run one tick at a time, so a capture replays
 * exactly. Nothing of the field is painted: smoke, fire and gas show as single cells that ride
 * its velocity (see `air.ts`).
 *
 * Needs float render targets (`EXT_color_buffer_float`); without them the fluid is off and
 * everything else carries on.
 */
import { compileKept, texture } from './gl';

/** Anything that can pour into the field: the fluid in the renderer, a recorder in tests. */
export interface FluidSink {
  /**
   * Add to the field around (x, y) (map cells) within radius r. With `radial` the push is
   * outward from the centre at `vx` cells/tick (a blast); otherwise (vx, vy) is a directed push.
   * `smoke`, `heat` and `gas` are dye amounts added at the centre (0..~2), fading to the rim.
   */
  splat(
    x: number,
    y: number,
    r: number,
    vx: number,
    vy: number,
    smoke: number,
    heat: number,
    gas?: number,
    radial?: boolean,
    fire?: number,
  ): void;
  /**
   * Spin the air about (x, y) within radius r: a vortex turning at up to `spin` cells/tick,
   * clockwise on screen when positive. Blasts set one each side of their fireball.
   */
  swirl?(x: number, y: number, r: number, spin: number): void;
}

/** Per quality: grid cells per fluid cell, and pressure iterations per tick. */
export const QUALITY_FLUID = {
  low: { div: 4, iters: 8 },
  medium: { div: 2, iters: 12 },
  high: { div: 1, iters: 16 },
} as const;

/** Most splats one tick keeps (the rest are dropped; a nuke's are first in line). */
const MAX_SPLATS = 24;

/**
 * Ticks with nothing poured in before the field goes to sleep (cleared, every pass skipped until
 * the next splat). By then the slowest dye channel (gas, kept 0.998 a tick) is under 1%, so the
 * clear is invisible, and a quiet map stops paying ~19 full-field GPU passes a tick for nothing.
 */
export const FLUID_SLEEP_TICKS = 2400;

/**
 * The field is stepped only where something is in the air. It is cut into tiles of
 * {@link tileSize} fluid cells; every {@link ACT_EVERY} ticks a small pass asks of each tile
 * whether any air in it moves or carries dye, and the answer is read back without waiting for it.
 * The passes then run in boxes around the tiles that said yes (and their neighbours), and a tile
 * that has said no {@link ACT_HOLD} times in a row is cleared. A blast and its plume cost their
 * own area, not the whole map's, 20 passes a tick.
 *
 * What a tile may hold when it is dropped: air slower than 0.01 cells a tick and under 0.02 of
 * dye, which is below what moves a particle (`air.ts`) or wakes the turbulence and the wind in
 * the force pass. The neighbour ring is wider than the air can cross between two looks.
 */
const ACT_EVERY = 4;
const ACT_HOLD = 3;
/** Ticks an unanswered look may stay out before the whole field is stepped instead. */
const ACT_LOST = 120;
/** Most boxes the passes are drawn in; more runs of tiles than this are joined into one. */
const MAX_BOXES = 4;

/** Fluid cells along a tile's side: 64 map cells at High, wider on the coarser fields. */
export function tileSize(div: number): number {
  return div === 1 ? 64 : 32;
}

/**
 * The boxes to step, from the tiles' countdowns (`hold`, `tw` across and `th` down, above zero
 * = in use): every tile in use and the ring around it, as runs of columns, each with the rows
 * its tiles span. Writes `cover` (1 = inside a box) and returns x0, y0, x1, y1 per box in tiles
 * (x1 and y1 past the end).
 */
export function activeBoxes(
  hold: Uint8Array,
  tw: number,
  th: number,
  cover: Uint8Array,
  out: number[],
): number {
  let n = 0;
  let runX0 = -1;
  let y0 = th;
  let y1 = 0;
  for (let x = 0; x <= tw; x++) {
    // rows in use in this column or the one on either side, widened by one
    let lo = th;
    let hi = -1;
    if (x < tw) {
      for (let xx = Math.max(0, x - 1); xx <= Math.min(tw - 1, x + 1); xx++) {
        for (let y = 0; y < th; y++) {
          if (hold[y * tw + xx]! > 0) {
            if (y < lo) lo = y;
            if (y > hi) hi = y;
          }
        }
      }
    }
    if (hi >= 0) {
      if (runX0 < 0) {
        runX0 = x;
        y0 = th;
        y1 = 0;
      }
      y0 = Math.min(y0, Math.max(0, lo - 1));
      y1 = Math.max(y1, Math.min(th, hi + 2));
    } else if (runX0 >= 0) {
      out[n * 4] = runX0;
      out[n * 4 + 1] = y0;
      out[n * 4 + 2] = x;
      out[n * 4 + 3] = y1;
      n++;
      runX0 = -1;
    }
  }
  if (n > MAX_BOXES) {
    let a = th;
    let b = 0;
    for (let i = 0; i < n; i++) {
      a = Math.min(a, out[i * 4 + 1]!);
      b = Math.max(b, out[i * 4 + 3]!);
    }
    out[2] = out[(n - 1) * 4 + 2]!;
    out[1] = a;
    out[3] = b;
    n = 1;
  }
  cover.fill(0);
  for (let i = 0; i < n; i++) {
    for (let y = out[i * 4 + 1]!; y < out[i * 4 + 3]!; y++)
      cover.fill(1, y * tw + out[i * 4]!, y * tw + out[i * 4 + 2]!);
  }
  return n;
}

/**
 * Fire, as numbers (GLSL float literals). Lift per unit of fire per tick; how much each unit
 * swells the air per tick; what is left of it each tick, less the snuff; and the soot and heat a
 * burnt unit leaves behind.
 */
const FIRE_LIFT = '0.03';
const FIRE_SWELL = '0.07';
const FIRE_KEEP = 0.985;
const FIRE_SNUFF = '0.007';
const FIRE_SOOT = '0.3';
const FIRE_HEAT = '0.3';

const FULL_VS = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  // one triangle over the whole target
  vec2 p = vec2((gl_VertexID & 1) << 2, (gl_VertexID & 2) << 1);
  v_uv = p * 0.5;
  gl_Position = vec4(p - 1.0, 0.0, 1.0);
}`;

/** Shared head: the grid, the terrain and the solid test. Row 0 is the top of the map. */
const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
in vec2 v_uv;
uniform vec2 u_size;   // fluid cells across and down
uniform usampler2D u_terrain;
uniform ivec2 u_map;
uniform int u_div;
bool solidAt(ivec2 f) {
  ivec2 c = f * u_div + u_div / 2;
  if (c.x < 0 || c.x >= u_map.x || c.y < 0) return false;
  if (c.y >= u_map.y) return true;
  return texelFetch(u_terrain, c, 0).r != 0u;
}
bool solidAt(vec2 uv) { return solidAt(ivec2(floor(uv * u_size))); }
`;

/** Pours this tick's splats in: directed or radial pushes and dye. Two targets: velocity, dye. */
const SPLAT_FS =
  HEAD +
  `uniform sampler2D u_vel;
uniform sampler2D u_dye;
uniform int u_n;
uniform vec4 u_sA[${MAX_SPLATS}]; // x, y (fluid cells), r (negative = radial), gas
uniform vec4 u_sB[${MAX_SPLATS}]; // vx, vy (or strength), smoke, heat
uniform vec2 u_sC[${MAX_SPLATS}]; // fire, spin
layout(location = 0) out vec4 oVel;
layout(location = 1) out vec4 oDye;
void main() {
  vec2 p = v_uv * u_size;
  vec2 v = texture(u_vel, v_uv).xy;
  vec4 d = texture(u_dye, v_uv);
  for (int i = 0; i < ${MAX_SPLATS}; i++) {
    if (i >= u_n) break;
    vec4 a = u_sA[i];
    vec4 b = u_sB[i];
    float r = abs(a.z);
    vec2 off = p - a.xy;
    float dist = length(off);
    if (dist > r) continue;
    float w = 1.0 - smoothstep(0.0, r, dist);
    if (a.z < 0.0) v += (dist > 0.01 ? off / dist : vec2(0.0)) * b.x * w;
    else v += b.xy * w;
    vec2 c = u_sC[i];
    // spin: a vortex about the centre, strongest part-way out (positive = clockwise on screen)
    if (c.y != 0.0) v += vec2(-off.y, off.x) / r * c.y * w * (1.0 - w) * 4.0;
    d += vec4(b.z, b.w, a.w, c.x) * w;
  }
  oVel = vec4(v, 0.0, 1.0);
  oDye = min(d, vec4(3.0));
}`;

/** Semi-Lagrangian advection of a field by the velocity, with per-channel dissipation. */
const ADVECT_FS =
  HEAD +
  `uniform sampler2D u_vel;
uniform sampler2D u_src;
uniform vec4 u_keep;
uniform float u_burn; // 1 on the dye pass: fire burns out into heat and soot
out vec4 o;
void main() {
  if (solidAt(v_uv)) { o = vec4(0.0); return; }
  vec2 v = texture(u_vel, v_uv).xy;
  vec2 from = v_uv - v / u_size;
  vec4 s = texture(u_src, from);
  o = s * u_keep;
  if (u_burn > 0.5) {
    // thin flame goes out at once (crisp tongues, no haze); what burns leaves heat and soot
    // and it thins as it swells, by as much as the pressure solve lets it spread
    float f = max(0.0, s.w * u_keep.w * (1.0 - min(0.5, s.w * ${FIRE_SWELL} * 0.6)) - ${FIRE_SNUFF});
    float burnt = s.w - f;
    o.w = f;
    o.x = min(3.0, o.x + burnt * ${FIRE_SOOT});
    o.y = min(3.0, o.y + burnt * ${FIRE_HEAT});
  }
}`;

const CURL_FS =
  HEAD +
  `uniform sampler2D u_vel;
out vec4 o;
void main() {
  vec2 t = 1.0 / u_size;
  float L = texture(u_vel, v_uv - vec2(t.x, 0.0)).y;
  float R = texture(u_vel, v_uv + vec2(t.x, 0.0)).y;
  float T = texture(u_vel, v_uv - vec2(0.0, t.y)).x;
  float B = texture(u_vel, v_uv + vec2(0.0, t.y)).x;
  o = vec4(0.5 * ((R - L) - (B - T)), 0.0, 0.0, 1.0);
}`;

/** Vorticity confinement plus the body forces: heat and smoke lift, gas sinks, the wind blows. */
const FORCE_FS =
  HEAD +
  `uniform sampler2D u_vel;
uniform sampler2D u_curl;
uniform sampler2D u_dye;
uniform float u_eps;
uniform float u_wind;
uniform vec2 u_jit;
out vec4 o;
void main() {
  if (solidAt(v_uv)) { o = vec4(0.0); return; }
  vec2 t = 1.0 / u_size;
  float L = texture(u_curl, v_uv - vec2(t.x, 0.0)).x;
  float R = texture(u_curl, v_uv + vec2(t.x, 0.0)).x;
  float T = texture(u_curl, v_uv - vec2(0.0, t.y)).x;
  float B = texture(u_curl, v_uv + vec2(0.0, t.y)).x;
  float C = texture(u_curl, v_uv).x;
  vec2 force = 0.5 * vec2(abs(B) - abs(T), abs(L) - abs(R));
  force /= length(force) + 0.0001;
  force *= u_eps * C;
  vec2 v = texture(u_vel, v_uv).xy + force;
  vec4 d = texture(u_dye, v_uv);
  // hot air climbs, smoke drifts up a little on its own, gas sinks
  v.y -= d.y * 0.07 + d.x * 0.01 - d.z * 0.01 + d.w * ${FIRE_LIFT};
  // the wind leans on what hangs in the air; clear air stays still, so the field holds only
  // what blasts and heat stirred up (particles ride it, and have their own wind)
  v.x += u_wind * min(1.0, (d.x + d.y + d.z + d.w) * 4.0);
  // a whisper of turbulence, so a symmetric blast still curls into eddies
  if (d.x + d.y + d.z + d.w > 0.02) {
    vec2 c = floor(v_uv * u_size);
    float h = fract(sin(dot(c + u_jit, vec2(12.9898, 78.233))) * 43758.5453);
    float h2 = fract(sin(dot(c + u_jit, vec2(39.3467, 11.135))) * 24634.6345);
    v += (vec2(h, h2) - 0.5) * 0.16 * min(1.0, d.y * 2.0 + d.x + d.w * 2.0);
  }
  float sp = length(v);
  if (sp > 2.5) v *= 2.5 / sp;
  o = vec4(v, 0.0, 1.0);
}`;

const DIV_FS =
  HEAD +
  `uniform sampler2D u_vel;
uniform sampler2D u_dye;
out vec4 o;
void main() {
  vec2 t = 1.0 / u_size;
  ivec2 f = ivec2(floor(v_uv * u_size));
  float L = solidAt(f - ivec2(1, 0)) ? 0.0 : texture(u_vel, v_uv - vec2(t.x, 0.0)).x;
  float R = solidAt(f + ivec2(1, 0)) ? 0.0 : texture(u_vel, v_uv + vec2(t.x, 0.0)).x;
  float T = solidAt(f - ivec2(0, 1)) ? 0.0 : texture(u_vel, v_uv - vec2(0.0, t.y)).y;
  float B = solidAt(f + ivec2(0, 1)) ? 0.0 : texture(u_vel, v_uv + vec2(0.0, t.y)).y;
  // burning gas swells: a source, so the solve pushes the air out of the fireball's way
  float swell = solidAt(f) ? 0.0 : texture(u_dye, v_uv).w * ${FIRE_SWELL};
  o = vec4(0.5 * (R - L + B - T) - swell, 0.0, 0.0, 1.0);
}`;

/** One Jacobi step; a solid neighbour takes this cell's pressure (no flow through the wall). */
const PRESSURE_FS =
  HEAD +
  `uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
out vec4 o;
void main() {
  vec2 t = 1.0 / u_size;
  ivec2 f = ivec2(floor(v_uv * u_size));
  float C = texture(u_pressure, v_uv).x;
  float L = solidAt(f - ivec2(1, 0)) ? C : texture(u_pressure, v_uv - vec2(t.x, 0.0)).x;
  float R = solidAt(f + ivec2(1, 0)) ? C : texture(u_pressure, v_uv + vec2(t.x, 0.0)).x;
  float T = solidAt(f - ivec2(0, 1)) ? C : texture(u_pressure, v_uv - vec2(0.0, t.y)).x;
  float B = solidAt(f + ivec2(0, 1)) ? C : texture(u_pressure, v_uv + vec2(0.0, t.y)).x;
  float div = texture(u_divergence, v_uv).x;
  o = vec4((L + R + T + B - div) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT_FS =
  HEAD +
  `uniform sampler2D u_pressure;
uniform sampler2D u_vel;
out vec4 o;
void main() {
  if (solidAt(v_uv)) { o = vec4(0.0); return; }
  vec2 t = 1.0 / u_size;
  ivec2 f = ivec2(floor(v_uv * u_size));
  float C = texture(u_pressure, v_uv).x;
  float L = solidAt(f - ivec2(1, 0)) ? C : texture(u_pressure, v_uv - vec2(t.x, 0.0)).x;
  float R = solidAt(f + ivec2(1, 0)) ? C : texture(u_pressure, v_uv + vec2(t.x, 0.0)).x;
  float T = solidAt(f - ivec2(0, 1)) ? C : texture(u_pressure, v_uv - vec2(0.0, t.y)).x;
  float B = solidAt(f + ivec2(0, 1)) ? C : texture(u_pressure, v_uv + vec2(0.0, t.y)).x;
  vec2 v = texture(u_vel, v_uv).xy - 0.5 * vec2(R - L, B - T);
  o = vec4(v, 0.0, 1.0);
}`;

/**
 * One texel per tile: is anything in the air there? Looks at 8 x 8 cells spread over the tile,
 * shifted by `u_jit` from look to look so that nothing thin stays between them.
 */
const ACT_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D u_vel;
uniform sampler2D u_dye;
uniform int u_tile;
uniform ivec2 u_jit;
out vec4 o;
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy) * u_tile + u_jit;
  ivec2 size = textureSize(u_vel, 0);
  int st = u_tile / 8;
  float m = 0.0;
  for (int y = 0; y < 8; y++) {
    for (int x = 0; x < 8; x++) {
      ivec2 c = t + ivec2(x, y) * st;
      if (c.x >= size.x || c.y >= size.y) continue;
      vec2 v = texelFetch(u_vel, c, 0).xy;
      vec4 d = texelFetch(u_dye, c, 0);
      if (dot(v, v) > 0.0001 || d.x + d.y + d.z + d.w > 0.02) m = 1.0;
    }
  }
  o = vec4(m);
}`;

interface Splat {
  a: [number, number, number, number];
  b: [number, number, number, number];
  fire: number;
  spin: number;
}

interface Step {
  wind: number;
  splats: Splat[];
}

type Field = { tex: WebGLTexture; fbo: WebGLFramebuffer };

export class GpuFluid implements FluidSink {
  /** False when float render targets are missing: every call is then a no-op. */
  readonly ok: boolean;
  readonly div: number;
  readonly iters: number;
  readonly w: number;
  readonly h: number;
  private readonly gl: WebGL2RenderingContext;
  private readonly mapW: number;
  private readonly mapH: number;
  private vel: [Field, Field] | undefined;
  private dye: [Field, Field] | undefined;
  private pressure: [Field, Field] | undefined;
  private div1!: Field;
  private curl!: Field;
  /** Framebuffers writing velocity and dye together, one per ping-pong side. */
  private pair: [WebGLFramebuffer, WebGLFramebuffer] | undefined;
  private cur = 0;
  private progs: Record<string, WebGLProgram> = {};
  private uni: Record<string, Record<string, WebGLUniformLocation | null>> = {};
  private vao!: WebGLVertexArrayObject;
  private pending: Step[] = [];
  private tick = 0;
  private readonly sA = new Float32Array(MAX_SPLATS * 4);
  private readonly sB = new Float32Array(MAX_SPLATS * 4);
  private readonly sC = new Float32Array(MAX_SPLATS * 2);
  /** Set once anything has been poured in; until then every pass is skipped. */
  private live = false;
  /** Queued ticks in a row with nothing poured in (see {@link FLUID_SLEEP_TICKS}). */
  private quiet = 0;
  /**
   * Most queued ticks one {@link update} runs. Live play sets a small number so a late frame
   * (which queues several ticks) doesn't pay for all of them on the GPU and make the next frame
   * later still; the dropped ticks' splats are poured into the first tick that runs. Captures
   * leave it unbounded so frames replay the same however they are drawn.
   */
  maxSteps = Infinity;
  /** Activity tiles: side in fluid cells, and how many across and down. */
  private readonly tile: number;
  private readonly tw: number;
  private readonly th: number;
  /** Per tile, looks left before it is dropped (0 = empty and cleared). */
  private readonly hold: Uint8Array;
  /** Per tile, 1 inside the boxes the passes run in. Outside them every field is zero. */
  private cover: Uint8Array;
  private coverNext: Uint8Array;
  /** The boxes in fluid cells: x, y, width, height each. */
  private readonly boxes: number[] = [];
  private boxN = 0;
  private readonly tileBoxes: number[] = [];
  private boxesStale = false;
  private act: Field | undefined;
  private actBuf: WebGLBuffer | null = null;
  private actSync: WebGLSync | null = null;
  private actSent = 0;
  private actNext = 0;
  private actN = 0;
  private readonly actPx: Uint8Array;

  constructor(gl: WebGL2RenderingContext, mapW: number, mapH: number, div: number, iters: number) {
    this.gl = gl;
    this.mapW = mapW;
    this.mapH = mapH;
    this.div = div;
    this.iters = iters;
    this.w = Math.max(1, Math.ceil(mapW / div));
    this.h = Math.max(1, Math.ceil(mapH / div));
    this.tile = tileSize(div);
    this.tw = Math.ceil(this.w / this.tile);
    this.th = Math.ceil(this.h / this.tile);
    this.hold = new Uint8Array(this.tw * this.th);
    this.cover = new Uint8Array(this.tw * this.th);
    this.coverNext = new Uint8Array(this.tw * this.th);
    this.actPx = new Uint8Array(this.tw * this.th * 4);
    this.ok = gl.getExtension('EXT_color_buffer_float') !== null;
    if (!this.ok) return;
    // each field holds only the channels it uses: half or a quarter of the memory to move
    const field = (channels: 1 | 2 | 4 = 4): Field => {
      const tex = texture(gl, gl.LINEAR);
      const [inner, format] =
        channels === 1
          ? [gl.R16F, gl.RED]
          : channels === 2
            ? [gl.RG16F, gl.RG]
            : [gl.RGBA16F, gl.RGBA];
      gl.texImage2D(gl.TEXTURE_2D, 0, inner, this.w, this.h, 0, format, gl.HALF_FLOAT, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fbo };
    };
    this.vel = [field(2), field(2)];
    this.dye = [field(), field()];
    this.pressure = [field(1), field(1)];
    this.div1 = field(1);
    this.curl = field(1);
    {
      const tex = texture(gl, gl.NEAREST);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        this.tw,
        this.th,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this.act = { tex, fbo };
      this.actBuf = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.actBuf);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.actPx.length, gl.STREAM_READ);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    }
    const pair = (i: 0 | 1): WebGLFramebuffer => {
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.vel![i].tex,
        0,
      );
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT1,
        gl.TEXTURE_2D,
        this.dye![i].tex,
        0,
      );
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      return fbo;
    };
    this.pair = [pair(0), pair(1)];
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) {
      (this as { ok: boolean }).ok = false;
      this.dispose();
      return;
    }
    // What never changes is set once here, not before every pass (a tick is ~20 passes): the
    // field size, the terrain's unit, and the texture unit each sampler reads (`units`, in order
    // from unit 0; a `null` skips a unit).
    const was = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    const mk = (name: string, fs: string, units: (string | null)[], names: string[]): void => {
      const p = compileKept(gl, FULL_VS, fs);
      this.progs[name] = p;
      const u: Record<string, WebGLUniformLocation | null> = {};
      for (const n of ['u_size', 'u_terrain', 'u_map', 'u_div', ...names])
        u[n] = gl.getUniformLocation(p, n);
      this.uni[name] = u;
      gl.useProgram(p);
      gl.uniform2f(u.u_size!, this.w, this.h);
      gl.uniform1i(u.u_terrain!, 9);
      gl.uniform2i(u.u_map!, this.mapW, this.mapH);
      gl.uniform1i(u.u_div!, this.div);
      units.forEach((n, unit) => {
        if (n) gl.uniform1i(gl.getUniformLocation(p, n), unit);
      });
    };
    mk('splat', SPLAT_FS, ['u_vel', 'u_dye'], ['u_n', 'u_sA', 'u_sB', 'u_sC']);
    mk('advect', ADVECT_FS, ['u_vel', 'u_src'], ['u_keep', 'u_burn']);
    mk('curl', CURL_FS, ['u_vel'], []);
    mk('force', FORCE_FS, ['u_vel', 'u_curl', 'u_dye'], ['u_eps', 'u_wind', 'u_jit']);
    mk('div', DIV_FS, ['u_vel', null, 'u_dye'], []);
    mk('pressure', PRESSURE_FS, ['u_pressure', 'u_divergence'], []);
    mk('gradient', GRADIENT_FS, ['u_pressure', 'u_vel'], []);
    mk('act', ACT_FS, ['u_vel', 'u_dye'], ['u_tile', 'u_jit']);
    gl.uniform1i(this.uni.act!.u_tile!, this.tile);
    gl.useProgram(was);
    this.vao = gl.createVertexArray();
  }

  splat(
    x: number,
    y: number,
    r: number,
    vx: number,
    vy: number,
    smoke: number,
    heat: number,
    gas = 0,
    radial = false,
    fire = 0,
  ): void {
    if (!this.ok) return;
    this.ensureStep();
    const splats = this.pending[this.pending.length - 1]!.splats;
    if (splats.length >= MAX_SPLATS) return;
    const d = this.div;
    splats.push({
      a: [x / d, y / d, (Math.max(1, r) / d) * (radial ? -1 : 1), gas],
      b: [vx / d, vy / d, smoke, heat],
      fire,
      spin: 0,
    });
    this.live = true;
  }

  swirl(x: number, y: number, r: number, spin: number): void {
    if (!this.ok) return;
    this.ensureStep();
    const splats = this.pending[this.pending.length - 1]!.splats;
    if (splats.length >= MAX_SPLATS) return;
    const d = this.div;
    splats.push({
      a: [x / d, y / d, Math.max(1, r) / d, 0],
      b: [0, 0, 0, 0],
      fire: 0,
      spin: spin / d,
    });
    this.live = true;
  }

  /** Queue one tick of motion; the splats added before the next `step` belong to it. */
  step(wind: number): void {
    if (!this.ok) return;
    this.pending.push({ wind, splats: [] });
  }

  /** Open the step the next splats go into, before any tick has been queued this round. */
  private ensureStep(): void {
    if (this.pending.length === 0) this.pending.push({ wind: 0, splats: [] });
  }

  /** Forget the field and whatever is queued (a new round). */
  clear(): void {
    if (!this.ok) return;
    this.pending = [];
    this.live = false;
    this.quiet = 0;
    this.wipe();
  }

  /** Every tile empty, and whatever look is out forgotten. */
  private resetTiles(): void {
    this.hold.fill(0);
    this.cover.fill(0);
    this.boxN = 0;
    this.boxesStale = false;
    if (this.actSync) this.gl.deleteSync(this.actSync);
    this.actSync = null;
    this.actNext = 0;
  }

  private wipe(): void {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    for (const f of [...this.vel!, ...this.dye!, ...this.pressure!, this.div1, this.curl]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.resetTiles();
  }

  /**
   * Run one tick's passes on the empty field and wipe it again, while nothing has been poured in
   * yet. A phone's GPU driver finishes building a shader the first time it draws with it; left
   * alone, that happens on the frame of the match's first shot (its muzzle smoke wakes the field)
   * and holds that frame for a tenth of a second. Leaves the GL state as {@link update} does.
   */
  warm(terrain: WebGLTexture): void {
    if (!this.ok || this.live) return;
    const gl = this.gl;
    const cur = this.cur;
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, this.w, this.h);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, terrain);
    gl.enable(gl.SCISSOR_TEST);
    this.runStep({
      wind: 0,
      splats: [{ a: [0, 0, 1, 0], b: [0, 0, 0, 0], fire: 0, spin: 0 }],
    });
    this.use('act');
    this.bind(0, this.vel![this.cur]!.tex);
    this.bind(1, this.dye![this.cur]!.tex);
    this.target(this.act!.fbo);
    gl.disable(gl.SCISSOR_TEST);
    this.cur = cur;
    this.wipe();
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }

  /**
   * Run every queued tick. Leaves the framebuffer unbound and the viewport at the fluid's
   * size: the caller sets its own after.
   */
  update(terrain: WebGLTexture): void {
    if (!this.ok) return;
    let steps = this.pending;
    this.pending = [];
    for (const s of steps) this.quiet = s.splats.length > 0 ? 0 : this.quiet + 1;
    if (this.live && this.quiet >= FLUID_SLEEP_TICKS) {
      // long quiet: what is left is invisible, so stop stepping it (the next splat wakes it)
      this.clear();
      steps = [];
    }
    if (!this.live) {
      this.tick += steps.length;
      return;
    }
    if (steps.length > this.maxSteps) {
      // a late frame: run only the last few ticks, with everything poured in the dropped ones
      const keep = steps.slice(steps.length - this.maxSteps);
      const into = keep[0]!.splats;
      for (let i = steps.length - this.maxSteps - 1; i >= 0 && into.length < MAX_SPLATS; i--) {
        const from = steps[i]!.splats;
        for (let j = 0; j < from.length && into.length < MAX_SPLATS; j++) into.push(from[j]!);
      }
      this.tick += steps.length - keep.length;
      steps = keep;
    }
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, this.w, this.h);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, terrain);
    gl.enable(gl.SCISSOR_TEST);
    for (const s of steps) {
      this.collect();
      this.runStep(s);
      this.tick++;
      if (this.boxN > 0 && !this.actSync && this.tick >= this.actNext) {
        this.actNext = this.tick + ACT_EVERY;
        this.look();
      }
    }
    gl.disable(gl.SCISSOR_TEST);
    if (this.boxN === 0 && steps.length > 0) {
      // every tile is empty and cleared: asleep until the next splat
      this.live = false;
      this.quiet = 0;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }

  private use(name: string): Record<string, WebGLUniformLocation | null> {
    this.gl.useProgram(this.progs[name]!);
    return this.uni[name]!;
  }

  /** Put a texture on the unit the current program's sampler reads (set at construction). */
  private bind(unit: number, tex: WebGLTexture): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  /** Draw the current pass into `fbo`, inside the boxes in use. */
  private target(fbo: WebGLFramebuffer): void {
    const gl = this.gl;
    const b = this.boxes;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    for (let i = 0; i < this.boxN; i++) {
      gl.scissor(b[i * 4]!, b[i * 4 + 1]!, b[i * 4 + 2]!, b[i * 4 + 3]!);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  /** Share of the field the passes run over just now, 0..1 (for the performance log). */
  get share(): number {
    if (!this.ok || !this.live) return 0;
    let a = 0;
    for (let i = 0; i < this.boxN; i++) a += this.boxes[i * 4 + 2]! * this.boxes[i * 4 + 3]!;
    return a / (this.w * this.h);
  }

  /** Keep the tiles a splat reaches (x, y, signed r in fluid cells) for the next few looks. */
  private touch(a: readonly number[]): void {
    const t = this.tile;
    const r = Math.abs(a[2]!);
    const x0 = Math.max(0, Math.floor((a[0]! - r) / t));
    const x1 = Math.min(this.tw - 1, Math.floor((a[0]! + r) / t));
    const y0 = Math.max(0, Math.floor((a[1]! - r) / t));
    const y1 = Math.min(this.th - 1, Math.floor((a[1]! + r) / t));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) this.hold[y * this.tw + x] = ACT_HOLD;
    }
    this.boxesStale = true;
  }

  /** Work the boxes out again after the tiles changed, and clear what fell outside them. */
  private setBoxes(): void {
    if (!this.boxesStale) return;
    this.boxesStale = false;
    const gl = this.gl;
    const tw = this.tw;
    const t = this.tile;
    const next = this.coverNext;
    const was = this.cover;
    const n = activeBoxes(this.hold, tw, this.th, next, this.tileBoxes);
    for (let i = 0; i < n * 4; i += 4) {
      const x0 = this.tileBoxes[i]! * t;
      const y0 = this.tileBoxes[i + 1]! * t;
      this.boxes[i] = x0;
      this.boxes[i + 1] = y0;
      this.boxes[i + 2] = Math.min(this.w, this.tileBoxes[i + 2]! * t) - x0;
      this.boxes[i + 3] = Math.min(this.h, this.tileBoxes[i + 3]! * t) - y0;
    }
    this.boxN = n;
    // tiles that left the boxes go back to zero in every field, in runs along a row
    let any = false;
    for (let i = 0; i < next.length && !any; i++) any = was[i] === 1 && next[i] === 0;
    if (any) {
      gl.clearColor(0, 0, 0, 0);
      for (const f of [...this.vel!, ...this.dye!, ...this.pressure!, this.div1, this.curl]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
        for (let y = 0; y < this.th; y++) {
          for (let x = 0; x < tw; x++) {
            if (was[y * tw + x] !== 1 || next[y * tw + x] !== 0) continue;
            let e = x + 1;
            while (e < tw && was[y * tw + e] === 1 && next[y * tw + e] === 0) e++;
            gl.scissor(x * t, y * t, (e - x) * t, t);
            gl.clear(gl.COLOR_BUFFER_BIT);
            x = e;
          }
        }
      }
    }
    this.cover = next;
    this.coverNext = was;
  }

  /** Take one look's answer: a tile with something in it is kept, an empty one counts down. */
  private answer(px: Uint8Array): void {
    const hold = this.hold;
    for (let i = 0; i < hold.length; i++) {
      if (px[i * 4]! > 127) hold[i] = ACT_HOLD;
      else if (hold[i]! > 0) hold[i] = hold[i]! - 1;
    }
    this.boxesStale = true;
  }

  /** Collect the look that is out, if the GPU has finished it. */
  private collect(): void {
    const sync = this.actSync;
    if (!sync) return;
    const gl = this.gl;
    const st = gl.clientWaitSync(sync, 0, 0);
    if (st === gl.TIMEOUT_EXPIRED || st === undefined) {
      if (this.tick - this.actSent < ACT_LOST) return;
      // no answer: step everything until one comes
      this.hold.fill(ACT_HOLD);
      this.boxesStale = true;
      this.actSent = this.tick;
      return;
    }
    gl.deleteSync(sync);
    this.actSync = null;
    if (st === gl.WAIT_FAILED) return;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.actBuf);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.actPx);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.answer(this.actPx);
  }

  /**
   * Ask which tiles hold anything. A capture (no limit on steps) reads the answer at once so
   * that it replays the same; live play leaves it with the GPU and picks it up a frame or two on.
   */
  private look(): void {
    const gl = this.gl;
    const u = this.use('act');
    const st = this.tile >> 3;
    this.actN++;
    gl.uniform2i(u.u_jit!, (this.actN * 3) % st, (this.actN * 5) % st);
    this.bind(0, this.vel![this.cur]!.tex);
    this.bind(1, this.dye![this.cur]!.tex);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, this.tw, this.th);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.act!.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (this.maxSteps === Infinity) {
      gl.readPixels(0, 0, this.tw, this.th, gl.RGBA, gl.UNSIGNED_BYTE, this.actPx);
      this.answer(this.actPx);
    } else {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.actBuf);
      gl.readPixels(0, 0, this.tw, this.th, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      this.actSync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      this.actSent = this.tick;
      gl.flush();
    }
    gl.viewport(0, 0, this.w, this.h);
    gl.enable(gl.SCISSOR_TEST);
  }

  private runStep(s: Step): void {
    const gl = this.gl;
    const vel = this.vel!;
    const dye = this.dye!;
    const pr = this.pressure!;
    let cur = this.cur;
    let nxt = cur ^ 1;
    // 1. pour the tick's splats in (velocity and dye together)
    if (s.splats.length > 0) {
      const n = s.splats.length;
      for (let i = 0; i < n; i++) this.touch(s.splats[i]!.a);
      this.setBoxes();
      const u = this.use('splat');
      for (let i = 0; i < n; i++) {
        this.sA.set(s.splats[i]!.a, i * 4);
        this.sB.set(s.splats[i]!.b, i * 4);
        this.sC[i * 2] = s.splats[i]!.fire;
        this.sC[i * 2 + 1] = s.splats[i]!.spin;
      }
      gl.uniform1i(u.u_n!, n);
      gl.uniform4fv(u.u_sA!, this.sA);
      gl.uniform4fv(u.u_sB!, this.sB);
      gl.uniform2fv(u.u_sC!, this.sC);
      this.bind(0, vel[cur]!.tex);
      this.bind(1, dye[cur]!.tex);
      this.target(this.pair![nxt]!);
      cur = nxt;
      nxt = cur ^ 1;
    } else this.setBoxes();
    if (this.boxN === 0) return;
    // 2. curl, then vorticity confinement with the body forces
    {
      this.use('curl');
      this.bind(0, vel[cur]!.tex);
      this.target(this.curl.fbo);
    }
    {
      const u = this.use('force');
      gl.uniform1f(u.u_eps!, 0.5);
      gl.uniform1f(u.u_wind!, (s.wind * 1.5) / this.div);
      gl.uniform2f(u.u_jit!, (this.tick % 977) * 0.37, (this.tick % 613) * 0.53);
      this.bind(0, vel[cur]!.tex);
      this.bind(1, this.curl.tex);
      this.bind(2, dye[cur]!.tex);
      this.target(vel[nxt]!.fbo);
    }
    // 3. make the velocity divergence-free: divergence, pressure, gradient subtract
    {
      this.use('div');
      this.bind(0, vel[nxt]!.tex);
      this.bind(2, dye[cur]!.tex);
      this.target(this.div1.fbo);
    }
    {
      this.use('pressure');
      this.bind(1, this.div1.tex);
      let p = 0;
      for (let i = 0; i < this.iters; i++) {
        this.bind(0, pr[p]!.tex);
        this.target(pr[p ^ 1]!.fbo);
        p ^= 1;
      }
      this.use('gradient');
      this.bind(0, pr[p]!.tex);
      this.bind(1, vel[nxt]!.tex);
      // writes the velocity back into the other side
      this.target(vel[cur]!.fbo);
    }
    // 4. carry the velocity and the dye along the flow
    {
      const u = this.use('advect');
      this.bind(0, vel[cur]!.tex);
      this.bind(1, vel[cur]!.tex);
      gl.uniform4f(u.u_keep!, 0.992, 0.992, 1, 1);
      gl.uniform1f(u.u_burn!, 0);
      this.target(vel[nxt]!.fbo);
      this.bind(1, dye[cur]!.tex);
      gl.uniform4f(u.u_keep!, 0.997, 0.96, 0.998, FIRE_KEEP);
      gl.uniform1f(u.u_burn!, 1);
      this.target(dye[nxt]!.fbo);
    }
    this.cur = nxt;
  }

  /** The velocity field (fluid cells per tick, RG), for particles that ride the flow. */
  get velocity(): WebGLTexture | null {
    return this.ok && this.live ? this.vel![this.cur]!.tex : null;
  }

  dispose(): void {
    const gl = this.gl;
    for (const f of [...(this.vel ?? []), ...(this.dye ?? []), ...(this.pressure ?? [])]) {
      gl.deleteTexture(f.tex);
      gl.deleteFramebuffer(f.fbo);
    }
    if (this.actSync) gl.deleteSync(this.actSync);
    this.actSync = null;
    gl.deleteBuffer(this.actBuf);
    for (const f of [this.div1, this.curl, this.act]) {
      if (f) {
        gl.deleteTexture(f.tex);
        gl.deleteFramebuffer(f.fbo);
      }
    }
    for (const f of this.pair ?? []) gl.deleteFramebuffer(f);
    // the programs stay with the context (`compileKept`)
    this.vel = this.dye = this.pressure = this.pair = undefined;
    this.progs = {};
  }
}
