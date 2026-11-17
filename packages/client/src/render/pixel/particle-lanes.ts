/**
 * Slot bookkeeping for the GPU particle engine: which buffer slots may hold a live particle.
 *
 * The GPU passes run over whole slot ranges, so a range must be as short as it can be. One ring
 * for everything is not: a snow flake lives 1400 ticks and a spark 40, and a ring's live window
 * reaches from its oldest living particle to its newest, so every spark that died since that flake
 * was born stays in the window and is updated and drawn (as nothing) each frame. Measured in a
 * snow match: 68 000 slots worked on for 8 000 living particles.
 *
 * So the slots are split into lanes by lifetime, each lane a ring of its own. Particles in a lane
 * die in about the order they were born, and its window stays close to what is alive.
 */

/** A particle goes in the first lane whose bound its lifetime (ticks) is under; the last lane takes the rest. */
export const LANE_BOUNDS = [64, 256, 1024] as const;
/**
 * After the lifetime lanes comes one more, for the weather alone. Rain and snow fall all match
 * long, and in a shared lane a big blast's smoke filled it and pushed the drops out a moment
 * after they were born: the rain stopped in mid-air and stood as a fringe along the top of the
 * map until the smoke had gone.
 */
const WEATHER = LANE_BOUNDS.length + 1;
const LANES = WEATHER + 1;
/** Each lane's share of the engine's capacity, in eighths (they add up to more than one whole). */
const LANE_EIGHTHS = [4, 4, 2, 1, 1] as const;

export class ParticleLanes {
  /** Slots in all lanes together (the size of the GPU buffers). */
  readonly slots: number;
  /** First slot and size of each lane. */
  private readonly base = new Int32Array(LANES);
  private readonly size = new Int32Array(LANES);
  /** Next slot to fill, relative to the lane. */
  private readonly head = new Int32Array(LANES);
  /** The live window of a lane is its ring range [tail, tail + count): older slots have all died. */
  private readonly tail = new Int32Array(LANES);
  private readonly count = new Int32Array(LANES);
  /** Slots written since the last upload: a ring range [pendStart, pendStart + pendCount). */
  private readonly pendStart = new Int32Array(LANES);
  private readonly pendCount = new Int32Array(LANES);
  /** Tick each slot dies at. */
  private readonly death: Float32Array;
  /** The tick by which every particle so far has died. */
  private lastDeath = 0;
  /** Slots in all windows together. */
  private total = 0;
  private readonly segs: number[] = [];

  constructor(cap: number) {
    let at = 0;
    for (let l = 0; l < LANES; l++) {
      this.base[l] = at;
      this.size[l] = Math.max(1, (cap * LANE_EIGHTHS[l]!) >> 3);
      at += this.size[l]!;
    }
    this.slots = at;
    this.death = new Float32Array(at);
  }

  /** Slots the GPU passes touch. */
  get n(): number {
    return this.total;
  }

  /**
   * Take the slot for a particle born at `tick` that lives `life` ticks; a full lane overwrites
   * its oldest. `weather` (rain, snow) goes in the lane kept for it.
   */
  put(tick: number, life: number, weather = false): number {
    let l = 0;
    if (weather) l = WEATHER;
    else while (l < LANE_BOUNDS.length && life >= LANE_BOUNDS[l]!) l++;
    const size = this.size[l]!;
    const h = this.head[l]!;
    const next = h + 1 === size ? 0 : h + 1;
    this.head[l] = next;
    if (this.count[l] === size) this.tail[l] = next;
    else {
      this.count[l]!++;
      this.total++;
    }
    if (this.pendCount[l] === 0) this.pendStart[l] = h;
    if (this.pendCount[l]! < size) this.pendCount[l]!++;
    const slot = this.base[l]! + h;
    this.death[slot] = tick + life;
    if (tick + life > this.lastDeath) this.lastDeath = tick + life;
    return slot;
  }

  /** Drop the dead front of each window. False when nothing at all is left (and the rings rewind). */
  step(tick: number): boolean {
    if (tick >= this.lastDeath) {
      this.clear(tick);
      return false;
    }
    const d = this.death;
    for (let l = 0; l < LANES; l++) {
      const base = this.base[l]!;
      const size = this.size[l]!;
      let tail = this.tail[l]!;
      let count = this.count[l]!;
      while (count > 0 && d[base + tail]! <= tick) {
        tail = tail + 1 === size ? 0 : tail + 1;
        count--;
        this.total--;
      }
      this.tail[l] = tail;
      this.count[l] = count;
    }
    return true;
  }

  /**
   * The live windows as [first slot, length] pairs, the weather first and then the longest-lived
   * lane first: drawn in this order, weather and smoke lie behind sparks and flame. Valid until
   * the next call.
   */
  segments(): readonly number[] {
    const out = this.segs;
    out.length = 0;
    for (let l = LANES - 1; l >= 0; l--) {
      this.ring(out, l, this.tail[l]!, this.count[l]!);
    }
    return out;
  }

  /** The slots written since the last call, as [first slot, length] pairs. Valid until the next call. */
  takePending(): readonly number[] {
    const out = this.segs;
    out.length = 0;
    for (let l = 0; l < LANES; l++) {
      const n = this.pendCount[l]!;
      if (n === 0) continue;
      if (n >= this.size[l]!) out.push(this.base[l]!, this.size[l]!);
      else this.ring(out, l, this.pendStart[l]!, n);
      this.pendCount[l] = 0;
    }
    return out;
  }

  private ring(out: number[], l: number, start: number, n: number): void {
    if (n === 0) return;
    const base = this.base[l]!;
    const size = this.size[l]!;
    if (start + n <= size) {
      out.push(base + start, n);
    } else {
      out.push(base + start, size - start, base, start + n - size);
    }
  }

  clear(tick: number): void {
    this.head.fill(0);
    this.tail.fill(0);
    this.count.fill(0);
    this.pendCount.fill(0);
    this.total = 0;
    this.lastDeath = tick;
  }
}
