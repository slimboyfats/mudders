/**
 * GPU time per part of the frame, for the performance recorder. CPU timers only see the cost of
 * handing work to the GPU; what the GPU then spends on it shows up as a lower fps and nothing
 * else. Where the browser has `EXT_disjoint_timer_query_webgl2`, this times each part.
 *
 * One query runs at a time (the extension allows no nesting): `begin(part)` closes the part
 * before it. Results come back a few frames late and are summed per part until `take()`.
 */

interface TimerExt {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/** Queries waiting for a result past this many are dropped (a GPU that never answers). */
const MAX_PENDING = 64;

export class GpuTimer {
  private readonly ext: TimerExt | null;
  private readonly pool: WebGLQuery[] = [];
  private readonly pendQ: WebGLQuery[] = [];
  private readonly pendPart: number[] = [];
  private readonly sums: number[];
  private frames = 0;
  /** Results that came back since the last `take`. */
  private landed = 0;
  private open = false;
  private on = false;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    parts: number,
  ) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
    this.sums = new Array<number>(parts).fill(0);
  }

  /** Whether this browser can time the GPU at all. */
  get available(): boolean {
    return this.ext !== null;
  }

  /** Start or stop timing; false when the browser can't. */
  enable(on: boolean): boolean {
    if (!this.ext) return false;
    if (!on) this.end();
    this.on = on;
    this.sums.fill(0);
    this.frames = this.landed = 0;
    return true;
  }

  /** The GPU work from here on belongs to `part`, until the next `begin`, `end` or `frameEnd`. */
  begin(part: number): void {
    if (!this.on || !this.ext) return;
    this.end();
    const q = this.pool.pop() ?? this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.pendQ.push(q);
    this.pendPart.push(part);
    this.open = true;
  }

  end(): void {
    if (!this.open || !this.ext) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.open = false;
  }

  /** Close the frame and collect the results that have come in. */
  frameEnd(): void {
    if (!this.on || !this.ext) return;
    this.end();
    this.frames++;
    const gl = this.gl;
    // a disjoint (the GPU was interrupted) spoils every result read this time
    const bad = gl.getParameter(this.ext.GPU_DISJOINT_EXT) === true;
    let done = 0;
    while (done < this.pendQ.length) {
      const q = this.pendQ[done]!;
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) !== true) {
        if (this.pendQ.length - done <= MAX_PENDING) break;
      } else if (!bad) {
        this.landed++;
        const part = this.pendPart[done]!;
        this.sums[part] =
          this.sums[part]! + (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6;
      }
      this.pool.push(q);
      done++;
    }
    if (done > 0) {
      this.pendQ.splice(0, done);
      this.pendPart.splice(0, done);
    }
  }

  /**
   * GPU ms per frame for each part since the last call. Null when not timing, and when no result
   * came back at all (some browsers offer the timer and never answer).
   */
  take(): number[] | null {
    if (!this.on) return null;
    const n = Math.max(1, this.frames);
    const out = this.landed > 0 ? this.sums.map((s) => s / n) : null;
    this.sums.fill(0);
    this.frames = this.landed = 0;
    return out;
  }

  dispose(): void {
    this.end();
    for (const q of this.pool) this.gl.deleteQuery(q);
    for (const q of this.pendQ) this.gl.deleteQuery(q);
    this.pool.length = this.pendQ.length = this.pendPart.length = 0;
  }
}
