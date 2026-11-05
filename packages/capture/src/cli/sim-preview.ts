/**
 * pnpm sim:preview [scenario-id…] [--all] [--no-mp4]
 *
 * Milestone-1 stand-in for `pnpm capture`: runs scenarios from `scenarios/` through the real sim
 * and content, draws every snapshot with the CPU debug renderer, and writes
 * `captures/<scenario>.gif`, `.mp4` and `-sheet.png` (impact, +0.5 s, settled). Output paths are
 * printed last, one per line (§2d).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadContent } from '@mudders/content';
import { ScenarioSchema, TICK_RATE, type Scenario } from '@mudders/shared';
import { ScenarioDriver } from '@mudders/sim';
import { checkFfmpeg } from '../ffmpeg';
import { REPO_ROOT, capturesDir } from '../paths';
import { RawEncoder, gifOutArgs, mp4OutArgs, writeSheet } from '../preview/encode';
import { Frame, hexColor } from '../preview/frame';
import { DebugRenderer } from '../preview/render';

const SCENARIOS = resolve(REPO_ROOT, 'scenarios');
const FPS = 30;
const GIF_MAX_W = 800;

function loadScenario(id: string): Scenario {
  return ScenarioSchema.parse(JSON.parse(readFileSync(resolve(SCENARIOS, `${id}.json`), 'utf8')));
}

async function runOne(id: string, mp4: boolean): Promise<string[]> {
  const content = loadContent();
  const scenario = loadScenario(id);
  const driver = new ScenarioDriver(content, scenario);
  const w = driver.world;
  const palette = new Uint32Array(256);
  for (const m of content.list('material')) palette[m.cell] = hexColor(m.meta.color, 0xff00ff);
  const renderer = new DebugRenderer(w.grid.width, w.grid.height, palette);
  const frame = new Frame(w.grid.width, w.grid.height);
  const out = capturesDir();
  const base = resolve(out, id);
  const gif = new RawEncoder(
    frame.width,
    frame.height,
    FPS,
    gifOutArgs(`${base}.gif`, Math.min(GIF_MAX_W, frame.width)),
  );
  const vid = mp4
    ? new RawEncoder(
        frame.width,
        frame.height,
        FPS,
        mp4OutArgs(`${base}.mp4`, frame.width <= 800 ? 2 : 1),
      )
    : null;

  const step = TICK_RATE / FPS;
  let impactTick = -1;
  const sheet: Frame[] = [];
  let lastPlayer = w.activePlayer;
  let frames = 0;
  while (!driver.done) {
    const snap = w.snapshot();
    const newTurn = w.activePlayer !== lastPlayer;
    lastPlayer = w.activePlayer;
    renderer.draw(snap, frame, newTurn);
    if (
      impactTick < 0 &&
      snap.effectEvents.some((e) => e.type === 'burst' || e.type === 'shockwave')
    ) {
      impactTick = snap.tick;
      sheet.push(frame.copy());
    }
    if (impactTick >= 0 && sheet.length === 1 && snap.tick >= impactTick + TICK_RATE / 2)
      sheet.push(frame.copy());
    if (snap.tick % step === 0) {
      await gif.write(frame);
      if (vid) await vid.write(frame);
      frames++;
    }
    driver.step();
  }
  const final = w.snapshot();
  renderer.draw(final, frame, false);
  for (let i = 0; i < FPS / 2; i++) {
    await gif.write(frame);
    if (vid) await vid.write(frame);
  }
  sheet.push(frame.copy());
  await gif.close();
  if (vid) await vid.close();
  writeSheet(sheet, `${base}-sheet.png`);

  console.error(
    `${id}: ${w.tick} ticks, ${frames} frames, hash ${w.hash()}, content ${content.hash}, ` +
      `tanks ${w.tanks.map((t) => `P${t.player}:${t.health}hp@${t.x},${t.y}`).join(' ')}`,
  );
  return [`${base}-sheet.png`, `${base}.gif`, ...(mp4 ? [`${base}.mp4`] : [])];
}

export async function main(args: string[]): Promise<number> {
  try {
    checkFfmpeg();
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
  const mp4 = !args.includes('--no-mp4');
  let ids = args.filter((a) => !a.startsWith('--'));
  if (args.includes('--all') || ids.length === 0) {
    ids = readdirSync(SCENARIOS)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
      .sort();
  }
  const paths: string[] = [];
  for (const id of ids) paths.push(...(await runOne(id, mp4)));
  for (const p of paths) console.log(p);
  return 0;
}
