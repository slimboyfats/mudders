/**
 * Self-contained page function (runs inside Chromium via page.evaluate): draws one frame of a
 * rotating WebGL2 triangle on `#c` and reports what the GPU produced. Must not reference anything
 * outside its own body.
 */
export interface TriangleFrameResult {
  ok: boolean;
  error?: string;
  renderer: string;
  /** RGBA at the canvas centre (inside the triangle) and at a corner (background). */
  centre: number[];
  corner: number[];
}

export function drawTriangleFrame(angle: number): TriangleFrameResult {
  const canvas = document.getElementById('c') as HTMLCanvasElement | null;
  if (!canvas) return { ok: false, error: 'no canvas', renderer: '', centre: [], corner: [] };
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) return { ok: false, error: 'no webgl2', renderer: '', centre: [], corner: [] };

  const vs = `#version 300 es
in vec2 pos;
in vec3 col;
uniform float angle;
out vec3 vCol;
void main() {
  float c = cos(angle), s = sin(angle);
  gl_Position = vec4(mat2(c, s, -s, c) * pos, 0.0, 1.0);
  vCol = col;
}`;
  const fs = `#version 300 es
precision mediump float;
in vec3 vCol;
out vec4 outColor;
void main() { outColor = vec4(vCol, 1.0); }`;

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type);
    if (!sh) throw new Error('createShader failed');
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(sh) ?? 'compile');
    return sh;
  };

  try {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    gl.useProgram(prog);

    // x, y, r, g, b — warm "mud on fire" colours.
    const data = new Float32Array([
      0.0, 0.75, 1.0, 0.48, 0.18, -0.7, -0.55, 0.85, 0.2, 0.1, 0.7, -0.55, 1.0, 0.85, 0.3,
    ]);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, 'pos');
    const colLoc = gl.getAttribLocation(prog, 'col');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(colLoc);
    gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, 20, 8);

    gl.uniform1f(gl.getUniformLocation(prog, 'angle'), angle);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.106, 0.078, 0.063, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const px = new Uint8Array(4);
    gl.readPixels(canvas.width >> 1, canvas.height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const centre = Array.from(px);
    gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const corner = Array.from(px);

    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(
      dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    );
    return { ok: true, renderer, centre, corner };
  } catch (e) {
    return { ok: false, error: String(e), renderer: '', centre: [], corner: [] };
  }
}
