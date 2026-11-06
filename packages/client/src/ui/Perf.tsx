/**
 * Frame-time overlay (Settings → Show performance) for checking the §9 budgets on real devices:
 * sim ≤ 2 ms average and ≤ 6 ms worst per tick, renderer ≤ 6 ms, 60 fps. Render time is CPU time
 * to build and submit the frame; GPU work shows up as a lower fps instead.
 */

export interface PerfStats {
  fps: number;
  simAvg: number;
  simWorst: number;
  renderAvg: number;
  renderWorst: number;
  worstFrame: number;
}

/** Collects per-frame timings and reports once a second. */
export class PerfMeter {
  private start = -1;
  private frames = 0;
  private ticks = 0;
  private sim = 0;
  private simWorst = 0;
  private render = 0;
  private renderWorst = 0;
  private worstFrame = 0;

  /** Record one frame; returns the stats of the last second when one has passed. */
  frame(now: number, dt: number, ticks: number, simMs: number, renderMs: number): PerfStats | null {
    if (this.start < 0) this.start = now;
    this.frames++;
    this.ticks += ticks;
    this.sim += simMs;
    if (ticks > 0) this.simWorst = Math.max(this.simWorst, simMs / ticks);
    this.render += renderMs;
    this.renderWorst = Math.max(this.renderWorst, renderMs);
    this.worstFrame = Math.max(this.worstFrame, dt);
    const span = now - this.start;
    if (span < 1000) return null;
    const out: PerfStats = {
      fps: (this.frames * 1000) / span,
      simAvg: this.ticks > 0 ? this.sim / this.ticks : 0,
      simWorst: this.simWorst,
      renderAvg: this.render / this.frames,
      renderWorst: this.renderWorst,
      worstFrame: this.worstFrame,
    };
    this.start = now;
    this.frames = this.ticks = 0;
    this.sim = this.simWorst = this.render = this.renderWorst = this.worstFrame = 0;
    return out;
  }
}

const f = (v: number) => v.toFixed(1);

/** Over budget is marked with a word, not only a colour (§8 accessibility). */
function Row({ label, value, budget }: { label: string; value: string; budget: boolean }) {
  return (
    <div className={budget ? 'perf-row' : 'perf-row over'}>
      {label} {value}
      {budget ? '' : ' OVER'}
    </div>
  );
}

export function PerfOverlay({ stats: s }: { stats: PerfStats }) {
  return (
    <div className="perf" data-testid="perf" aria-label="Performance">
      <Row label="fps" value={f(s.fps)} budget={s.fps >= 55} />
      <Row
        label="sim ms/tick"
        value={`${f(s.simAvg)} avg · ${f(s.simWorst)} worst`}
        budget={s.simAvg <= 2 && s.simWorst <= 6}
      />
      <Row
        label="render ms"
        value={`${f(s.renderAvg)} avg · ${f(s.renderWorst)} worst`}
        budget={s.renderAvg <= 6}
      />
      <Row label="longest frame ms" value={f(s.worstFrame)} budget={s.worstFrame <= 34} />
    </div>
  );
}
