import { QUAD_FS, QUAD_VS } from './shaders';
import { compile, uniforms } from './gl';

/** Per-instance floats: pos.xy, size.xy, rot, color.rgba, shape. */
const STRIDE = 10;

export const Shape = { Rect: 0, Glow: 1, Disc: 2, Ring: 3, Pixel: 4 } as const;
export type Shape = (typeof Shape)[keyof typeof Shape];

/**
 * Instanced quad batch in map coordinates (tanks, projectiles, trails, debris, particles). One
 * draw call per flush; the instance buffer is preallocated and grows only when exceeded.
 */
export class QuadBatch {
  private data: Float32Array;
  private n = 0;
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buf: WebGLBuffer;
  private readonly u;
  private gpuBytes: number;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    capacity = 4096,
  ) {
    this.data = new Float32Array(capacity * STRIDE);
    this.prog = compile(gl, QUAD_VS, QUAD_FS);
    this.u = uniforms(gl, this.prog, ['u_view', 'u_origin', 'u_scale']);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    this.gpuBytes = this.data.byteLength;
    const attrs: [number, number, number][] = [
      [0, 2, 0],
      [1, 2, 2],
      [2, 1, 4],
      [3, 4, 5],
      [4, 1, 9],
    ];
    for (const [loc, size, off] of attrs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * 4, off * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
  }

  get count(): number {
    return this.n;
  }

  /** Add a quad centred on (x, y) in map cells. `rgb` is 0xRRGGBB. */
  push(
    x: number,
    y: number,
    w: number,
    h: number,
    rgb: number,
    alpha = 1,
    shape: Shape = Shape.Rect,
    rot = 0,
  ): void {
    if ((this.n + 1) * STRIDE > this.data.length) {
      const bigger = new Float32Array(this.data.length * 2);
      bigger.set(this.data);
      this.data = bigger;
    }
    const d = this.data;
    const o = this.n * STRIDE;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = w;
    d[o + 3] = h;
    d[o + 4] = rot;
    d[o + 5] = ((rgb >> 16) & 255) / 255;
    d[o + 6] = ((rgb >> 8) & 255) / 255;
    d[o + 7] = (rgb & 255) / 255;
    d[o + 8] = alpha;
    d[o + 9] = shape;
    this.n++;
  }

  /** Axis-aligned rect from its top-left corner. */
  rect(x: number, y: number, w: number, h: number, rgb: number, alpha = 1): void {
    this.push(x + w / 2, y + h / 2, w, h, rgb, alpha);
  }

  /** A line segment as a rotated rect `width` cells thick. */
  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    rgb: number,
    alpha = 1,
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return;
    this.push((x0 + x1) / 2, (y0 + y1) / 2, len, width, rgb, alpha, Shape.Rect, Math.atan2(dy, dx));
  }

  flush(view: [number, number], origin: [number, number], scale: number): void {
    if (this.n === 0) return;
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.u_view, view[0], view[1]);
    gl.uniform2f(this.u.u_origin, origin[0], origin[1]);
    gl.uniform1f(this.u.u_scale, scale);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    if (this.data.byteLength > this.gpuBytes) {
      gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
      this.gpuBytes = this.data.byteLength;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * STRIDE);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.n);
    gl.bindVertexArray(null);
    this.n = 0;
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buf);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.prog);
  }
}
