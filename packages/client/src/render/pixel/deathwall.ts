import type { QuadBatch } from './batch';
import { compile, uniforms } from './gl';
import { QUAD_FS } from './shaders';
import { WALL_BAND, WALL_FADE } from './wall';

/**
 * The loose bits on the sudden-death wall (§3.1): green motes rising through it, wisps torn off
 * its face and green lightning deep inside. The wall's body (and how it swallows shells) is
 * `wall.ts`; these are stateless, a pure function of their index and the render time.
 *
 * The motes are drawn by `WallMotes`, on the GPU: zoomed far out there are tens of thousands of
 * them on screen, and working each one out every frame was most of the renderer's CPU time.
 *
 * Coordinates: `u` is the distance in cells from a side's map edge toward the middle; the wall's
 * face stands at u = zone (the map edge itself before sudden death) and the wall fills everything
 * from there outward, past the map edge to the edge of the screen.
 */

const WISP = [0x2a352b, 0x34402f, 0x3d4a36] as const;
const BOLT = 0x7cf2a0;
const BOLT_HALO = 0x2f8a52;

/** Integer hash → [0, 1). */
function h01(i: number, salt: number): number {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 11, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

const WISPS_PER_100 = 70;
/** Lattice the motes sit on (cells). */
const DEEP_TILE = 9;
/** Rows per green mote column cell. */
const MOTE_TILE = 26;
/** Lattice columns of motes behind the face, per side. */
const MOTE_COLS = Math.ceil((WALL_BAND + WALL_FADE) / 9);
/** Lattice rows kept ready above and below the screen, so a pan rarely rebuilds the buffer. */
const MOTE_PAD = 12;
/** Floats per mote: x, y where it starts, life, phase, depth `u`. */
const MOTE_STRIDE = 5;

const hex = (c: number): string =>
  `vec3(${[(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => (v / 255).toFixed(4)).join(', ')})`;

const MOTE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a_mote; // x, y at the start of its rise, life (ticks), phase
layout(location = 1) in float a_u;   // depth from the side's map edge toward the middle
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_scale;
uniform float u_time;
uniform float u_zone;
out vec4 v_color;
void main() {
  int id = gl_VertexID % 6;
  vec2 corner = vec2(id == 1 || id == 2 || id == 4 ? 1.0 : 0.0, id == 2 || id == 4 || id == 5 ? 1.0 : 0.0);
  float p = fract(u_time / a_mote.z + a_mote.w);
  float blink = sin(p * 3.14159265);
  if (blink < 0.25 || a_u > u_zone - 3.0 || u_zone - a_u > ${(WALL_BAND + WALL_FADE * 0.5).toFixed(1)}) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  v_color = vec4(p > 0.5 ? ${hex(BOLT_HALO)} : ${hex(BOLT)}, 0.7 * blink);
  vec2 cell = vec2(a_mote.x, floor(a_mote.y - p * 18.0 + 0.5));
  vec2 px = u_origin + (cell + corner - 0.5) * u_scale;
  gl_Position = vec4(px.x / u_view.x * 2.0 - 1.0, 1.0 - px.y / u_view.y * 2.0, 0.0, 1.0);
}`;

/** Wisps kept ready per side (enough for a view 5800 cells high). */
const WISP_MAX = 4096;
/** Floats per wisp: life, phase, height (0…1 of the view), reach, index, size, colour. */
const WISP_STRIDE = 7;

/** Places a wisp and hands it to the quad shader's stipple shape (`QUAD_FS`, shape 6). */
const WISP_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a_wisp; // life (ticks), phase, height (0..1 of the span), reach
layout(location = 1) in vec3 a_look; // index, size (cells), colour (0..2)
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_scale;
uniform float u_time;
uniform float u_zone;
uniform vec2 u_span;  // top row and rows the wisps are spread over
uniform vec2 u_side;  // map x of this side's edge, and which way is inward (+1 / -1)
uniform float u_fresh;
out vec2 v_local;
out vec4 v_color;
flat out int v_shape;
flat out vec3 v_blob;
flat out vec4 v_seg;
void main() {
  v_seg = vec4(0.0);
  int id = gl_VertexID % 6;
  vec2 corner = vec2(id == 1 || id == 2 || id == 4 ? 1.0 : 0.0, id == 2 || id == 4 || id == 5 ? 1.0 : 0.0);
  vec2 l = corner - 0.5;
  float p = fract(u_time / a_wisp.x + a_wisp.y);
  float u = u_zone + 1.0 + p * a_wisp.w;
  float y = a_wisp.z * u_span.y + sin(p * 5.0 + a_look.x) * 2.0 - p * 4.0;
  vec2 pos = vec2(floor(u_side.x + u_side.y * u + 0.5), floor(mod(y, u_span.y) + u_span.x + 0.5));
  vec3 col = a_look.z < 0.5 ? ${hex(WISP[0])} : a_look.z < 1.5 ? ${hex(WISP[1])} : ${hex(WISP[2])};
  if (u_fresh > 0.0 && mod(a_look.x, 3.0) < 0.5) col = ${hex(BOLT_HALO)};
  v_local = l * 2.0;
  v_color = vec4(col, (1.0 - p) * 0.45);
  v_shape = 6;
  v_blob = vec3(pos, a_look.y * 0.5);
  vec2 px = u_origin + (pos + l * a_look.y) * u_scale;
  gl_Position = vec4(px.x / u_view.x * 2.0 - 1.0, 1.0 - px.y / u_view.y * 2.0, 0.0, 1.0);
}`;

const MOTE_FS = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 o;
void main() {
  o = vec4(v_color.rgb * v_color.a, v_color.a); // premultiplied
}`;

export interface WallView {
  /** Map size in cells. */
  width: number;
  height: number;
  /** Visible map rect (cells), may reach past the map. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Draw the lightning inside a wall whose face stands `zone` cells in from each side (fractional
 * while it creeps), at render time `t` (ticks).
 */
export function drawDeathWall(normal: QuadBatch, zone: number, t: number, v: WallView): void {
  for (let side = 0; side < 2; side++) {
    const left = side === 0;
    // the screen's outermost cell on this side, as u
    const uOut = Math.floor(left ? v.x0 : v.width - v.x1) - 2;
    if (uOut >= zone + 8) continue; // the wall is off screen
    const toX = (u: number) => (left ? u : v.width - u);
    const top = Math.floor(v.y0) - 6;
    const span = Math.ceil(v.y1 - v.y0) + 12;

    // the body itself is painted by the wall shader (wall.ts), the motes by `WallMotes`

    // (the wisps torn off the face are `WallWisps`)

    // green lightning deep in the wall: now and then a jagged bolt crackles down for a few frames
    const slot = Math.floor(t / 6);
    if (h01(slot, 30 + side) > 0.82) {
      // (inside the band that is drawn as liquid: past it the wall is black)
      const depth = 14 + h01(slot, 31 + side) * Math.max(10, Math.min(WALL_BAND, zone - uOut) - 14);
      const ub = zone - depth;
      if (ub > uOut) {
        let x = toX(ub);
        let y = top + h01(slot, 32 + side) * span * 0.7;
        const segs = 6 + Math.floor(h01(slot, 33 + side) * 8);
        for (let s = 0; s < segs; s++) {
          const nx = x + (h01(slot * 31 + s, 34 + side) - 0.5) * 8;
          const ny = y + 3 + h01(slot * 31 + s, 35 + side) * 6;
          normal.line(
            Math.round(x),
            Math.round(y),
            Math.round(nx),
            Math.round(ny),
            3,
            BOLT_HALO,
            0.35,
          );
          normal.line(Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), 1, BOLT, 0.95);
          x = nx;
          y = ny;
        }
      }
    }
  }
}

/**
 * The motes: green specks rising slowly through the dark of the wall and winking out. Each is a
 * pure function of its place on a lattice and the render time, so the lattice goes to the GPU
 * once (again only when the camera leaves the rows that are ready, or the face moves a column)
 * and the vertex shader works out where each speck is now.
 */
export class WallMotes {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buf: WebGLBuffer;
  private readonly u;
  private data = new Float32Array(0);
  private n = 0;
  /** What the buffer was built for: lattice rows, the face's column, the map's width. */
  private j0 = 0;
  private j1 = -1;
  private i1 = 0;
  private width = -1;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, MOTE_VS, MOTE_FS);
    this.u = uniforms(gl, this.prog, ['u_view', 'u_origin', 'u_scale', 'u_time', 'u_zone']);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, MOTE_STRIDE * 4, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, MOTE_STRIDE * 4, 16);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
  }

  /** Lay the lattice out for rows `j0..j1` with the face's column at `i1`, both sides. */
  private build(j0: number, j1: number, i1: number, width: number): void {
    const rows = j1 - j0 + 1;
    const need = 2 * MOTE_COLS * rows * MOTE_STRIDE;
    if (this.data.length < need) this.data = new Float32Array(need);
    const d = this.data;
    let o = 0;
    for (let side = 0; side < 2; side++) {
      for (let i = i1 - MOTE_COLS + 1; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const n = (i + 4096) * 8192 + (j + 4096);
          const u = i * DEEP_TILE + h01(n, 63) * DEEP_TILE;
          d[o] = Math.round(side === 0 ? u : width - u);
          d[o + 1] = j * MOTE_TILE + h01(n, 64) * MOTE_TILE;
          d[o + 2] = 180 + h01(n, 61) * 240;
          d[o + 3] = h01(n, 62 + side);
          d[o + 4] = u;
          o += MOTE_STRIDE;
        }
      }
    }
    this.n = o / MOTE_STRIDE;
    this.j0 = j0;
    this.j1 = j1;
    this.i1 = i1;
    this.width = width;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, o), gl.STATIC_DRAW);
  }

  /**
   * Draw the motes of a wall whose face stands `zone` cells in, at render time `t` (ticks).
   * Expects premultiplied alpha blending, like the quad batches.
   */
  draw(
    view: [number, number],
    origin: [number, number],
    scale: number,
    zone: number,
    t: number,
    v: WallView,
  ): void {
    // nothing to see while both walls are off screen
    if (Math.floor(v.x0) - 2 >= zone + 8 && Math.floor(v.width - v.x1) - 2 >= zone + 8) return;
    const i1 = Math.floor((zone - 4) / DEEP_TILE);
    const a = Math.floor(v.y0 / MOTE_TILE) - 1;
    const b = Math.ceil(v.y1 / MOTE_TILE);
    if (a < this.j0 || b > this.j1 || i1 !== this.i1 || v.width !== this.width) {
      this.build(a - MOTE_PAD, b + MOTE_PAD, i1, v.width);
    }
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.u_view, view[0], view[1]);
    gl.uniform2f(this.u.u_origin, origin[0], origin[1]);
    gl.uniform1f(this.u.u_scale, scale);
    gl.uniform1f(this.u.u_time, t);
    gl.uniform1f(this.u.u_zone, zone);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.n);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buf);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.prog);
  }
}

/**
 * The wisps: small tendrils torn off the wall's face, drifting out over the battlefield and
 * fading. Like the motes each is a pure function of its index and the render time, so what never
 * changes about a wisp sits in a static buffer and the vertex shader does the rest. They are
 * spread over the rows on screen, so the more of the wall is in view the more of them there are.
 */
export class WallWisps {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buf: WebGLBuffer;
  private readonly u;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, WISP_VS, QUAD_FS);
    this.u = uniforms(gl, this.prog, [
      'u_view',
      'u_origin',
      'u_scale',
      'u_time',
      'u_zone',
      'u_span',
      'u_side',
      'u_fresh',
    ]);
    // both sides in one buffer, the left side first
    const d = new Float32Array(2 * WISP_MAX * WISP_STRIDE);
    let o = 0;
    for (let side = 0; side < 2; side++) {
      const salt = side * 7919;
      for (let i = 0; i < WISP_MAX; i++) {
        d[o] = 120 + h01(i, 11 + salt) * 160;
        d[o + 1] = h01(i, 12 + salt);
        d[o + 2] = h01(i, 13 + salt);
        d[o + 3] = 6 + h01(i, 14 + salt) * 14;
        d[o + 4] = i;
        d[o + 5] = Math.round(2 + h01(i, 15 + salt) * 3);
        d[o + 6] = i % WISP.length;
        o += WISP_STRIDE;
      }
    }
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  /** Draw the wisps of both walls. Expects premultiplied alpha blending, like the quad batches. */
  draw(
    view: [number, number],
    origin: [number, number],
    scale: number,
    zone: number,
    t: number,
    v: WallView,
    fresh: number,
  ): void {
    const gl = this.gl;
    const top = Math.floor(v.y0) - 6;
    const span = Math.ceil(v.y1 - v.y0) + 12;
    const n = Math.min(WISP_MAX, Math.ceil((span / 100) * WISPS_PER_100));
    let bound = false;
    for (let side = 0; side < 2; side++) {
      const left = side === 0;
      const uOut = Math.floor(left ? v.x0 : v.width - v.x1) - 2;
      if (uOut >= zone + 8) continue; // this wall is off screen
      if (!bound) {
        bound = true;
        gl.useProgram(this.prog);
        gl.uniform2f(this.u.u_view, view[0], view[1]);
        gl.uniform2f(this.u.u_origin, origin[0], origin[1]);
        gl.uniform1f(this.u.u_scale, scale);
        gl.uniform1f(this.u.u_time, t);
        gl.uniform1f(this.u.u_zone, zone);
        gl.uniform2f(this.u.u_span, top, span);
        gl.uniform1f(this.u.u_fresh, fresh);
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      }
      gl.uniform2f(this.u.u_side, left ? 0 : v.width, left ? 1 : -1);
      // this side's wisps: point the attributes at its half of the buffer
      const base = side * WISP_MAX * WISP_STRIDE * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, WISP_STRIDE * 4, base);
      gl.vertexAttribDivisor(0, 1);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, WISP_STRIDE * 4, base + 16);
      gl.vertexAttribDivisor(1, 1);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    }
    if (bound) gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buf);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.prog);
  }
}
