import { QUAD_FS } from './shaders';
import { compile } from './gl';
import { PKind, type Emit, type ParticleSink } from './particles';

/**
 * GPU particle engine (§2a): the cosmetic particles live in GPU buffers and are stepped by a
 * transform-feedback vertex shader, so a blast can throw tens of thousands of them. Each sim tick
 * is one update pass over the live range: per-kind motion from {@link KINDS} (gravity, drag, lift,
 * wind, sway) and collision against the terrain grid (R8UI texture, any non-zero cell is solid):
 * sparks skitter, chunks bounce and settle, snow lands, smoke and flame slide along overhangs.
 * Drawing reads the state buffer directly as instanced quads through the shared quad fragment
 * shader, so particles keep the snapped, hard-banded pixel look of the CPU batch.
 *
 * Renderer-only: never feeds the sim. Slots are a ring; spawning only uploads the new slots.
 * Updates are deferred to {@link draw}, where each pending tick runs one pass in order, so the
 * result is the same however frames and ticks interleave (captures replay exactly).
 */

/** Per-kind physics, one row per {@link PKind}. Velocities are cells per tick, y down. */
export interface KindPhysics {
  /** Multiplier on the world gravity. */
  gravity: number;
  dragX: number;
  dragY: number;
  /** Upward pull per tick (buoyancy). */
  lift: number;
  /** How much the lift dies away over the particle's life (0 none, 1 all gone at the end). */
  liftFade: number;
  /** Wind coupling, plus extra coupling that grows with age (higher, older smoke leans more). */
  wind: number;
  windAge: number;
  /** Terminal fall speed (0 = none). */
  maxFall: number;
  /** Sideways sway amplitude (snowflakes). */
  sway: number;
  /** Pull of the swirling turbulence field (cells per tick), so streams curl instead of marching. */
  swirl: number;
  /** Per-particle spread of lift and drag (0 = every particle the same). */
  spread: number;
  /** Collides with terrain. */
  collide: boolean;
  /** Fraction of speed kept off a bounce; below a small speed it settles. */
  bounce: number;
  /** Speed kept along a surface when it hits. */
  friction: number;
  /** Extra smaller copies spawned with each one at full density (the GPU budget's dividend). */
  siblings: number;
}

const K = (p: Partial<KindPhysics>): KindPhysics => ({
  gravity: 0,
  dragX: 1,
  dragY: 1,
  lift: 0,
  liftFade: 0,
  wind: 0,
  windAge: 0,
  maxFall: 0,
  sway: 0,
  swirl: 0,
  spread: 0.4,
  collide: false,
  bounce: 0,
  friction: 1,
  siblings: 0,
  ...p,
});

/** The kinds as data, indexed by {@link PKind}. */
export const KINDS: readonly KindPhysics[] = [
  // Spark: hot bits that skitter and hop along the ground
  K({
    gravity: 0.6,
    dragX: 0.97,
    dragY: 0.97,
    collide: true,
    bounce: 0.45,
    friction: 0.75,
    siblings: 3,
    swirl: 0.006,
  }),
  // Chunk: a clod that thuds, bounces once or twice and settles
  K({ gravity: 1, dragX: 0.99, collide: true, bounce: 0.3, friction: 0.55, siblings: 2 }),
  // Smoke: rises and drifts, flattens under overhangs
  K({ dragX: 0.94, dragY: 0.94, lift: 0.012, wind: 4, collide: true, friction: 0.9, swirl: 0.03 }),
  // Dust: hugs the ground, no collision
  K({ dragX: 0.9, dragY: 0.9, lift: 0.004, swirl: 0.03 }),
  // Flame: licks upward and along ceilings
  K({ dragX: 0.92, dragY: 0.95, lift: 0.02, wind: 3, collide: true, friction: 0.85, swirl: 0.05 }),
  // Snow: sways down and lands on the ground
  K({
    gravity: 0.04,
    dragX: 0.95,
    wind: 3,
    maxFall: 0.32,
    sway: 0.012,
    collide: true,
    friction: 0,
    swirl: 0.01,
  }),
  // Streak: wind gust dash, sails through everything
  K({ dragY: 0.9, wind: 2 }),
  // Glitter: firework star, brakes in the air and pings off the ground
  K({
    gravity: 0.25,
    dragX: 0.93,
    dragY: 0.93,
    collide: true,
    bounce: 0.3,
    friction: 0.8,
    siblings: 1,
    swirl: 0.01,
  }),
  // Plume: smoke-column puff, buoyant while young, leans downwind with height
  K({
    dragX: 0.985,
    dragY: 0.985,
    lift: 0.0036,
    liftFade: 1,
    wind: 0.25,
    windAge: 1.1,
    collide: true,
    friction: 0.9,
    swirl: 0.005,
  }),
  // Cloud: a mushroom-cloud mote, carried by its emitter's motion and the swirl
  K({ dragX: 0.95, dragY: 0.95, swirl: 0.006, spread: 0.3 }),
];

const NK = KINDS.length;

/** Kind flag: a single-cell piece of a broken-up puff or clod. */
export const MOTE = 0x80;

function shadeRgb(rgb: number, k: number): number {
  const c = (sh: number): number => Math.min(255, Math.round(((rgb >> sh) & 255) * k));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/** Puff kinds that break into single-cell motes, with how far the puff grew over its life. */
const MOTE_KINDS: Readonly<Partial<Record<number, number>>> = {
  [PKind.Smoke]: 2.2,
  [PKind.Dust]: 1.4,
  [PKind.Plume]: 2.4,
  [PKind.Flame]: -0.3,
};

/** Most update passes run in one frame; a long stall (hidden tab) drops the rest. */
const MAX_PASSES = 240;

const UPDATE_VS = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
layout(location = 0) in vec4 a_dyn;  // x, y, vx, vy
layout(location = 1) in vec3 a_stat; // spawn tick, life, size
layout(location = 2) in uint a_ck;   // kind << 24 | rgb
uniform float u_tick;
uniform float u_gravity;
uniform float u_wind;
uniform vec4 u_kA[${NK}]; // gravity, dragX, dragY, lift
uniform vec4 u_kB[${NK}]; // liftFade, wind, windAge, maxFall
uniform vec4 u_kC[${NK}]; // sway, collide, bounce, friction
uniform vec4 u_kD[${NK}]; // swirl, spread
// value noise and its curl: a divergence-free swirl field drifting with time
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float psi(vec2 p, float t) {
  return noise(p * 0.07 + vec2(t * 0.004, -t * 0.006)) + 0.5 * noise(p * 0.16 - vec2(t * 0.009, 0.0));
}
vec2 curl(vec2 p, float t) {
  const float e = 0.75;
  float dx = psi(p + vec2(e, 0.0), t) - psi(p - vec2(e, 0.0), t);
  float dy = psi(p + vec2(0.0, e), t) - psi(p - vec2(0.0, e), t);
  return vec2(dy, -dx) / (2.0 * e) * 14.0;
}
uniform usampler2D u_terrain;
uniform ivec2 u_map;
out vec4 v_dyn;
bool solid(vec2 p) {
  ivec2 c = ivec2(floor(p));
  if (c.x < 0 || c.x >= u_map.x || c.y < 0) return false;
  if (c.y >= u_map.y) return true;
  return texelFetch(u_terrain, c, 0).r != 0u;
}
void main() {
  float age = u_tick - a_stat.x;
  if (age <= 0.0 || age >= a_stat.y) { v_dyn = a_dyn; return; }
  int k = int((a_ck >> 24u) & 127u);
  bool mote = (a_ck & 0x80000000u) != 0u;
  vec4 A = u_kA[k];
  vec4 B = u_kB[k];
  vec4 C = u_kC[k];
  vec4 D = u_kD[k];
  // motes are single cells of a broken-up puff: lighter, so the swirl carries them further
  if (mote) D.x *= 2.5;
  float t = age / a_stat.y;
  // each particle a little different, so a burst spreads instead of moving as one sheet
  float h = hash(vec2(float(gl_VertexID), a_stat.x)) - 0.5;
  A.w *= 1.0 + h * D.y * 2.0;
  A.yz = 1.0 - (1.0 - A.yz) * (1.0 + h * D.y);
  vec2 p = a_dyn.xy;
  vec2 v = a_dyn.zw;
  v.y += u_gravity * A.x;
  v *= A.yz;
  v.y -= A.w * (1.0 - B.x * t);
  v.x += u_wind * (B.y + B.z * t);
  if (B.w > 0.0) v.y = min(v.y, B.w);
  if (C.x > 0.0) v.x += sin(age * 0.11 + float(gl_VertexID) * 1.7) * C.x;
  // swirl grows as smoke ages and spreads into bigger eddies
  if (D.x > 0.0) v += curl(p, u_tick) * D.x * (0.4 + t);
  vec2 q = p + v;
  // terrain: only from open air, so bits spawned inside fresh rubble still fly out
  if (C.y > 0.5 && solid(q) && !solid(p)) {
    float bounce = C.z;
    float fr = C.w;
    if (!solid(vec2(q.x, p.y))) {
      // hit a floor or ceiling: slide along it, bounce off it
      q = vec2(p.x + v.x * fr, p.y);
      if (solid(q)) q = p;
      v.x *= fr;
      v.y = abs(v.y) * bounce > 0.12 ? -v.y * bounce : 0.0;
    } else if (!solid(vec2(p.x, q.y))) {
      // hit a wall
      q = vec2(p.x, q.y);
      v.x = -v.x * bounce;
      v.y *= fr;
    } else {
      q = p;
      v = -v * bounce;
    }
  }
  v_dyn = vec4(q, v);
}`;

const NULL_FS = `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(0.0); }`;

/** Draws the state buffer as quads; the per-kind looks port the CPU batch's draw one to one. */
const DRAW_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec4 a_dyn;
layout(location = 1) in vec3 a_stat;
layout(location = 2) in uint a_ck;
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_scale;
uniform float u_tick;
uniform int u_pass; // 0 normal blend, 1 additive
out vec2 v_local;
out vec4 v_color;
flat out int v_shape;
flat out vec3 v_blob;
vec3 unpack(uint c) {
  return vec3(float((c >> 16u) & 255u), float((c >> 8u) & 255u), float(c & 255u)) / 255.0;
}
vec3 shade(vec3 c, float k) { return min(vec3(1.0), floor(c * 255.0 * k + 0.5) / 255.0); }
// colour fades: life stepped into n hard tones, each particle crossing a step at a slightly
// different moment, so a fade shows as pixels flipping colour rather than a smooth blend
float stepT(float t, float th, float n) {
  return clamp(floor((t + (th - 0.5) * 0.18) * n) / (n - 1.0), 0.0, 1.0);
}
vec3 ramp3(vec3 a, vec3 b, vec3 c, float x) {
  return floor((x < 0.5 ? mix(a, b, x * 2.0) : mix(b, c, x * 2.0 - 1.0)) * 31.0 + 0.5) / 31.0;
}
const vec3 EMBER = vec3(1.0, 0.52, 0.16);
const vec3 SOOT = vec3(0.21, 0.18, 0.19);
void main() {
  float age = u_tick - a_stat.x;
  float life = a_stat.y;
  float s = a_stat.z;
  int k = int((a_ck >> 24u) & 127u);
  bool mote = (a_ck & 0x80000000u) != 0u;
  uint rgb = a_ck & 0xffffffu;
  vec3 col = unpack(rgb);
  float t = age / life;
  // a mote's own threshold: as a cloud thins, motes wink out one by one (hard pixels, no alpha)
  float th = fract(sin(float(gl_InstanceID) * 12.9898 + a_stat.x * 78.233) * 43758.5453);
  vec2 cell = floor(a_dyn.xy) + 0.5;
  vec2 pos = cell;
  vec2 size = vec2(1.0);
  float alpha = 1.0;
  int shape = 0;
  bool show = age >= 0.0 && age < life;
  if (mote) {
    float cover = 1.0;
    if (k == ${PKind.Plume}) {
      int band = min(4, int(t * 5.0));
      if (band >= 2) col = shade(col, band == 2 ? 1.2 : band == 3 ? 1.4 : 1.55);
      cover = band < 3 ? 1.0 : band == 3 ? 0.55 : 0.3;
      show = show && u_pass == 0;
    } else if (k == ${PKind.Flame}) {
      int band = min(3, int(t * 4.0 + th * 0.6));
      float x = stepT(t, th, 7.0);
      // white-hot, yellow, orange, red, ember, soot
      col = x < 0.5 ? ramp3(vec3(1.0, 0.97, 0.78), vec3(1.0, 0.8, 0.25), vec3(1.0, 0.45, 0.1), x * 2.0)
                    : ramp3(vec3(1.0, 0.45, 0.1), vec3(0.72, 0.16, 0.06), SOOT, x * 2.0 - 1.0);
      cover = band == 3 ? 0.7 : 1.0;
      if (u_pass == 1) {
        show = show && band < 2;
        col = vec3(1.0, 0.816, 0.376);
        alpha = 0.35;
      }
    } else if (k == ${PKind.Chunk}) {
      show = show && u_pass == 0;
      cover = t < 0.7 ? 1.0 : (1.0 - t) / 0.3;
      // grains leave the blast glowing and cool to their own colour
      col = mix(mix(EMBER, col, 0.45), col, stepT(min(1.0, t * 6.0), th, 4.0));
    } else if (k == ${PKind.Cloud}) {
      show = show && u_pass == 0;
      cover = t < 0.6 ? 1.0 : (1.0 - t) / 0.4;
      // each mote cools on its way out of the fireball
      col = mix(col, SOOT, stepT(t, th, 5.0) * 0.65);
    } else {
      show = show && u_pass == 0;
      bool smoke = k == ${PKind.Smoke};
      cover = (smoke ? 1.1 : 0.9) * (1.0 - t) * min(1.0, t * 6.0 + 0.2);
      // smoke: ember-lit at the blast, its own grey, then pale as it thins; dust just pales
      float x = stepT(t, th, 6.0);
      col = smoke ? ramp3(mix(col, EMBER, 0.6), col, shade(col, 1.4), min(1.0, x * 1.4))
                  : mix(col, shade(col, 1.3), x);
    }
    show = show && th < cover;
  } else if (k == ${PKind.Spark}) {
    show = show && u_pass == 1;
    alpha = t < 0.6 ? 1.0 : (1.0 - t) / 0.4;
    // white-hot, its own colour, then a dull red as it dies
    col = ramp3(vec3(1.0, 1.0, 0.86), col, vec3(0.62, 0.13, 0.05), stepT(t, th, 6.0));
  } else if (k == ${PKind.Glitter}) {
    show = show && u_pass == 1;
    if (t > 0.55 && ((int(age) + int(rgb & 7u)) & 2) == 0) show = false;
    size = vec2(s);
    alpha = t < 0.55 ? 1.0 : 0.85;
    // a white flash, its colour, then deeper as it burns out
    col = ramp3(vec3(1.0), col, col * 0.5, stepT(t, th, 5.0));
  } else if (k == ${PKind.Snow}) {
    show = show && u_pass == 0;
    size = vec2(s);
    alpha = t < 0.8 ? 0.95 : (1.0 - t) / 0.2;
  } else if (k == ${PKind.Streak}) {
    show = show && u_pass == 0;
    float len = max(2.0, floor(s + 0.5));
    pos = vec2(floor(a_dyn.x) + len * 0.5, cell.y);
    size = vec2(len, 1.0);
    alpha = t < 0.2 ? 0.3 : t < 0.75 ? 0.62 : 0.3;
  } else if (k == ${PKind.Chunk}) {
    show = show && u_pass == 0;
    size = vec2(s);
    alpha = t < 0.7 ? 1.0 : (1.0 - t) / 0.3;
    col = mix(mix(EMBER, col, 0.45), col, stepT(min(1.0, t * 6.0), th, 4.0));
  } else if (k == ${PKind.Plume}) {
    show = show && u_pass == 0;
    int band = min(4, int(t * 5.0));
    size = vec2(floor(s * (1.0 + t * 2.4) + 0.5));
    if (band >= 2) col = shade(col, band == 2 ? 1.2 : band == 3 ? 1.4 : 1.55);
    bool solidBlob = band < 3 && age >= 6.0;
    shape = solidBlob ? 5 : 4;
    alpha = solidBlob ? 1.0 : (band == 3 ? 0.55 : band == 4 ? 0.3 : 0.6);
  } else if (k == ${PKind.Flame}) {
    int band = min(3, int(t * 4.0));
    float sz = max(1.0, floor(s * (1.0 - t * 0.6) + 0.5));
    if (u_pass == 0) {
      col = band == 0 ? vec3(1.0, 0.941, 0.627)
          : band == 1 ? vec3(1.0, 0.627, 0.125)
          : band == 2 ? vec3(0.878, 0.29, 0.063)
          : vec3(0.227, 0.165, 0.149);
      size = vec2(sz);
      alpha = band == 3 ? 0.7 : 1.0;
      shape = 4;
    } else {
      show = show && band < 2;
      col = vec3(1.0, 0.816, 0.376);
      size = vec2(max(1.0, sz - 2.0));
      alpha = 0.5;
    }
  } else {
    // smoke and dust: soft dithered puffs that grow as they thin
    show = show && u_pass == 0;
    bool smoke = k == ${PKind.Smoke};
    float grow = smoke ? 1.0 + t * 2.2 : 1.0 + t * 1.4;
    pos = a_dyn.xy;
    size = vec2(s * grow);
    alpha = (smoke ? 0.5 : 0.42) * (1.0 - t) * min(1.0, t * 6.0 + 0.2);
    shape = 4;
  }
  if (!show || alpha <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_local = vec2(0.0);
    v_color = vec4(0.0);
    v_shape = 0;
    v_blob = vec3(0.0);
    return;
  }
  int id = gl_VertexID % 6;
  vec2 corner = vec2(id == 1 || id == 2 || id == 4 ? 1.0 : 0.0, id == 2 || id == 4 || id == 5 ? 1.0 : 0.0);
  vec2 l = corner - 0.5;
  v_local = l * 2.0;
  v_color = vec4(col, alpha);
  v_shape = shape;
  v_blob = vec3(pos, size.x * 0.5);
  vec2 px = u_origin + (pos + l * size) * u_scale;
  gl_Position = vec4(px.x / u_view.x * 2.0 - 1.0, 1.0 - px.y / u_view.y * 2.0, 0.0, 1.0);
}`;

function linkFeedback(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const sh = gl.createShader(type);
    if (!sh) throw new Error('createShader failed');
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(`shader compile failed: ${gl.getShaderInfoLog(sh) ?? ''}`);
    }
    gl.attachShader(prog, sh);
    gl.deleteShader(sh);
  }
  gl.transformFeedbackVaryings(prog, ['v_dyn'], gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(prog) ?? ''}`);
  }
  return prog;
}

/** Bytes per particle in the static buffer: spawn, life, size (f32) + kind/colour (u32). */
const STAT_BYTES = 16;
const DYN_BYTES = 16;

export class GpuParticles implements ParticleSink {
  readonly cap: number;
  /** Ticks stepped so far (the update shader's clock). */
  private tick = 0;
  /** Update passes owed to {@link draw}. */
  private passes = 0;
  /** Next ring slot to fill, and the highest slot in use + 1. */
  private head = 0;
  private used = 0;
  /** The tick by which every particle so far has died. */
  private lastDeath = 0;
  /** Slots written since the last upload: a ring range [pendStart, pendStart + pendCount). */
  private pendStart = 0;
  private pendCount = 0;

  private readonly dyn: Float32Array;
  private readonly statF: Float32Array;
  private readonly statU: Uint32Array;

  private readonly gl: WebGL2RenderingContext;
  private readonly dynBuf: [WebGLBuffer, WebGLBuffer];
  private readonly statBuf: WebGLBuffer;
  /** Update VAOs read dynBuf[i]; draw VAOs read dynBuf[i]. */
  private readonly updVao: [WebGLVertexArrayObject, WebGLVertexArrayObject];
  private readonly drawVao: [WebGLVertexArrayObject, WebGLVertexArrayObject];
  private readonly tf: WebGLTransformFeedback;
  private readonly updProg: WebGLProgram;
  private readonly drawProg: WebGLProgram;
  private readonly uUpd: Record<string, WebGLUniformLocation | null> = {};
  private readonly uDraw: Record<string, WebGLUniformLocation | null> = {};
  /** Which dynamic buffer holds the current state. */
  private cur: 0 | 1 = 0;

  /**
   * @param density 0..1 share of each kind's {@link KindPhysics.siblings} to spawn (by quality).
   */
  constructor(
    gl: WebGL2RenderingContext,
    cap: number,
    private readonly density = 1,
  ) {
    this.gl = gl;
    this.cap = cap;
    this.dyn = new Float32Array(cap * 4);
    const stat = new ArrayBuffer(cap * STAT_BYTES);
    this.statF = new Float32Array(stat);
    this.statU = new Uint32Array(stat);

    this.updProg = linkFeedback(gl, UPDATE_VS, NULL_FS);
    this.drawProg = compile(gl, DRAW_VS, QUAD_FS);
    for (const n of [
      'u_tick',
      'u_gravity',
      'u_wind',
      'u_kA',
      'u_kB',
      'u_kC',
      'u_kD',
      'u_terrain',
      'u_map',
    ]) {
      this.uUpd[n] = gl.getUniformLocation(this.updProg, n);
    }
    for (const n of ['u_view', 'u_origin', 'u_scale', 'u_tick', 'u_pass']) {
      this.uDraw[n] = gl.getUniformLocation(this.drawProg, n);
    }
    // the kind table never changes: upload once
    const a = new Float32Array(NK * 4);
    const b = new Float32Array(NK * 4);
    const c = new Float32Array(NK * 4);
    const d = new Float32Array(NK * 4);
    KINDS.forEach((k, i) => {
      a.set([k.gravity, k.dragX, k.dragY, k.lift], i * 4);
      b.set([k.liftFade, k.wind, k.windAge, k.maxFall], i * 4);
      c.set([k.sway, k.collide ? 1 : 0, k.bounce, k.friction], i * 4);
      d.set([k.swirl, k.spread, 0, 0], i * 4);
    });
    gl.useProgram(this.updProg);
    gl.uniform4fv(this.uUpd.u_kA!, a);
    gl.uniform4fv(this.uUpd.u_kB!, b);
    gl.uniform4fv(this.uUpd.u_kC!, c);
    gl.uniform4fv(this.uUpd.u_kD!, d);

    const mk = (bytes: number, usage: number): WebGLBuffer => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, bytes, usage);
      return buf;
    };
    this.dynBuf = [mk(cap * DYN_BYTES, gl.DYNAMIC_COPY), mk(cap * DYN_BYTES, gl.DYNAMIC_COPY)];
    this.statBuf = mk(cap * STAT_BYTES, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    const vao = (dyn: WebGLBuffer, divisor: number): WebGLVertexArrayObject => {
      const v = gl.createVertexArray();
      gl.bindVertexArray(v);
      gl.bindBuffer(gl.ARRAY_BUFFER, dyn);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, DYN_BYTES, 0);
      gl.vertexAttribDivisor(0, divisor);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.statBuf);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STAT_BYTES, 0);
      gl.vertexAttribDivisor(1, divisor);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_INT, STAT_BYTES, 12);
      gl.vertexAttribDivisor(2, divisor);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      return v;
    };
    this.updVao = [vao(this.dynBuf[0], 0), vao(this.dynBuf[1], 0)];
    this.drawVao = [vao(this.dynBuf[0], 1), vao(this.dynBuf[1], 1)];
    this.tf = gl.createTransformFeedback();
  }

  /** Slots that may hold a live particle (the range each pass touches). */
  get n(): number {
    return this.used;
  }

  /** Add a particle in the next ring slot; when full, the oldest is overwritten. */
  add(e: Emit): void {
    if (MOTE_KINDS[e.kind] && e.size >= 2) {
      this.motes(e);
      return;
    }
    if (e.kind === PKind.Chunk && e.size >= 2) {
      this.grains(e);
      return;
    }
    this.put(e.x, e.y, e.vx, e.vy, e.life, e.size, e.kind, e.color);
    // the GPU budget buys denser blasts: each spark or clod brings a few smaller siblings
    const extra = Math.round((KINDS[e.kind]?.siblings ?? 0) * this.density);
    for (let j = 0; j < extra; j++) {
      const a = this.rand() * 0.5 + 0.75;
      const b = this.rand() * 0.5 + 0.75;
      this.put(
        e.x + this.rand() - 0.5,
        e.y + this.rand() - 0.5,
        e.vx * a + (this.rand() - 0.5) * 0.3,
        e.vy * b + (this.rand() - 0.5) * 0.3,
        e.life * (0.55 + this.rand() * 0.45),
        Math.max(1, e.size - 1),
        e.kind,
        e.color,
      );
    }
  }

  /**
   * Break a puff into single-cell motes filling its disc. Each drifts outward at the rate the
   * puff used to grow, so the cloud swells, and the swirl field tears it into wisps.
   */
  private motes(e: Emit): void {
    const grow = MOTE_KINDS[e.kind]!;
    const r = e.size / 2;
    const n = Math.max(
      4,
      Math.min(96, Math.round(e.size * e.size * 0.9 * Math.max(0.3, this.density))),
    );
    // radius growth per tick over the puff's life (negative for flames, which shrink)
    const out = (r * grow) / Math.max(1, e.life);
    for (let j = 0; j < n; j++) {
      // uniform in the disc
      const a = this.rand() * 6.283185;
      const d = Math.sqrt(this.rand());
      const ux = Math.cos(a) * d;
      const uy = Math.sin(a) * d;
      this.put(
        e.x + ux * r,
        e.y + uy * r,
        e.vx + ux * out + (this.rand() - 0.5) * 0.04,
        e.vy + uy * out + (this.rand() - 0.5) * 0.04,
        e.life * (0.7 + this.rand() * 0.3),
        1,
        e.kind | MOTE,
        e.color,
      );
    }
  }

  /**
   * Break a clod (mud, dirt, grass) into its cells: they leave together, drift apart a little in
   * flight, and each lands, bounces and settles on its own. Each grain's tone varies a step.
   */
  private grains(e: Emit): void {
    const s = Math.min(6, Math.round(e.size));
    const h = s / 2;
    for (let gy = 0; gy < s; gy++) {
      for (let gx = 0; gx < s; gx++) {
        const v = this.rand();
        const tone = v < 0.25 ? 0.82 : v > 0.8 ? 1.16 : 1;
        this.put(
          e.x - h + gx + 0.5,
          e.y - h + gy + 0.5,
          e.vx + (this.rand() - 0.5) * 0.14,
          e.vy + (this.rand() - 0.5) * 0.14,
          e.life * (0.75 + this.rand() * 0.25),
          1,
          PKind.Chunk | MOTE,
          shadeRgb(e.color, tone),
        );
      }
    }
  }

  /** Cosmetic jitter for siblings; a fixed sequence, so captures replay exactly. */
  private seed = 0x9e3779b9;
  private rand(): number {
    let t = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private put(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    kind: number,
    color: number,
  ): void {
    const i = this.head;
    this.head = i + 1 === this.cap ? 0 : i + 1;
    if (i + 1 > this.used) this.used = i + 1;
    const o = i * 4;
    this.dyn[o] = x;
    this.dyn[o + 1] = y;
    this.dyn[o + 2] = vx;
    this.dyn[o + 3] = vy;
    this.statF[o] = this.tick;
    this.statF[o + 1] = life;
    this.statF[o + 2] = size;
    this.statU[o + 3] = ((kind & 255) << 24) | (color & 0xffffff);
    if (this.tick + life > this.lastDeath) this.lastDeath = this.tick + life;
    if (this.pendCount === 0) this.pendStart = i;
    if (this.pendCount < this.cap) this.pendCount++;
  }

  /** One sim tick. The GPU pass itself runs at the next draw. */
  step(gravity: number, wind: number): void {
    this.gravity = gravity;
    this.wind = wind;
    this.tick++;
    if (this.tick >= this.lastDeath) {
      // everything has burnt out: rewind the ring so passes stay short
      this.clear();
      return;
    }
    this.passes++;
  }

  private gravity = 0;
  private wind = 0;

  private upload(): void {
    if (this.pendCount === 0) return;
    const gl = this.gl;
    const seg = (start: number, count: number): void => {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf[this.cur]);
      gl.bufferSubData(gl.ARRAY_BUFFER, start * DYN_BYTES, this.dyn, start * 4, count * 4);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.statBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, start * STAT_BYTES, this.statF, start * 4, count * 4);
    };
    if (this.pendCount >= this.cap) {
      seg(0, this.cap);
    } else {
      const first = Math.min(this.pendCount, this.cap - this.pendStart);
      seg(this.pendStart, first);
      if (first < this.pendCount) seg(0, this.pendCount - first);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.pendCount = 0;
  }

  /** Run owed update passes against the terrain texture. */
  private update(terrain: WebGLTexture, mapW: number, mapH: number): void {
    const passes = Math.min(this.passes, MAX_PASSES);
    // a long stall: age the clock without moving (they died off-screen anyway)
    this.passes = 0;
    if (passes === 0 || this.used === 0) return;
    const gl = this.gl;
    gl.useProgram(this.updProg);
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, terrain);
    gl.uniform1i(this.uUpd.u_terrain!, 9);
    gl.uniform2i(this.uUpd.u_map!, mapW, mapH);
    gl.uniform1f(this.uUpd.u_gravity!, this.gravity);
    gl.uniform1f(this.uUpd.u_wind!, this.wind);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tf);
    const first = this.tick - passes + 1;
    for (let p = 0; p < passes; p++) {
      const src = this.cur;
      const dst = src === 0 ? 1 : 0;
      gl.uniform1f(this.uUpd.u_tick!, first + p);
      gl.bindVertexArray(this.updVao[src]);
      gl.bindBufferRange(
        gl.TRANSFORM_FEEDBACK_BUFFER,
        0,
        this.dynBuf[dst],
        0,
        this.used * DYN_BYTES,
      );
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, this.used);
      gl.endTransformFeedback();
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
      this.cur = dst;
    }
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }

  /**
   * Bring the state up to date and draw it: the normal-blend pass then the additive one. Blend
   * state is set here and left disabled.
   */
  draw(
    terrain: WebGLTexture,
    mapW: number,
    mapH: number,
    view: [number, number],
    origin: [number, number],
    scale: number,
  ): void {
    this.upload();
    this.update(terrain, mapW, mapH);
    if (this.used === 0) return;
    const gl = this.gl;
    gl.useProgram(this.drawProg);
    gl.uniform2f(this.uDraw.u_view!, view[0], view[1]);
    gl.uniform2f(this.uDraw.u_origin!, origin[0], origin[1]);
    gl.uniform1f(this.uDraw.u_scale!, scale);
    gl.uniform1f(this.uDraw.u_tick!, this.tick);
    gl.bindVertexArray(this.drawVao[this.cur]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(this.uDraw.u_pass!, 0);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.used);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform1i(this.uDraw.u_pass!, 1);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.used);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  clear(): void {
    this.head = 0;
    this.used = 0;
    this.passes = 0;
    this.pendCount = 0;
    this.lastDeath = this.tick;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.dynBuf[0]);
    gl.deleteBuffer(this.dynBuf[1]);
    gl.deleteBuffer(this.statBuf);
    for (const v of [...this.updVao, ...this.drawVao]) gl.deleteVertexArray(v);
    gl.deleteTransformFeedback(this.tf);
    gl.deleteProgram(this.updProg);
    gl.deleteProgram(this.drawProg);
  }
}
