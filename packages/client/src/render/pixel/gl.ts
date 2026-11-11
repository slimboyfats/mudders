/** Small WebGL2 helpers. Everything here must run on SwiftShader (headless capture, §2d). */

export function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
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
      throw new Error(`shader compile failed: ${gl.getShaderInfoLog(sh) ?? ''}\n${src}`);
    }
    gl.attachShader(prog, sh);
    gl.deleteShader(sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(prog) ?? ''}`);
  }
  return prog;
}

/** Uniform locations by name, looked up once. */
export function uniforms<K extends string>(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  names: readonly K[],
): Record<K, WebGLUniformLocation | null> {
  const out = {} as Record<K, WebGLUniformLocation | null>;
  for (const n of names) out[n] = gl.getUniformLocation(prog, n);
  return out;
}

export function texture(gl: WebGL2RenderingContext, filter: number = gl.NEAREST): WebGLTexture {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export function rgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** Tiny deterministic PRNG for cosmetic effects (mulberry32). Never Math.random: captures must replay. */
export class FxRng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}

/**
 * Upload only the box of an R8UI map texture where `next` differs from `shown` (what the texture
 * holds), then copy that box into `shown`. Whole-map fields are rebuilt on the CPU but usually
 * change in one crater's worth of cells, and a full-map upload stalls a phone's GPU queue.
 * Returns whether anything was uploaded.
 */
export function uploadChanged(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  next: Uint8Array,
  shown: Uint8Array,
  w: number,
  h: number,
): boolean {
  let y0 = -1;
  let y1 = -1;
  let x0 = w;
  let x1 = -1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let a = -1;
    for (let x = 0; x < w; x++) {
      if (next[o + x] !== shown[o + x]) {
        a = x;
        break;
      }
    }
    if (a < 0) continue;
    let b = w - 1;
    while (next[o + b] === shown[o + b]) b--;
    if (y0 < 0) y0 = y;
    y1 = y;
    if (a < x0) x0 = a;
    if (b > x1) x1 = b;
  }
  if (y0 < 0) return false;
  for (let y = y0; y <= y1; y++) shown.set(next.subarray(y * w + x0, y * w + x1 + 1), y * w + x0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, w);
  gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
  gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    x0,
    y0,
    x1 - x0 + 1,
    y1 - y0 + 1,
    gl.RED_INTEGER,
    gl.UNSIGNED_BYTE,
    next,
  );
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
  gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
  gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  return true;
}
