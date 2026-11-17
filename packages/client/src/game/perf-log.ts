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
  /** Free text: the map, the weather, a twist, anything worth seeing next to a slow second. */
  note: string;
  /** The weapon fired last ('' before the first shot). */
  weapon: string;
  /** What the turn is waiting on, in words ('' = nothing). */
  holding: string;
  /** Online: this client's side of the match and how it stands with the other ('' = local). */
  net: string;
  /** JS heap in use, MB (0 where the browser doesn't say). A drop is a garbage collection. */
  heap: number;
  /**
   * Sim ms spent in each part of the tick during this second (`partNames` order), or null when
   * the sim wasn't timed by part.
   */
  parts: readonly number[] | null;
  /** The slowest tick of the second and the part that took most of it, in words. */
  worstTick: string;
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
  /** JS ms a frame outside sim, step and render (HUD, markers, input). */
  otherAvg: number;
  otherMax: number;
  /** Sim time that passed, in percent of the wall time (100 = real time). */
  speed: number;
  /** Sim time the frame loop asked for, in percent (under 100: a hit pause or slow motion). */
  asked: number;
  /** Times the player pressed Slow now in this second. */
  marks: number;
}

/** The browser reported the page blocked: a long task or a long animation frame. */
interface Stall {
  t: number;
  kind: string;
  ms: number;
  detail: string;
}
const MAX_STALLS = 200;

interface LongFrame {
  t: number;
  ms: number;
  sim: number;
  step: number;
  render: number;
  other: number;
  ticks: number;
  phase: string;
}

const f1 = (v: number): string => (Math.round(v * 10) / 10).toString();
const f2 = (v: number): string => (Math.round(v * 100) / 100).toString();

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
  private asked = 0;
  private marks = 0;
  private other = 0;
  private otherMax = 0;
  private fastest = Infinity;
  private readonly stalls: Stall[] = [];
  private readonly marked: number[] = [];

  /** @param meta facts about the device and the match, printed at the top as `key: value`. */
  constructor(
    private readonly meta: Readonly<Record<string, string | number>>,
    /** Names of the sim's parts, in `PerfContext.parts` order. */
    private readonly partNames: readonly string[] = [],
    /** Wall ms one sim tick stands for at full speed. */
    private readonly tickMs = 1000 / 60,
  ) {}

  /** Seconds recorded so far. */
  get seconds(): number {
    return this.t0 < 0 ? 0 : Math.round((this.last - this.t0) / 1000);
  }

  private last = 0;

  /**
   * One frame: `wall` ms since the frame before, `ticks` sim ticks it ran in `simMs` (the world
   * alone), `stepMs` the renderer spent taking those ticks in, and `renderMs` of CPU time to build
   * and submit the picture, `otherMs` the rest of the frame's JS, and `askedMs` the sim time the
   * frame loop wanted to run. `context` is asked once a second.
   */
  frame(
    now: number,
    wall: number,
    ticks: number,
    simMs: number,
    stepMs: number,
    renderMs: number,
    otherMs: number,
    askedMs: number,
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
      if (wall < this.fastest) this.fastest = wall;
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
          other: otherMs,
          ticks,
          phase: this.phase,
        });
      }
    }
    this.ticks += ticks;
    this.sim += simMs;
    if (ticks > 0 && simMs / ticks > this.simMax) this.simMax = simMs / ticks;
    this.step += stepMs;
    this.asked += askedMs;
    this.other += otherMs;
    if (otherMs > this.otherMax) this.otherMax = otherMs;
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
      otherAvg: this.other / frames,
      otherMax: this.otherMax,
      speed: (this.ticks * this.tickMs * 100) / span,
      asked: (this.asked * 100) / span,
      marks: this.marks,
    });
    if (this.rows.length > MAX_ROWS) {
      this.rows.shift();
      this.dropped++;
    }
    ts.length = 0;
    this.secStart = now;
    this.ticks = 0;
    this.sim = this.simMax = this.step = this.render = this.renderMax = 0;
    this.asked = this.marks = this.other = this.otherMax = 0;
  }

  /** The player says it feels slow right now: the second gets a mark in the log. */
  mark(now: number): void {
    if (this.t0 < 0) return;
    this.marks++;
    this.marked.push((now - this.t0) / 1000);
  }

  /** The browser says the page was blocked for `ms` (a long task, a long animation frame). */
  stall(now: number, kind: string, ms: number, detail: string): void {
    // (the browser also hands over entries from before the recording began)
    if (this.t0 < 0 || now < this.t0 || this.stalls.length >= MAX_STALLS) return;
    this.stalls.push({ t: (now - this.t0) / 1000, kind, ms, detail });
  }

  /** The whole recording as text: facts, a summary, the slowest seconds, then every second. */
  report(): string {
    const rows = this.rows;
    const out: string[] = ['# mudders performance log v2'];
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
      out.push(
        `other js ms/frame: avg ${f1(avg((r) => r.otherAvg))}, worst ${f1(max((r) => r.otherMax))}`,
      );
      if (Number.isFinite(this.fastest)) {
        out.push(
          `fastest frame: ${f1(this.fastest)} ms (the screen runs at up to about ${Math.round(1000 / this.fastest)} Hz)`,
        );
      }
      const heaps = rows.map((r) => r.heap).filter((h) => h > 0);
      if (heaps.length > 1) {
        let drops = 0;
        for (let i = 1; i < rows.length; i++) {
          if ((rows[i]?.heap ?? 0) < (rows[i - 1]?.heap ?? 0) - 1) drops++;
        }
        out.push(
          `js heap MB: ${f1(Math.min(...heaps))} to ${f1(Math.max(...heaps))}, ${drops} drops (garbage collections seen)`,
        );
      }
      out.push(
        `browser stalls: ${this.stalls.length}${this.stalls.length > 0 ? `, longest ${f1(this.stalls.reduce((a, x) => Math.max(a, x.ms), 0))} ms` : ''}`,
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
        out.push('gpu ms/frame: not measured (no timer in this browser and no Slow now pressed)');
        out.push('(a low fps with low sim, step and render times means the GPU is the limit)');
      }
      const edges = BARS.map((b, i) => `${i === 0 ? '≤' : `${BARS[i - 1] ?? 0}-`}${b}`);
      edges.push(`>${BARS[BARS.length - 1] ?? 0}`);
      out.push(
        `frame ms: ${this.bars.map((n, i) => `${edges[i] ?? ''}: ${f1((n * 100) / frames)}%`).join(', ')}`,
      );

      const slow = rows.filter((r) => r.speed < 90).length;
      out.push(
        `game speed: avg ${f1(avg((r) => r.speed))}%, slowest second ${f1(rows.reduce((a, r) => Math.min(a, r.speed), 1000))}%, ${slow} of ${rows.length} seconds under 90%`,
      );
      if (this.marked.length > 0) {
        out.push(`marked slow by the player at: ${this.marked.map(f1).join(', ')}`);
        out.push('', '## marked seconds, and the two before each');
        out.push(HEAD);
        const seen = new Set<Row>();
        for (const m of this.marked) {
          for (const r of rows) {
            if (r.t >= m - 2 && r.t < m + 1 && !seen.has(r)) {
              seen.add(r);
              out.push(line(r));
            }
          }
        }
      }

      out.push('', '## slowest seconds');
      out.push(HEAD);
      for (const r of [...rows].sort((a, b) => a.fps - b.fps).slice(0, 12)) out.push(line(r));

      out.push('', '## turns (round, turn, aim s, resolve s, weapon, waiting on at the end)');
      let i = 0;
      while (i < rows.length) {
        const first = rows[i];
        if (!first) break;
        let aim = 0;
        let resolve = 0;
        let end = first;
        while (i < rows.length) {
          const r = rows[i];
          if (!r || r.round !== first.round || r.turn !== first.turn) break;
          if (r.phase === 'aim') aim++;
          else if (r.phase === 'resolve') {
            resolve++;
            end = r;
          }
          i++;
        }
        if (aim + resolve > 0) {
          out.push(
            `${first.round},${first.turn},${aim},${resolve},${end.weapon || '-'},${end.holding || '-'}`,
          );
        }
      }
    }

    if (this.stalls.length > 0) {
      out.push('', '## browser stalls (t, kind, ms, detail)');
      for (const x of this.stalls) {
        out.push(`${f1(x.t)},${x.kind},${f1(x.ms)},${x.detail.replace(/[,\n]/g, ' ')}`);
      }
      if (this.stalls.length === MAX_STALLS) out.push('(more not listed)');
    }

    if (this.long.length > 0) {
      out.push(
        '',
        `## frames over ${LONG_FRAME} ms (t, ms, sim ms, step ms, render ms, other js ms, ticks, phase)`,
      );
      for (const l of this.long) {
        out.push(
          `${f1(l.t)},${f1(l.ms)},${f1(l.sim)},${f1(l.step)},${f1(l.render)},${f1(l.other)},${l.ticks},${l.phase || '-'}`,
        );
      }
      if (this.long.length === MAX_LONG) out.push('(more not listed)');
    }

    out.push('', '## every second');
    out.push(HEAD);
    for (const r of rows) out.push(line(r));

    if (this.partNames.length > 0 && rows.some((r) => r.parts !== null)) {
      out.push('', '## sim by part, ms per tick, every second');
      out.push(`t,ticks,${this.partNames.join(',')},rest,slowest tick`);
      for (const r of rows) {
        const ps = r.parts;
        if (!ps || r.ticks === 0) continue;
        const sum = ps.reduce((a, b) => a + b, 0);
        out.push(
          [
            r.t,
            r.ticks,
            ...this.partNames.map((_, k) => f2((ps[k] ?? 0) / r.ticks)),
            // snapshots for the renderer, the online state hash, sending inputs
            f2(Math.max(0, r.simAvg - sum / r.ticks)),
            r.worstTick.replace(/[,\n]/g, ' '),
          ].join(','),
        );
      }
    }
    return out.join('\n') + '\n';
  }
}

const HEAD =
  't,fps,frame avg,frame p95,frame max,ticks,sim avg,sim max,step avg,render avg,render max,other avg,other max,speed %,asked %,' +
  `${GPU_PARTS.map((p) => `gpu ${p}`).join(',')},quality,phase,round,turn,` +
  'particles,projectiles,debris,settle cells,react cells,heap MB,waiting on,net,note';

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
    f1(r.otherAvg),
    f1(r.otherMax),
    f1(r.speed),
    f1(r.asked),
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
    r.heap > 0 ? f1(r.heap) : '',
    r.holding.replace(/[,\n]/g, ' '),
    r.net.replace(/[,\n]/g, ' '),
    (r.marks > 0 ? 'SLOW-NOW ' : '') + `${r.note} ${r.weapon}`.trim().replace(/[,\n]/g, ' '),
  ].join(',');
}

/** The fields of a long-animation-frame entry the log uses (Chromium; absent elsewhere). */
interface LongFrameEntry {
  duration: number;
  startTime: number;
  blockingDuration?: number;
  styleAndLayoutStart?: number;
  scripts?: readonly {
    duration: number;
    invoker?: string;
    sourceFunctionName?: string;
    forcedStyleAndLayoutDuration?: number;
  }[];
}

/** What a browser stall entry says about its cause, in a few words ('' for a plain long task). */
export function stallDetail(entry: unknown): string {
  const e = entry as LongFrameEntry;
  if (!e.scripts) return '';
  const out: string[] = [];
  if (e.blockingDuration !== undefined) out.push(`blocking ${f1(e.blockingDuration)}`);
  let script = 0;
  let top: { duration: number; invoker?: string; sourceFunctionName?: string } | undefined;
  for (const sc of e.scripts) {
    script += sc.duration;
    if (!top || sc.duration > top.duration) top = sc;
  }
  out.push(`script ${f1(script)}`);
  if (e.styleAndLayoutStart !== undefined && e.styleAndLayoutStart > 0) {
    out.push(`style+layout ${f1(e.startTime + e.duration - e.styleAndLayoutStart)}`);
  }
  if (top)
    out.push(`longest ${top.sourceFunctionName || top.invoker || 'script'} ${f1(top.duration)}`);
  return out.join(' ');
}

/** File name for a recording made at `date`: `mudders-perf-20261117-0612.txt`. */
export function perfFileName(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `mudders-perf-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.txt`;
}
