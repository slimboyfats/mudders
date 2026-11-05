import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchHeadless } from './browser';
import { encodeGif } from './ffmpeg';
import { capturesDir } from './paths';
import { drawTriangleFrame, type TriangleFrameResult } from './webgl2-triangle';

export interface SmokeResult {
  renderer: string;
  png: string;
  gif: string;
  frames: number;
}

const WIDTH = 320;
const HEIGHT = 180;
const FRAMES = 24;
const FPS = 24;

/** A drawn pixel must differ clearly from the clear colour. */
function looksDrawn(centre: number[], corner: number[]): boolean {
  const diff = centre.slice(0, 3).reduce((sum, v, i) => sum + Math.abs(v - (corner[i] ?? 0)), 0);
  return diff > 120;
}

/**
 * Milestone 0 proof of the cloud dev loop: render a WebGL2 triangle in headless Chromium via
 * SwiftShader, screenshot it, check the pixels, and encode a short rotating GIF with ffmpeg.
 * Fixed-step: frame i uses angle i/FRAMES of a turn, never wall-clock time.
 */
export async function runWebgl2Smoke(): Promise<SmokeResult> {
  const out = capturesDir();
  const frameDir = mkdtempSync(join(tmpdir(), 'mudders-smoke-'));
  const browser = await launchHeadless();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#000">` +
        `<canvas id="c" width="${WIDTH}" height="${HEIGHT}"></canvas></body></html>`,
    );
    // tsx/esbuild may wrap functions with a `__name` helper that doesn't exist in the page.
    await page.addScriptTag({ content: 'window.__name = (f) => f;' });
    const canvas = page.locator('#c');

    let first: TriangleFrameResult | undefined;
    for (let i = 0; i < FRAMES; i++) {
      const angle = (i / FRAMES) * Math.PI * 2;
      const res = await page.evaluate(drawTriangleFrame, angle);
      if (!res.ok) throw new Error(`WebGL2 frame ${i} failed: ${res.error}`);
      if (i === 0) {
        first = res;
        if (!looksDrawn(res.centre, res.corner)) {
          throw new Error(
            `WebGL2 rendered nothing visible: centre=${res.centre.join(',')} corner=${res.corner.join(',')}`,
          );
        }
      }
      await canvas.screenshot({ path: join(frameDir, `f-${String(i).padStart(3, '0')}.png`) });
    }
    if (!first) throw new Error('no frames rendered');

    const png = join(out, 'smoke-webgl2.png');
    const gif = join(out, 'smoke-webgl2.gif');
    rmSync(png, { force: true });
    await page.evaluate(drawTriangleFrame, 0);
    await canvas.screenshot({ path: png });
    encodeGif({ inputPattern: join(frameDir, 'f-%03d.png'), fps: FPS, output: gif });

    return { renderer: first.renderer, png, gif, frames: FRAMES };
  } finally {
    await browser.close();
    rmSync(frameDir, { recursive: true, force: true });
  }
}
