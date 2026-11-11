import { describe, expect, it } from 'vitest';
import { uploadChanged } from './gl';

/** A stand-in for the few WebGL2 calls `uploadChanged` makes, recording the uploaded box. */
function fakeGl(): { gl: WebGL2RenderingContext; boxes: number[][] } {
  const boxes: number[][] = [];
  const gl = {
    TEXTURE_2D: 1,
    RED_INTEGER: 2,
    UNSIGNED_BYTE: 3,
    UNPACK_ALIGNMENT: 4,
    UNPACK_ROW_LENGTH: 5,
    UNPACK_SKIP_PIXELS: 6,
    UNPACK_SKIP_ROWS: 7,
    bindTexture: () => {},
    pixelStorei: () => {},
    texSubImage2D: (_t: number, _l: number, x: number, y: number, w: number, h: number) =>
      boxes.push([x, y, w, h]),
  } as unknown as WebGL2RenderingContext;
  return { gl, boxes };
}

describe('uploadChanged', () => {
  const W = 50;
  const H = 30;
  const tex = {} as WebGLTexture;

  it('uploads nothing when the field is unchanged', () => {
    const { gl, boxes } = fakeGl();
    const next = new Uint8Array(W * H).fill(3);
    const shown = next.slice();
    expect(uploadChanged(gl, tex, next, shown, W, H)).toBe(false);
    expect(boxes).toEqual([]);
  });

  it('uploads just the box around the changed cells and remembers them', () => {
    const { gl, boxes } = fakeGl();
    const next = new Uint8Array(W * H);
    const shown = next.slice();
    next[5 * W + 12] = 9;
    next[8 * W + 20] = 4;
    next[7 * W + 10] = 1;
    expect(uploadChanged(gl, tex, next, shown, W, H)).toBe(true);
    expect(boxes).toEqual([[10, 5, 11, 4]]);
    expect(shown).toEqual(next);
    // a second call with nothing new is free
    expect(uploadChanged(gl, tex, next, shown, W, H)).toBe(false);
    expect(boxes.length).toBe(1);
  });
});
