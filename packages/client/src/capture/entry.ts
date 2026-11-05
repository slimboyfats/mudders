import type { RenderSnapshot } from '@mudders/shared';
import { PixelRenderer } from '../render/pixel/renderer';
import type { SnapshotStream } from '../render/types';
import type { CaptureApi, WireInit, WireSnapshot } from './wire';

/**
 * Capture page entry (§2d): mounts the real pixel renderer on a canvas and plays the snapshot
 * stream the CLI sends, at a fixed step. No wall clock anywhere, so frames are reproducible.
 */
let renderer: PixelRenderer | undefined;
let canvas: HTMLCanvasElement | undefined;
let terrain = new Uint8Array(0);
let coating = new Uint8Array(0);
let mapW = 0;
let mapH = 0;
const listeners: ((s: RenderSnapshot) => void)[] = [];
const stream: SnapshotStream = {
  subscribe(fn) {
    listeners.push(fn);
    return () => listeners.splice(listeners.indexOf(fn), 1);
  },
};

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const api: CaptureApi = {
  init(init: WireInit): string {
    mapW = init.mapWidth;
    mapH = init.mapHeight;
    terrain = new Uint8Array(mapW * mapH);
    coating = new Uint8Array(mapW * mapH);
    canvas?.remove();
    canvas = document.createElement('canvas');
    canvas.style.width = `${init.cssWidth}px`;
    canvas.style.height = `${init.cssHeight}px`;
    canvas.style.display = 'block';
    document.body.appendChild(canvas);
    renderer = new PixelRenderer(mapW, mapH);
    renderer.mount(canvas, stream, {
      quality: init.quality,
      theme: init.theme,
      palette: {
        materials: Uint32Array.from(init.palette),
        looks: init.looks,
        themes: init.themes,
      },
      shake: init.shake,
      preserveDrawingBuffer: true,
    });
    renderer.resize(init.cssWidth, init.cssHeight, init.dpr);
    if (init.zoom && init.zoom > 0) {
      const c = init.center ?? { x: mapW / 2, y: mapH / 2 };
      for (let i = 0; i < init.zoom; i++) renderer.camera.zoomBy(1);
      const p = renderer.project(c);
      renderer.camera.pan(init.cssWidth / 2 - p.x, init.cssHeight / 2 - p.y);
    }
    const gl = canvas.getContext('webgl2');
    return gl ? String(gl.getParameter(gl.RENDERER)) : 'unknown';
  },

  frame(snaps: WireSnapshot[], time: number, draw: boolean): string {
    if (!renderer || !canvas) throw new Error('capture page not initialised');
    for (const w of snaps) {
      const dirtyRects = [];
      for (const [x, y, pw, ph, b64, c64] of w.patches) {
        const bytes = decode(b64);
        const cb = c64 ? decode(c64) : null;
        for (let row = 0; row < ph; row++) {
          const at = (y + row) * mapW + x;
          terrain.set(bytes.subarray(row * pw, (row + 1) * pw), at);
          if (cb) coating.set(cb.subarray(row * pw, (row + 1) * pw), at);
          else coating.fill(0, at, at + pw);
        }
        dirtyRects.push({ x, y, w: pw, h: ph });
      }
      const snap: RenderSnapshot = {
        tick: w.tick,
        turn: w.turn,
        width: mapW,
        height: mapH,
        terrain,
        coating,
        dirtyRects,
        entities: w.entities,
        effectEvents: w.effectEvents,
        debris: {
          count: w.debris.x.length,
          x: Int32Array.from(w.debris.x),
          y: Int32Array.from(w.debris.y),
          material: Uint8Array.from(w.debris.m),
        },
        wind: w.wind,
        theme: w.theme,
      };
      for (const l of listeners) l(snap);
    }
    if (!draw) return '';
    renderer.render(time);
    return canvas.toDataURL('image/png');
  },
};

window.__mudders = api;
