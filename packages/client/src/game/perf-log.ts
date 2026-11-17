/**
 * Performance recorder (Settings → Show performance → Record): what the frames of a match cost on
 * the device they ran on, as a small text file to send back. One line per second with frame
 * times, sim, per-tick renderer and draw CPU time, GPU time per part of the frame where the browser can measure
 * it, and what the world was doing at the time, so a slow second can be traced to its cause.
 *
 * Plain data in, text out: no DOM, no clock of its own (the caller passes `now`).
 */

import { GPU_PARTS } from '../render/types';

/** Frames longer than this (ms) are listed one by one. */
const LONG_FRAME = 50;
const MAX_LONG = 150;
/** An hour of seconds; past it the oldest rows drop. */
const MAX_ROWS = 3600;
/** Upper edges (ms) of the frame-time histogram's bars; the last bar takes the rest. */
const BARS = [17, 21, 26, 34, 50, 100, 250] as const;

/** What the world and the renderer were doing in a second (asked once a second). */
export interface PerfContext {
  phase: string;
  round: number;
  turn: number;
  quality: string;
  /** Particle slots the GPU works on. */
  particles: number;
  projectiles: number;
  debris: number;
  /** Cells in the sim's settle and reaction regions (how much ground and liquid is on the move). */
  settle: number;
  react: number;
  /** GPU ms per frame for each of `GPU_PARTS`, or null where the browser can't time the GPU. */
  gpu: readonly number[] | null;
  /** Free text: the weapon just fired, a twist, anything worth seeing next to a slow second. */
  note: string;
}

interface Row extends PerfContext {
  t: number;
  frames: number;
  fps: number;
  frameAvg: number;
  frameP95: number;
  frameMax: number;
  ticks: number;
  simAvg: number;
  simMax: number;
  stepAvg: number;
  renderAvg: number;
  renderMax: number;
}

interface LongFrame {
  t: number;
  ms: number;
  sim: number;
  step: number;
  render: number;
  ticks: number;
  phase: string;
}

const f1 = (v: number): string => (Math.round(v * 10) / 10).toString();

export class PerfRecorder {
  private readonly rows: Row[] = [];
  private readonly long: LongFrame[] = [];
  private readonly bars = new Array<number>(BARS.length + 1).fill(0);
  private readonly times: number[] = [];
  private t0 = -1;
  private secStart = -1;
  private ticks = 0;
  private sim = 0;
  private simMax = 0;
  private step = 0;
  private render = 0;
  private renderMax = 0;
  private phase = '';
  private dropped = 0;

  /** @param meta facts about the device and the match, printed at the top as `key: value`. */
  constructor(private readonly meta: Readonly<Record<string, string | number>>) {}

  /** Seconds recorded so far. */
  get seconds(): number {
    return this.t0 < 0 ? 0 : Math.round((this.last - this.t0) / 1000);
  }

  private last = 0;

  /**
   * One frame: `wall` ms since the frame before, `ticks` sim ticks it ran in `simMs` (the world
   * alone), `stepMs` the renderer spent taking those ticks in, and `renderMs` of CPU time to build
   * and submit the picture. `context` is asked once a second.
   */
  frame(
    now: number,
    wall: number,
    ticks: number,
    simMs: number,
    stepMs: number,
    renderMs: number,
    context: () => PerfContext,
  ): void {
    if (this.t0 < 0) {
      this.t0 = now;
      this.secStart = now;
    }
    this.last = now;
    // the first frame, or the one after the tab was hidden, has no real length
    if (wall > 0 && wall < 5000) {
      this.times.push(wall);
      let b = 0;
      while (b < BARS.length && wall > (BARS[b] ?? Infinity)) b++;
      this.bars[b] = (this.bars[b] ?? 0) + 1;
      if (wall > LONG_FRAME && this.long.length < MAX_LONG) {
        this.long.push({
          t: (now - this.t0) / 1000,
          ms: wall,
          sim: simMs,
          step: stepMs,
          render: renderMs,
          ticks,
          phase: this.phase,
        });
      }
    }
    this.ticks += ticks;
    this.sim += simMs;
    if (ticks > 0 && simMs / ticks > this.simMax) this.simMax = simMs / ticks;
    this.step += stepMs;
    this.render += renderMs;
    if (renderMs > this.renderMax) this.renderMax = renderMs;
    const span = now - this.secStart;
    if (span < 1000) return;
    const c = context();
    this.phase = c.phase;
    const ts = this.times;
    const n = ts.length;
    const sorted = [...ts].sort((a, b) => a - b);
    const frames = Math.max(1, n);
    this.rows.push({
      ...c,
      t: Math.round((now - this.t0) / 1000),
      frames: n,
      fps: (n * 1000) / span,
      frameAvg: n > 0 ? sorted.reduce((a, b) => a + b, 0) / n : 0,
      frameP95: n > 0 ? (sorted[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0) : 0,
      frameMax: n > 0 ? (sorted[n - 1] ?? 0) : 0,
      ticks: this.ticks,
      simAvg: this.ticks > 0 ? this.sim / this.ticks : 0,
      simMax: this.simMax,
      stepAvg: this.ticks > 0 ? this.step / this.ticks : 0,
      renderAvg: this.render / frames,
      renderMax: this.renderMax,
    });
    if (this.rows.length > MAX_ROWS) {
      this.rows.shift();
      this.dropped++;
    }
    ts.length = 0;
    this.secStart = now;
    this.ticks = 0;
    this.sim = this.simMax = this.step = this.render = this.renderMax = 0;
  }

  /** The whole recording as text: facts, a summary, the slowest seconds, then every second. */
  report(): string {
    const rows = this.rows;
    const out: string[] = ['# mudders performance log v1'];
    for (const [k, v] of Object.entries(this.meta)) out.push(`${k}: ${v}`);
    out.push(
      `seconds: ${rows.length}${this.dropped > 0 ? ` (first ${this.dropped} dropped)` : ''}`,
    );

    const frames = this.bars.reduce((a, b) => a + b, 0);
    if (rows.length > 0 && frames > 0) {
      const avg = (pick: (r: Row) => number): number =>
        rows.reduce((a, r) => a + pick(r), 0) / rows.length;
      const max = (pick: (r: Row) => number): number =>
        rows.reduce((a, r) => Math.max(a, pick(r)), 0);
      const fps = [...rows].map((r) => r.fps).sort((a, b) => a - b);
      out.push('', '## summary');
      out.push(
        `fps: avg ${f1(avg((r) => r.fps))}, median ${f1(fps[fps.length >> 1] ?? 0)}, worst second ${f1(fps[0] ?? 0)}`,
      );
      out.push(
        `sim ms/tick: avg ${f1(avg((r) => r.simAvg))}, worst tick ${f1(max((r) => r.simMax))}`,
      );
      out.push(`renderer step ms/tick: avg ${f1(avg((r) => r.stepAvg))}`);
      out.push(
        `render cpu ms/frame: avg ${f1(avg((r) => r.renderAvg))}, worst ${f1(max((r) => r.renderMax))}`,
      );
      const timed = rows.filter((r) => r.gpu !== null);
      if (timed.length > 0) {
        const parts = GPU_PARTS.map(
          (name, i) =>
            `${name} ${f1(timed.reduce((a, r) => a + (r.gpu?.[i] ?? 0), 0) / timed.length)}`,
        );
        const total =
          timed.reduce((a, r) => a + (r.gpu ?? []).reduce((x, y) => x + y, 0), 0) / timed.length;
        out.push(`gpu ms/frame: total ${f1(total)} (${parts.join(', ')})`);
      } else {
        out.push('gpu ms/frame: not available in this browser');
        out.push('(a low fps with low sim, step and render times means the GPU is the limit)');
      }
      const edges = BARS.map((b, i) => `${i === 0 ? '≤' : `${BARS[i - 1] ?? 0}-`}${b}`);
      edges.push(`>${BARS[BARS.length - 1] ?? 0}`);
      out.push(
        `frame ms: ${this.bars.map((n, i) => `${edges[i] ?? ''}: ${f1((n * 100) / frames)}%`).join(', ')}`,
      );

      out.push('', '## slowest seconds');
      out.push(HEAD);
      for (const r of [...rows].sort((a, b) => a.fps - b.fps).slice(0, 12)) out.push(line(r));
    }

    if (this.long.length > 0) {
      out.push(
        '',
        `## frames over ${LONG_FRAME} ms (t, ms, sim ms, step ms, render ms, ticks, phase)`,
      );
      for (const l of this.long) {
        out.push(
          `${f1(l.t)},${f1(l.ms)},${f1(l.sim)},${f1(l.step)},${f1(l.render)},${l.ticks},${l.phase || '-'}`,
        );
      }
      if (this.long.length === MAX_LONG) out.push('(more not listed)');
    }

    out.push('', '## every second');
    out.push(HEAD);
    for (const r of rows) out.push(line(r));
    return out.join('\n') + '\n';
  }
}

const HEAD =
  't,fps,frame avg,frame p95,frame max,ticks,sim avg,sim max,step avg,render avg,render max,' +
  `${GPU_PARTS.map((p) => `gpu ${p}`).join(',')},quality,phase,round,turn,` +
  'particles,projectiles,debris,settle cells,react cells,note';

function line(r: Row): string {
  const g = r.gpu;
  const gpu = GPU_PARTS.map((_, i) => (g ? f1(g[i] ?? 0) : ''));
  return [
    r.t,
    f1(r.fps),
    f1(r.frameAvg),
    f1(r.frameP95),
    f1(r.frameMax),
    r.ticks,
    f1(r.simAvg),
    f1(r.simMax),
    f1(r.stepAvg),
    f1(r.renderAvg),
    f1(r.renderMax),
    ...gpu,
    r.quality,
    r.phase,
    r.round,
    r.turn,
    r.particles,
    r.projectiles,
    r.debris,
    r.settle,
    r.react,
    r.note.replace(/[,\n]/g, ' '),
  ].join(',');
}

/** File name for a recording made at `date`: `mudders-perf-20261117-0612.txt`. */
export function perfFileName(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `mudders-perf-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.txt`;
}
