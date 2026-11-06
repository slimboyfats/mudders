import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadContent } from '@mudders/content';
import { ScenarioSchema, TICK_RATE, type Scenario } from '@mudders/shared';
import { KERNEL_VERSION, ScenarioDriver } from '@mudders/sim';
import type { WireInit, WireSnapshot } from '@mudders/client/capture-wire';
import { paletteFrom } from '@mudders/client/palette';
import { launchHeadless } from '../browser';
import { checkFfmpeg } from '../ffmpeg';
import { REPO_ROOT, capturesDir } from '../paths';
import { buildRendererBundle } from './bundle';
import { DEVICES } from './devices';
import { DIFF_THRESHOLD, pixelDiff } from './diff';
import { decodeRgb, encodeGif, encodeMp4, encodeSheet, fileSize } from './encode';
import type { CaptureOptions } from './options';
import { isPreset, weaponShowcase } from './presets';
import { toWire } from './wire';

const GIF_MAX_W = 800;
const GIF_SMALL_W = 640;
const GIF_MAX_BYTES = 4 * 1024 * 1024;
/** Parallel render pages (see the frame loop). */
const WORKERS = 2;

export interface CaptureResult {
  outputs: string[];
  cached: boolean;
  diff?: number;
}

function loadScenario(o: CaptureOptions): Scenario {
  const content = loadContent();
  let s: Scenario;
  if (isPreset(o.target)) {
    if (!o.subject) throw new Error(`preset ${o.target} needs a subject, e.g. weapon.missile`);
    s = weaponShowcase(content, o.subject);
  } else {
    const file = resolve(REPO_ROOT, 'scenarios', `${o.target}.json`);
    if (!existsSync(file)) throw new Error(`no scenario ${o.target} (looked in scenarios/)`);
    s = ScenarioSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  }
  return o.seed === undefined ? s : { ...s, seed: o.seed };
}

function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function runCapture(o: CaptureOptions): Promise<CaptureResult> {
  checkFfmpeg();
  const started = performance.now();
  const content = loadContent();
  const scenario = loadScenario(o);
  const out = capturesDir();
  const cacheDir = resolve(out, '.cache');
  mkdirSync(cacheDir, { recursive: true });
  const bundle = await buildRendererBundle(resolve(cacheDir, 'renderer'));

  const device = o.device ? DEVICES[o.device]! : undefined;
  const driver = new ScenarioDriver(content, scenario);
  const w = driver.world;
  const theme = o.theme ?? scenario.theme ?? 'theme.default';
  if (!content.has(theme)) throw new Error(`unknown theme ${theme}`);
  const pal = paletteFrom(content);
  const init: WireInit = {
    mapWidth: w.grid.width,
    mapHeight: w.grid.height,
    palette: Array.from(pal.materials),
    looks: [...(pal.looks ?? [])],
    themes: { ...pal.themes },
    shells: { ...pal.shells },
    quality: o.quality,
    theme,
    cssWidth: device?.cssWidth ?? w.grid.width * o.scale,
    cssHeight: device?.cssHeight ?? w.grid.height * o.scale,
    dpr: device?.dpr ?? 1,
    shake: o.shake,
    ...(o.zoom > 0 ? { zoom: o.zoom } : {}),
    ...(o.center ? { center: o.center } : {}),
  };

  const key = createHash('sha256')
    .update(
      JSON.stringify({
        scenario,
        content: content.hash,
        renderer: bundle.hash,
        init,
        fps: o.fps,
        gif: o.gif,
        mp4: o.mp4,
      }),
    )
    .digest('hex')
    .slice(0, 20);
  const cacheFile = resolve(cacheDir, `${key}.json`);
  const base = o.theme ? `${scenario.id}.${o.theme.slice('theme.'.length)}` : scenario.id;
  if (o.cache && existsSync(cacheFile)) {
    const prev = JSON.parse(readFileSync(cacheFile, 'utf8')) as { outputs: string[] };
    if (prev.outputs.every((p) => existsSync(p))) {
      const res: CaptureResult = { outputs: prev.outputs, cached: true };
      const sheet = prev.outputs.find((p) => p.endsWith('-sheet.png'));
      if (sheet) finishReference(o, base, sheet, res);
      return res;
    }
  }

  const frameDir = mkdtempSync(join(tmpdir(), 'mudders-capture-'));
  const browser = await launchHeadless();
  try {
    // SwiftShader rendering + PNG encoding dominate; spread frames over parallel pages. Every
    // page sees every snapshot (cheap) but draws only its share of frames (expensive).
    const pages = await Promise.all(
      Array.from({ length: WORKERS }, async () => {
        const page = await browser.newPage({
          viewport: { width: Math.ceil(init.cssWidth), height: Math.ceil(init.cssHeight) },
        });
        await page.setContent(
          '<!doctype html><html><body style="margin:0;background:#000"></body></html>',
        );
        await page.addScriptTag({ path: bundle.path });
        return page;
      }),
    );
    const glRenderer = (
      await Promise.all(pages.map((p) => p.evaluate((i) => window.__mudders!.init(i), init)))
    )[0]!;

    const step = TICK_RATE / o.fps;
    let pending: WireSnapshot[] = [];
    let frames = 0;
    let impactFrame = -1;
    let impactTick = -1;
    let halfFrame = -1;
    const framePath = (i: number) => join(frameDir, `f-${String(i).padStart(5, '0')}.png`);
    let inflight: Promise<void>[] = [];
    const grab = async (time: number): Promise<void> => {
      const index = frames++;
      const snaps = pending;
      pending = [];
      for (let k = 0; k < pages.length; k++) {
        const draw = index % pages.length === k;
        // per-page evaluate calls run in order, so each page sees snapshots in tick order
        const job = pages[k]!.evaluate(([s, t, d]) => window.__mudders!.frame(s, t, d), [
          snaps,
          time,
          draw,
        ] as const).then((url) => {
          if (draw) {
            writeFileSync(framePath(index), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
          }
        });
        inflight.push(job);
      }
      if (inflight.length >= WORKERS * 6) {
        await Promise.all(inflight);
        inflight = [];
      }
    };

    while (!driver.done) {
      const snap = w.snapshot();
      pending.push(toWire(snap));
      if (
        impactTick < 0 &&
        snap.effectEvents.some((e) => e.type !== 'muzzle' && e.type !== 'land')
      ) {
        impactTick = snap.tick;
      }
      if (snap.tick % step === 0) {
        await grab(snap.tick);
        if (impactTick >= 0 && impactFrame < 0) impactFrame = frames - 1;
        if (impactTick >= 0 && halfFrame < 0 && snap.tick >= impactTick + TICK_RATE / 2) {
          halfFrame = frames - 1;
        }
      }
      driver.step();
    }
    // hold the settled frame for half a second
    pending.push(toWire(w.snapshot()));
    const endTick = w.tick;
    for (let i = 0; i < o.fps / 2; i++) await grab(endTick + i * step);
    await Promise.all(inflight);
    const settledFrame = frames - 1;

    const id = `${base}-${stamp()}`;
    const outputs: string[] = [];
    const sheet = resolve(out, `${id}-sheet.png`);
    const keyFrames = [impactFrame, halfFrame, settledFrame].filter(
      (f, i, a) => f >= 0 && a.indexOf(f) === i,
    );
    encodeSheet(keyFrames.map(framePath), sheet);
    outputs.push(sheet);
    const pattern = join(frameDir, 'f-%05d.png');
    if (o.gif) {
      const gif = resolve(out, `${id}.gif`);
      encodeGif(pattern, o.fps, gif, GIF_MAX_W);
      if (fileSize(gif) > GIF_MAX_BYTES) encodeGif(pattern, Math.min(o.fps, 20), gif, GIF_SMALL_W);
      outputs.push(gif);
    }
    if (o.mp4) {
      const mp4 = resolve(out, `${id}.mp4`);
      encodeMp4(pattern, o.fps, mp4);
      outputs.push(mp4);
    }
    const sidecar = resolve(out, `${id}.json`);
    const elapsed = (performance.now() - started) / 1000;
    writeFileSync(
      sidecar,
      JSON.stringify(
        {
          scenario: scenario.id,
          subject: scenario.subject,
          seed: scenario.seed,
          contentHash: content.hash,
          kernelVersion: KERNEL_VERSION,
          rendererHash: bundle.hash,
          renderer: 'pixel',
          glRenderer,
          quality: o.quality,
          fps: o.fps,
          frames,
          ticks: endTick,
          durationSeconds: frames / o.fps,
          stateHash: w.hash(),
          gitSha: gitSha(),
          device: o.device ?? null,
          size: { cssWidth: init.cssWidth, cssHeight: init.cssHeight, dpr: init.dpr },
          renderSeconds: Math.round(elapsed * 10) / 10,
          inputs: scenario.inputs,
        },
        null,
        2,
      ) + '\n',
    );
    outputs.push(sidecar);
    writeFileSync(cacheFile, JSON.stringify({ outputs }) + '\n');
    console.error(
      `${scenario.id}: ${endTick} ticks, ${frames} frames, ${elapsed.toFixed(1)} s, ${glRenderer}`,
    );
    const res: CaptureResult = { outputs, cached: false };
    finishReference(o, base, sheet, res);
    return res;
  } finally {
    await browser.close();
    rmSync(frameDir, { recursive: true, force: true });
  }
}

function finishReference(o: CaptureOptions, base: string, sheet: string, res: CaptureResult): void {
  const refDir = resolve(capturesDir(), 'reference');
  const ref = resolve(refDir, `${base}-sheet.png`);
  if (o.updateReference) {
    mkdirSync(refDir, { recursive: true });
    copyFileSync(sheet, ref);
    console.error(`reference updated: ${ref}`);
  }
  if (o.diff) {
    if (!existsSync(ref)) throw new Error(`no reference for ${base}; run with --update-reference`);
    res.diff = pixelDiff(decodeRgb(sheet), decodeRgb(ref));
    const pct = (res.diff * 100).toFixed(3);
    if (res.diff > DIFF_THRESHOLD) {
      throw new Error(`visual diff ${pct}% > ${DIFF_THRESHOLD * 100}% against ${ref}`);
    }
    console.error(`visual diff ${pct}% (ok)`);
  }
}
