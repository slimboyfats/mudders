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
import { compile, texture } from './gl';

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

  constructor(gl: WebGL2RenderingContext, mapW: number, mapH: number, div: number, iters: number) {
    this.gl = gl;
    this.mapW = mapW;
    this.mapH = mapH;
    this.div = div;
    this.iters = iters;
    this.w = Math.max(1, Math.ceil(mapW / div));
    this.h = Math.max(1, Math.ceil(mapH / div));
    this.ok = gl.getExtension('EXT_color_buffer_float') !== null;
    if (!this.ok) return;
    const field = (): Field => {
      const tex = texture(gl, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.w, this.h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fbo };
    };
    this.vel = [field(), field()];
    this.dye = [field(), field()];
    this.pressure = [field(), field()];
    this.div1 = field();
    this.curl = field();
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
    const mk = (name: string, fs: string, names: string[]): void => {
      const p = compile(gl, FULL_VS, fs);
      this.progs[name] = p;
      const u: Record<string, WebGLUniformLocation | null> = {};
      for (const n of ['u_size', 'u_terrain', 'u_map', 'u_div', ...names])
        u[n] = gl.getUniformLocation(p, n);
      this.uni[name] = u;
    };
    mk('splat', SPLAT_FS, ['u_vel', 'u_dye', 'u_n', 'u_sA', 'u_sB', 'u_sC']);
    mk('advect', ADVECT_FS, ['u_vel', 'u_src', 'u_keep', 'u_burn']);
    mk('curl', CURL_FS, ['u_vel']);
    mk('force', FORCE_FS, ['u_vel', 'u_curl', 'u_dye', 'u_eps', 'u_wind', 'u_jit']);
    mk('div', DIV_FS, ['u_vel', 'u_dye']);
    mk('pressure', PRESSURE_FS, ['u_pressure', 'u_divergence']);
    mk('gradient', GRADIENT_FS, ['u_pressure', 'u_vel']);
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
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    for (const f of [...this.vel!, ...this.dye!, ...this.pressure!, this.div1, this.curl]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Run every queued tick. Leaves the framebuffer unbound and the viewport at the fluid's
   * size: the caller sets its own after.
   */
  update(terrain: WebGLTexture): void {
    if (!this.ok) return;
    const steps = this.pending;
    this.pending = [];
    if (!this.live) {
      this.tick += steps.length;
      return;
    }
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, this.w, this.h);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, terrain);
    for (const s of steps) {
      this.runStep(s);
      this.tick++;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }

  private use(name: string): Record<string, WebGLUniformLocation | null> {
    const gl = this.gl;
    const u = this.uni[name]!;
    gl.useProgram(this.progs[name]!);
    gl.uniform2f(u.u_size!, this.w, this.h);
    gl.uniform1i(u.u_terrain!, 9);
    gl.uniform2i(u.u_map!, this.mapW, this.mapH);
    gl.uniform1i(u.u_div!, this.div);
    return u;
  }

  private bind(unit: number, tex: WebGLTexture, loc: WebGLUniformLocation | null): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  private target(fbo: WebGLFramebuffer): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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
      const u = this.use('splat');
      const n = s.splats.length;
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
      this.bind(0, vel[cur]!.tex, u.u_vel!);
      this.bind(1, dye[cur]!.tex, u.u_dye!);
      this.target(this.pair![nxt]!);
      cur = nxt;
      nxt = cur ^ 1;
    }
    // 2. curl, then vorticity confinement with the body forces
    {
      const u = this.use('curl');
      this.bind(0, vel[cur]!.tex, u.u_vel!);
      this.target(this.curl.fbo);
    }
    {
      const u = this.use('force');
      gl.uniform1f(u.u_eps!, 0.5);
      gl.uniform1f(u.u_wind!, (s.wind * 1.5) / this.div);
      gl.uniform2f(u.u_jit!, (this.tick % 977) * 0.37, (this.tick % 613) * 0.53);
      this.bind(0, vel[cur]!.tex, u.u_vel!);
      this.bind(1, this.curl.tex, u.u_curl!);
      this.bind(2, dye[cur]!.tex, u.u_dye!);
      this.target(vel[nxt]!.fbo);
    }
    // 3. make the velocity divergence-free: divergence, pressure, gradient subtract
    {
      const u = this.use('div');
      this.bind(0, vel[nxt]!.tex, u.u_vel!);
      this.bind(2, dye[cur]!.tex, u.u_dye!);
      this.target(this.div1.fbo);
    }
    {
      const u = this.use('pressure');
      this.bind(1, this.div1.tex, u.u_divergence!);
      let p = 0;
      for (let i = 0; i < this.iters; i++) {
        this.bind(0, pr[p]!.tex, u.u_pressure!);
        this.target(pr[p ^ 1]!.fbo);
        p ^= 1;
      }
      const g = this.use('gradient');
      this.bind(0, pr[p]!.tex, g.u_pressure!);
      this.bind(1, vel[nxt]!.tex, g.u_vel!);
      // writes the velocity back into the other side
      this.target(vel[cur]!.fbo);
    }
    // 4. carry the velocity and the dye along the flow
    {
      const u = this.use('advect');
      this.bind(0, vel[cur]!.tex, u.u_vel!);
      this.bind(1, vel[cur]!.tex, u.u_src!);
      gl.uniform4f(u.u_keep!, 0.992, 0.992, 1, 1);
      gl.uniform1f(u.u_burn!, 0);
      this.target(vel[nxt]!.fbo);
      this.bind(1, dye[cur]!.tex, u.u_src!);
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
    for (const f of [this.div1, this.curl]) {
      if (f) {
        gl.deleteTexture(f.tex);
        gl.deleteFramebuffer(f.fbo);
      }
    }
    for (const f of this.pair ?? []) gl.deleteFramebuffer(f);
    for (const p of Object.values(this.progs)) gl.deleteProgram(p);
    this.vel = this.dye = this.pressure = this.pair = undefined;
    this.progs = {};
  }
}
