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

export class GpuTimer implements GpuClock {
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

  /** A timer query runs all the time and costs nothing to notice. */
  burst(): void {}

  dispose(): void {
    this.end();
    for (const q of this.pool) this.gl.deleteQuery(q);
    for (const q of this.pendQ) this.gl.deleteQuery(q);
    this.pool.length = this.pendQ.length = this.pendPart.length = 0;
  }
}

/** What the renderer needs from either way of timing the GPU. */
export interface GpuClock {
  enable(on: boolean): boolean;
  begin(part: number): void;
  end(): void;
  frameEnd(): void;
  take(): number[] | null;
  /** Measure the next frames now, where measuring is not continuous (see {@link GpuSampler}). */
  burst(): void;
  dispose(): void;
}

/** Times each part is measured in one {@link GpuSampler.burst}. */
export const BURST_ROUNDS = 6;

/**
 * GPU time per part where the browser has no timer query (Chrome on Android): one part of a
 * frame is bracketed with `gl.finish()`, which waits until the GPU has really done the work, and
 * the wall time between the two is that part's cost.
 *
 * The waits are not free. On a phone the first one also waits for the frame before, about 40 ms,
 * and measuring one frame in six all the time gave the game a hitch every 0.3 s: the recorder
 * made the stutter it was there to find. So nothing is measured until `burst()` asks: then every
 * frame measures one part, each part in turn, for `BURST_ROUNDS` rounds (under a second), and
 * the game is left alone again. The recorder asks when the player presses "Slow now", which is
 * when the answer matters and a second of stutter costs least.
 */
export class GpuSampler implements GpuClock {
  private readonly sums: number[];
  private readonly counts: number[];
  private readonly last: number[];
  private on = false;
  /** Frames still to measure in the running burst. */
  private left = 0;
  /** The part this frame measures, or -1. */
  private target = -1;
  private next = 0;
  private open = false;
  private hit = false;
  private t0 = 0;
  private acc = 0;
  private seen = false;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly parts: number,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.sums = new Array<number>(parts).fill(0);
    this.counts = new Array<number>(parts).fill(0);
    this.last = new Array<number>(parts).fill(0);
  }

  enable(on: boolean): boolean {
    this.end();
    this.on = on;
    this.sums.fill(0);
    this.counts.fill(0);
    this.last.fill(0);
    this.left = this.next = this.acc = 0;
    this.target = -1;
    this.hit = this.seen = false;
    return true;
  }

  begin(part: number): void {
    if (!this.on) return;
    this.end();
    if (part !== this.target) return;
    this.gl.finish(); // what came before is not this part's
    this.t0 = this.now();
    this.open = true;
  }

  end(): void {
    if (!this.open) return;
    this.gl.finish();
    this.acc += this.now() - this.t0;
    this.open = false;
    this.hit = true;
  }

  frameEnd(): void {
    if (!this.on) return;
    this.end();
    if (this.hit) {
      const p = this.target;
      this.sums[p] = this.sums[p]! + this.acc;
      this.counts[p] = this.counts[p]! + 1;
      this.seen = true;
    }
    this.acc = 0;
    this.hit = false;
    if (this.left > 0) {
      this.left--;
      this.target = this.next;
      this.next = (this.next + 1) % this.parts;
    } else this.target = -1;
  }

  burst(): void {
    if (this.on) this.left = this.parts * BURST_ROUNDS;
  }

  /**
   * Each part's cost, ms a frame, when any was measured since the last call (a part not measured
   * since keeps its last); null otherwise, so the log shows which seconds were measured.
   */
  take(): number[] | null {
    if (!this.on || !this.seen) return null;
    this.seen = false;
    for (let i = 0; i < this.parts; i++) {
      if (this.counts[i]! > 0) this.last[i] = this.sums[i]! / this.counts[i]!;
    }
    this.sums.fill(0);
    this.counts.fill(0);
    return this.last.slice();
  }

  dispose(): void {
    this.open = false;
  }
}
