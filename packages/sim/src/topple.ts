import { FP, cosDeci, isqrt, sinDeci } from './fixed';
import type { EffectSink } from './behaviours';
import type { Grid } from './grid';
import type { Hasher } from './hash';
import { KEEP, SETTLE_FLOW, SETTLE_GAS, SETTLE_STATIC, type MaterialTable } from './materials';

/** Trees falling at once; more break the old way (into pieces). */
export const MAX_TOPPLES = 8;
/** Deci-degrees a toppling tree starts tipped. */
const START = 20;
/** Spin a blast gives a tree as it snaps (1/256 deci-degree per tick): it lurches over at once. */
const KICK = 1536;
/** Steady part of the angular pull, in 1/256 deci-degree per tick². */
const PULL = 32;
/** Gravity's part, × sin(angle) / length: a tall tree goes over slower than a short one. */
const SWING = 40_000;
/** It keeps rolling down a slope this far past flat, then lies where it is. */
const MAX_ANGLE = 1250;
/** Cells this close to the pivot never collide (they turn in place over the stump). */
const HUB = 3;
/** Rows of the trunk left standing as a stump. */
export const STUMP = 2;

/** One tree going over: its cells in a local box, turning about the top of its stump. */
interface Body {
  /** Group slot its cells carry while they fall. */
  slot: number;
  w: number;
  h: number;
  /** Local box origin in the grid (top-left cell). */
  ox: number;
  oy: number;
  /** Material per local cell, 0 = none. */
  src: Uint8Array;
  /** Pivot in FP grid coordinates. */
  px: number;
  py: number;
  /** +1 falls right, -1 left. */
  dir: number;
  angle: number;
  /** 1/256 deci-degrees per tick. */
  omega: number;
  /** Length from pivot to the furthest cell, in cells. */
  len: number;
  /** material → what it lies as once landed (KEEP = unchanged). */
  felled: Uint8Array;
  /** Grid cells it fills now and the local cell each came from. */
  occ: Int32Array;
  occSrc: Int32Array;
  n: number;
}

/**
 * Trees that snap and fall over in one piece (§4c). When a `topple` group breaks without being
 * blown to bits, the kernel lifts it and everything resting on it out of the grid, leaves a stump,
 * and turns the rest about the top of the stump, a little further each tick and faster as it
 * goes (a falling pole), away from the blast that broke it or toward the side it leans. Each tick
 * its cells are written back into the grid at the new angle, so blasts and fire still act on them
 * and the renderer draws an ordinary grid. When any far cell would land in something solid, it
 * stops there and the cells become plain terrain: the trunk lies as a log, the leaves slide off.
 * Fixed-point integers and the sin table only.
 */
export class Toppler {
  private readonly bodies: Body[] = [];

  constructor(private readonly mats: MaterialTable) {}

  get any(): boolean {
    return this.bodies.length > 0;
  }

  get room(): boolean {
    return this.bodies.length < MAX_TOPPLES;
  }

  /** Whether group `slot` is a tree in mid-fall (blasts don't strip its crown). */
  falling(slot: number): boolean {
    for (let b = 0; b < this.bodies.length; b++) if (this.bodies[b]!.slot === slot) return true;
    return false;
  }

  reset(): void {
    this.bodies.length = 0;
  }

  /**
   * Start a fall. `cells` lists grid indices to lift (all marked with `slot` by the caller's
   * groups), `pivotX0..pivotX1` the stump's columns and `pivotY` the stump's top row. `blast`
   * shoves it over fast; otherwise it starts from rest (undermined).
   */
  start(
    grid: Grid,
    slot: number,
    cells: Int32Array,
    count: number,
    pivotX0: number,
    pivotX1: number,
    pivotY: number,
    dir: number,
    felled: Uint8Array,
    blast: boolean,
  ): void {
    const W = grid.width;
    let x0 = W;
    let y0 = grid.height;
    let x1 = -1;
    let y1 = -1;
    for (let k = 0; k < count; k++) {
      const i = cells[k]!;
      const x = i % W;
      const y = (i - x) / W;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 < x0) return;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const src = new Uint8Array(w * h);
    for (let k = 0; k < count; k++) {
      const i = cells[k]!;
      const x = i % W;
      const y = (i - x) / W;
      src[(y - y0) * w + (x - x0)] = grid.material[i]!;
      grid.material[i] = 0;
      grid.coating[i] = 0;
      grid.cellState[i] = 0;
      grid.group[i] = 0;
    }
    const px = Math.trunc(((pivotX0 + pivotX1 + 1) * FP) / 2);
    const py = pivotY * FP;
    // furthest corner from the pivot
    const pcx = (pivotX0 + pivotX1 + 1) >> 1;
    const ax = Math.max(pcx - x0, x1 + 1 - pcx);
    const ay = Math.max(pivotY - y0, y1 + 1 - pivotY);
    const far = ax * ax + ay * ay;
    const len = Math.max(4, isqrt(far) + 1);
    const cap = w * h;
    this.bodies.push({
      slot,
      w,
      h,
      ox: x0,
      oy: y0,
      src,
      px,
      py,
      dir: dir < 0 ? -1 : 1,
      angle: START,
      omega: blast ? KICK : 0,
      len,
      felled,
      occ: new Int32Array(cap),
      occSrc: new Int32Array(cap),
      n: 0,
    });
    grid.markDirty(x0, y0, x1, y1);
    this.place(grid, this.bodies[this.bodies.length - 1]!, START, true);
  }

  /** One tick for every falling tree. */
  step(grid: Grid, fx: EffectSink): void {
    for (let b = 0; b < this.bodies.length; b++) {
      const body = this.bodies[b]!;
      this.lift(grid, body);
      body.omega += PULL + Math.trunc((sinDeci(body.angle) * Math.trunc(SWING / body.len)) / FP);
      const next = Math.min(MAX_ANGLE, body.angle + (body.omega >> 8));
      if (next < MAX_ANGLE && this.place(grid, body, next, false)) {
        body.angle = next;
        continue;
      }
      // it hit something (or lies as far over as it goes): settle where it last fit
      const at = next >= MAX_ANGLE && this.place(grid, body, next, false) ? next : body.angle;
      if (at !== next) this.place(grid, body, at, true);
      this.land(grid, body, fx);
      this.bodies.splice(b, 1);
      b--;
    }
  }

  /** Take the body's cells back out of the grid; cells something destroyed are gone for good. */
  private lift(grid: Grid, body: Body): void {
    for (let k = 0; k < body.n; k++) {
      const i = body.occ[k]!;
      const s = body.occSrc[k]!;
      if (grid.group[i] !== body.slot || grid.material[i] !== body.src[s]) {
        // burnt, carved or knocked loose while falling: that cell no longer belongs to the tree
        body.src[s] = 0;
        if (grid.group[i] === body.slot) grid.group[i] = 0;
        continue;
      }
      grid.material[i] = 0;
      grid.cellState[i] = 0;
      grid.group[i] = 0;
    }
    if (body.n > 0) this.dirtyBox(grid, body);
    body.n = 0;
  }

  /**
   * Write the body at `angle`. Unless `force`, fail (writing nothing) if a cell away from the
   * hub would land in something solid. Cells over liquid, other trees' leaves, loose dirt in the air
   * or the map edge are left out.
   */
  private place(grid: Grid, body: Body, angle: number, force: boolean): boolean {
    const W = grid.width;
    const H = grid.height;
    const sin = sinDeci(angle);
    const cos = cosDeci(angle);
    const R = body.len + 1;
    const pcx = Math.trunc(body.px / FP);
    const pcy = Math.trunc(body.py / FP);
    const tx0 = Math.max(0, pcx - R);
    const tx1 = Math.min(W - 1, pcx + R);
    const ty0 = Math.max(0, pcy - R);
    const ty1 = Math.min(H - 1, pcy + R);
    const mat = grid.material;
    const settle = this.mats.settle;
    const dens = this.mats.density;
    const half = FP >> 1;
    for (let pass = force ? 1 : 0; pass < 2; pass++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        const ry = ty * FP + half - body.py;
        for (let tx = tx0, i = ty * W + tx0; tx <= tx1; tx++, i++) {
          // mirror for a fall to the left, turn back to upright, mirror back
          const mx = (tx * FP + half - body.px) * body.dir;
          const sx = Math.trunc((mx * cos + ry * sin) / FP) * body.dir;
          const sy = Math.trunc((ry * cos - mx * sin) / FP);
          const lx = Math.floor((body.px + sx) / FP) - body.ox;
          const ly = Math.floor((body.py + sy) / FP) - body.oy;
          if (lx < 0 || ly < 0 || lx >= body.w || ly >= body.h) continue;
          const s = ly * body.w + lx;
          const m = body.src[s]!;
          if (m === 0) continue;
          const here = mat[i]!;
          const open = here === 0 || settle[here] === SETTLE_GAS;
          if (pass === 0) {
            // its own leaves crush against the ground instead of holding the tree up
            if (open || grid.group[i] === body.slot || dens[m]! <= LIGHT) continue;
            const ddx = tx - pcx;
            const ddy = ty - pcy;
            if (ddx * ddx + ddy * ddy <= HUB * HUB) continue;
            // liquids and light leaves give way; anything else stops the fall
            if (settle[here] === SETTLE_FLOW || dens[here]! <= LIGHT) continue;
            // loose stuff in the air (thrown dirt, or what lay on the tree) is swept aside
            if (settle[here] !== SETTLE_STATIC && ty + 1 < H) {
              const below = mat[i + W]!;
              if (below === 0 || settle[below] === SETTLE_GAS) continue;
            }
            return false;
          }
          if (!open) continue;
          mat[i] = m;
          grid.cellState[i] = 0;
          grid.group[i] = body.slot;
          grid.groupMat[i] = m;
          body.occ[body.n] = i;
          body.occSrc[body.n] = s;
          body.n++;
        }
      }
    }
    this.dirtyBox(grid, body);
    return true;
  }

  private dirtyBox(grid: Grid, body: Body): void {
    const pcx = Math.trunc(body.px / FP);
    const pcy = Math.trunc(body.py / FP);
    const R = body.len + 1;
    grid.markDirty(
      Math.max(0, pcx - R),
      Math.max(0, pcy - R),
      Math.min(grid.width - 1, pcx + R),
      Math.min(grid.height - 1, pcy + R),
    );
  }

  /** It came down: its cells are plain terrain now. */
  private land(grid: Grid, body: Body, fx: EffectSink): void {
    let sx = 0;
    let sy = 0;
    const W = grid.width;
    for (let k = 0; k < body.n; k++) {
      const i = body.occ[k]!;
      if (grid.group[i] !== body.slot) continue;
      grid.group[i] = 0;
      const f = body.felled[grid.material[i]!]!;
      if (f !== KEEP) grid.material[i] = f;
      const x = i % W;
      sx += x;
      sy += (i - x) / W;
    }
    // cells an op shoved elsewhere while it fell still carry the slot: let them go too
    const group = grid.group;
    for (let i = 0; i < group.length; i++) {
      if (group[i] !== body.slot) continue;
      group[i] = 0;
      const x = i % W;
      const y = (i - x) / W;
      grid.markDirty(x, y, x, y);
    }
    this.dirtyBox(grid, body);
    if (body.n > 0)
      fx.emit('treeFall', Math.trunc(sx / body.n), Math.trunc(sy / body.n), body.len >> 1, {
        cells: body.n,
        dir: body.dir,
        len: body.len,
      });
    body.n = 0;
  }

  hash(h: Hasher): void {
    h.num(this.bodies.length);
    for (const b of this.bodies) h.num(b.slot).num(b.angle).num(b.omega).num(b.dir).num(b.n);
  }
}

/** Materials this light (leaves) don't stop a falling tree. */
const LIGHT = 30;
