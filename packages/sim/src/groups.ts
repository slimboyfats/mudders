import { DAMAGE_TYPES, type GenProp, type PropManifest } from '@mudders/shared';
import type { EffectSink } from './behaviours';
import type { Grid } from './grid';
import type { Hasher } from './hash';
import { KEEP, NUM_DAMAGE_TYPES, STRENGTH_ONE, type MaterialTable } from './materials';
import type { Prng } from './prng';

/** Group slots per map; slot 0 means "no group". */
export const MAX_GROUPS = 255;

/** A prop's group compiled to lookup tables. */
interface GroupDef {
  integrity: number;
  /** ×256 per damage type. */
  resist: Uint16Array;
  /** material → broken material (KEEP = unchanged). */
  breakInto: Uint8Array;
  /** material → cracked variant (KEEP = none). */
  crack: Uint8Array;
}

interface CompiledProp {
  id: string;
  width: number;
  height: number;
  /** Cell per shape position: material (0 = leave alone) and group index within the prop + 1. */
  mat: Uint8Array;
  grp: Uint8Array;
  groups: GroupDef[];
  /** For each group, the indices (within the prop) of the groups it rests on. */
  supports: number[][];
  maxSlope: number;
  clearance: number;
}

/** Order-free hash for which cells crack first. */
function h(i: number): number {
  let x = Math.imul(i ^ 0x2c1b3c6d, 0x297a2d39);
  x ^= x >>> 15;
  return Math.imul(x, 0x85ebca6b) >>> 24;
}

/**
 * Structural integrity for placed props (§4c). Props are stamped into the grid as ordinary cells
 * plus a per-cell group slot (`grid.group`) and the material each group cell should hold
 * (`grid.groupMat`). While a group is intact:
 *
 * - settle ignores its cells (a canopy of sliding leaves stays up);
 * - `World.launch` refuses them, and after every terrain-op call `guard` finds group cells the op
 *   removed or changed, charges them to the group's integrity (scaled by its resistance to the
 *   op's damage type) and writes them back, so the prop absorbs hits instead of losing pixels;
 * - as integrity drops, a growing share of cells swap to their `crack` variant (intact → cracked →
 *   crumbling) and a `creak` effect fires;
 * - at 0 the group breaks: every cell converts per `breakInto` and comes loose, groups resting on
 *   it break too, and the rubble pours down under normal settle rules (`collapse` effect).
 *
 * Cells consumed by reactions (fire) or converted into an active material (lava, napalm) leave
 * the group instead; a group that has lost half its cells, or whose base has nothing under it,
 * collapses. Everything here is plain typed arrays and is hashed with the world.
 */
export class Groups {
  count = 0;
  readonly integrity = new Int32Array(MAX_GROUPS + 1);
  readonly maxIntegrity = new Int32Array(MAX_GROUPS + 1);
  readonly cells = new Int32Array(MAX_GROUPS + 1);
  readonly origCells = new Int32Array(MAX_GROUPS + 1);
  readonly minX = new Int32Array(MAX_GROUPS + 1);
  readonly maxX = new Int32Array(MAX_GROUPS + 1);
  readonly minY = new Int32Array(MAX_GROUPS + 1);
  readonly maxY = new Int32Array(MAX_GROUPS + 1);
  readonly stage = new Uint8Array(MAX_GROUPS + 1);
  readonly broken = new Uint8Array(MAX_GROUPS + 1);
  /** Slots each group rests on, 4 per slot (0 = none). */
  readonly support = new Uint8Array((MAX_GROUPS + 1) * 4);
  /** Cells `launch` refused since the last guard. */
  readonly pending = new Int32Array(MAX_GROUPS + 1);
  /** Rows a dropping group has fallen so far. */
  readonly fallen = new Int32Array(MAX_GROUPS + 1);
  private readonly def: GroupDef[] = [];
  private readonly props: CompiledProp[] = [];
  private readonly propIndex: Record<string, number> = {};

  constructor(
    props: readonly PropManifest[],
    private readonly mats: MaterialTable,
  ) {
    for (const p of props) {
      this.propIndex[p.id] = this.props.length;
      this.props.push(this.compile(p));
    }
  }

  get any(): boolean {
    return this.count > 0;
  }

  hasProp(id: string): boolean {
    return this.propIndex[id] !== undefined;
  }

  reset(): void {
    this.count = 0;
    this.def.length = 0;
    this.pending.fill(0);
    this.support.fill(0);
    this.broken.fill(0);
    this.stage.fill(0);
    this.fallen.fill(0);
  }

  private compile(p: PropManifest): CompiledProp {
    const mats = this.mats;
    const height = p.shape.length;
    let width = 0;
    for (const row of p.shape) width = Math.max(width, row.length);
    const groupOfRole: Record<string, number> = {};
    p.groups.forEach((g, k) => {
      for (const r of g.roles) groupOfRole[r] = k + 1;
    });
    const mat = new Uint8Array(width * height);
    const grp = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const row = p.shape[y]!;
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]!;
        if (ch === ' ') continue;
        const role = p.legend[ch];
        if (role === undefined) throw new Error(`${p.id}: shape uses '${ch}' with no legend entry`);
        const mid = p.materials[role];
        if (mid === undefined) throw new Error(`${p.id}: role ${role} has no material`);
        mat[y * width + x] = mats.cellOf(mid);
        grp[y * width + x] = groupOfRole[role] ?? 0;
      }
    }
    const ref = (id: string) => (id === 'air' ? 0 : mats.cellOf(id));
    const groups: GroupDef[] = p.groups.map((g) => {
      const resist = new Uint16Array(NUM_DAMAGE_TYPES).fill(STRENGTH_ONE);
      DAMAGE_TYPES.forEach((t, k) => {
        const v = g.resistance[t];
        if (v !== undefined) resist[k] = Math.round(v * 256);
      });
      const breakInto = new Uint8Array(256).fill(KEEP);
      for (const [from, to] of Object.entries(g.breakInto)) breakInto[ref(from)] = ref(to);
      const crack = new Uint8Array(256).fill(KEEP);
      for (const [from, to] of Object.entries(g.crack)) crack[ref(from)] = ref(to);
      return { integrity: g.integrity, resist, breakInto, crack };
    });
    const names = p.groups.map((g) => g.name);
    const supports = p.groups.map((g) =>
      g.supports.map((n) => {
        const k = names.indexOf(n);
        if (k < 0) throw new Error(`${p.id}: group ${g.name} rests on unknown group ${n}`);
        return k;
      }),
    );
    return {
      id: p.id,
      width,
      height,
      mat,
      grp,
      groups,
      supports,
      maxSlope: p.placement.maxSlope,
      clearance: p.placement.clearance,
    };
  }

  // ── placement ─────────────────────────────────────────────────────────────────────────────

  /**
   * Scatter a generator's props (§4c) over the terrain, away from tank spawns and each other.
   * Deterministic from the match RNG.
   */
  place(grid: Grid, rng: Prng, list: readonly GenProp[], spawns: readonly number[]): void {
    const taken: number[] = [];
    for (const s of spawns) taken.push(s - 12, s + 12);
    for (const entry of list) {
      const k = this.propIndex[entry.prop];
      if (k === undefined) throw new Error(`unknown prop ${entry.prop}`);
      const p = this.props[k]!;
      const scale = grid.width / 1000;
      const lo = Math.round(entry.count[0] * scale);
      const hi = Math.max(lo, Math.round(entry.count[1] * scale));
      const n = rng.range(lo, hi);
      let prev = -1;
      for (let c = 0; c < n; c++) {
        for (let attempt = 0; attempt < 24; attempt++) {
          const x =
            entry.cluster && prev >= 0 && attempt < 12
              ? prev + (rng.chance(1, 2) ? 1 : -1) * (p.width + rng.range(2, 10))
              : rng.range(4, grid.width - p.width - 4);
          if (x < 4 || x + p.width > grid.width - 4) continue;
          if (!this.fits(grid, p, x, taken)) continue;
          this.stamp(grid, p, x);
          taken.push(x - 2, x + p.width + 2);
          prev = x;
          break;
        }
      }
    }
  }

  /** Stamp one prop with its left edge at column x (scenario showcases). */
  placeAt(grid: Grid, id: string, x: number): void {
    const k = this.propIndex[id];
    if (k === undefined) throw new Error(`unknown prop ${id}`);
    const p = this.props[k]!;
    this.stamp(grid, p, Math.max(0, Math.min(grid.width - p.width, x - (p.width >> 1))));
  }

  private fits(grid: Grid, p: CompiledProp, x: number, taken: readonly number[]): boolean {
    for (let i = 0; i < taken.length; i += 2) {
      const a = taken[i]! - p.clearance;
      const b = taken[i + 1]! + p.clearance;
      if (x + p.width > a && x < b) return false;
    }
    let top = grid.height;
    let bottom = 0;
    for (let c = x; c < x + p.width; c++) {
      const s = grid.surfaceY(c);
      if (s < top) top = s;
      if (s > bottom) bottom = s;
    }
    return bottom - top <= p.maxSlope && top - p.height > 8 && bottom < grid.height - 4;
  }

  private stamp(grid: Grid, p: CompiledProp, x0: number): void {
    const W = grid.width;
    const slot0 = this.count;
    if (slot0 + p.groups.length > MAX_GROUPS) return;
    // the base row sits at the footprint's median ground height: columns lower than that get a
    // foundation of whatever tops them, higher ones are cut back, so the prop sits level
    const heights: number[] = [];
    for (let c = x0; c < x0 + p.width; c++) heights.push(grid.surfaceY(c));
    heights.sort((a, b) => a - b);
    const base = heights[heights.length >> 1]!;
    for (let c = x0; c < x0 + p.width; c++) {
      const s = grid.surfaceY(c);
      if (s < base) {
        for (let y = s; y < base; y++) grid.clearCell(y * W + c);
        continue;
      }
      const fill = s < grid.height ? grid.material[s * W + c]! : 0;
      for (let y = base; y < s; y++) grid.material[y * W + c] = fill;
    }
    p.groups.forEach((g, k) => {
      const slot = slot0 + k + 1;
      this.def[slot] = g;
      this.integrity[slot] = g.integrity;
      this.maxIntegrity[slot] = g.integrity;
      this.cells[slot] = 0;
      this.minX[slot] = W;
      this.maxX[slot] = -1;
      this.minY[slot] = grid.height;
      this.maxY[slot] = -1;
      this.stage[slot] = 0;
      this.broken[slot] = 0;
      this.pending[slot] = 0;
      this.fallen[slot] = 0;
      const sup = p.supports[k]!;
      for (let s = 0; s < 4; s++)
        this.support[slot * 4 + s] = s < sup.length ? slot0 + sup[s]! + 1 : 0;
    });
    this.count = slot0 + p.groups.length;
    const top = base - p.height;
    for (let y = 0; y < p.height; y++) {
      const gy = top + y;
      if (gy < 0) continue;
      for (let x = 0; x < p.width; x++) {
        const m = p.mat[y * p.width + x]!;
        if (m === 0) continue;
        const gx = x0 + x;
        const i = gy * W + gx;
        grid.material[i] = m;
        grid.coating[i] = 0;
        grid.cellState[i] = 0;
        const gk = p.grp[y * p.width + x]!;
        if (gk === 0) {
          grid.group[i] = 0;
          continue;
        }
        const slot = slot0 + gk;
        grid.group[i] = slot;
        grid.groupMat[i] = m;
        this.cells[slot] = this.cells[slot]! + 1;
        if (gx < this.minX[slot]!) this.minX[slot] = gx;
        if (gx > this.maxX[slot]!) this.maxX[slot] = gx;
        if (gy < this.minY[slot]!) this.minY[slot] = gy;
        if (gy > this.maxY[slot]!) this.maxY[slot] = gy;
      }
    }
    for (let k = 1; k <= p.groups.length; k++) this.origCells[slot0 + k] = this.cells[slot0 + k]!;
    grid.markDirty(x0, Math.max(0, top), x0 + p.width - 1, grid.height - 1);
  }

  // ── damage ────────────────────────────────────────────────────────────────────────────────

  /** `launch` refused a group cell: charge it at the next guard. */
  refuse(slot: number): void {
    this.pending[slot] = this.pending[slot]! + 1;
  }

  /**
   * After a terrain-op call: charge and undo whatever it did to intact group cells inside the
   * area it marked dirty. `damageType` is the op's damage type index.
   */
  guard(grid: Grid, damageType: number, fx: EffectSink): void {
    const x0 = grid.watchMinX;
    const x1 = grid.watchMaxX;
    const y0 = grid.watchMinY;
    const y1 = grid.watchMaxY;
    grid.clearWatch();
    const W = grid.width;
    const mat = grid.material;
    const group = grid.group;
    const want = grid.groupMat;
    const act = this.mats.active;
    for (let g = 1; g <= this.count; g++) {
      if (this.broken[g] !== 0) continue;
      let hits = this.pending[g]!;
      this.pending[g] = 0;
      const gx0 = Math.max(x0, this.minX[g]!);
      const gx1 = Math.min(x1, this.maxX[g]!);
      const gy0 = Math.max(y0, this.minY[g]!);
      const gy1 = Math.min(y1, this.maxY[g]!);
      let changed = 0;
      if (gx0 <= gx1 && gy0 <= gy1) {
        for (let y = gy0; y <= gy1; y++) {
          for (let x = gx0, i = y * W + gx0; x <= gx1; x++, i++) {
            if (group[i] !== g || mat[i] === want[i]) continue;
            const m = mat[i]!;
            if (m !== 0 && act[m] !== 0) {
              // melted / set alight: the cell is consumed rather than absorbed
              grid.leaveGroup(i);
              continue;
            }
            changed++;
          }
        }
      }
      hits += changed;
      if (hits === 0) continue;
      const dmg = Math.max(
        1,
        Math.trunc((hits * STRENGTH_ONE) / Math.max(13, this.def[g]!.resist[damageType]!)),
      );
      this.integrity[g] = this.integrity[g]! - dmg;
      if (this.integrity[g]! <= 0) {
        this.break(grid, g, fx);
        continue;
      }
      if (changed > 0) {
        for (let y = gy0; y <= gy1; y++) {
          for (let x = gx0, i = y * W + gx0; x <= gx1; x++, i++) {
            if (group[i] !== g || mat[i] === want[i]) continue;
            mat[i] = want[i]!;
            grid.cellState[i] = 0;
            grid.fallVel[i] = 0;
          }
        }
        grid.addRenderRect(gx0, gy0, gx1 - gx0 + 1, gy1 - gy0 + 1);
      }
      this.crack(grid, g, fx);
    }
    this.absorbLosses(grid, fx);
  }

  /** Advance the crack stage when integrity crosses ⅔ and ⅓. */
  private crack(grid: Grid, g: number, fx: EffectSink): void {
    const max = this.maxIntegrity[g]!;
    const left = this.integrity[g]!;
    const stage = left * 3 <= max ? 2 : left * 3 <= max * 2 ? 1 : 0;
    if (stage <= this.stage[g]!) return;
    this.stage[g] = stage;
    const W = grid.width;
    const crack = this.def[g]!.crack;
    const share = stage === 1 ? 64 : 140; // of 256
    for (let y = this.minY[g]!; y <= this.maxY[g]!; y++) {
      for (let x = this.minX[g]!, i = y * W + x; x <= this.maxX[g]!; x++, i++) {
        if (grid.group[i] !== g) continue;
        const c = crack[grid.groupMat[i]!]!;
        if (c === KEEP || h(i) >= share) continue;
        grid.groupMat[i] = c;
        grid.material[i] = c;
      }
    }
    const bw = this.maxX[g]! - this.minX[g]! + 1;
    const bh = this.maxY[g]! - this.minY[g]! + 1;
    grid.addRenderRect(this.minX[g]!, this.minY[g]!, bw, bh);
    fx.emit(
      'creak',
      (this.minX[g]! + this.maxX[g]!) >> 1,
      (this.minY[g]! + this.maxY[g]!) >> 1,
      Math.max(bw, bh) >> 1,
      { stage },
    );
  }

  /** Break a group: convert and release its cells, then everything resting on it. */
  private break(grid: Grid, g: number, fx: EffectSink): void {
    if (this.broken[g] !== 0) return;
    this.broken[g] = 1;
    this.integrity[g] = 0;
    const W = grid.width;
    const into = this.def[g]!.breakInto;
    const x0 = this.minX[g]!;
    const x1 = this.maxX[g]!;
    const y0 = this.minY[g]!;
    const y1 = this.maxY[g]!;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
        if (grid.group[i] !== g) continue;
        grid.group[i] = 0;
        const b = into[grid.material[i]!]!;
        if (b !== KEEP) {
          grid.material[i] = b;
          if (b === 0) grid.coating[i] = 0;
          grid.cellState[i] = 0;
        }
      }
    }
    this.cells[g] = 0;
    if (x1 >= x0) {
      grid.markDirty(x0, y0, x1, y1);
      fx.emit('collapse', (x0 + x1) >> 1, (y0 + y1) >> 1, Math.max(x1 - x0, y1 - y0) >> 1, {
        cells: this.origCells[g]!,
      });
    }
    for (let o = 1; o <= this.count; o++) {
      if (this.broken[o] !== 0) continue;
      for (let s = 0; s < 4; s++) if (this.support[o * 4 + s] === g) this.break(grid, o, fx);
    }
  }

  /** Cells lost outside ops (burnt, edge collapse): half gone and the group gives way. */
  absorbLosses(grid: Grid, fx: EffectSink): void {
    if (!grid.groupLostAny) return;
    grid.groupLostAny = false;
    for (let g = 1; g <= this.count; g++) {
      const lost = grid.groupLost[g]!;
      if (lost === 0) continue;
      grid.groupLost[g] = 0;
      if (this.broken[g] !== 0) continue;
      this.cells[g] = this.cells[g]! - lost;
      if (this.cells[g]! * 2 < this.origCells[g]!) this.break(grid, g, fx);
    }
  }

  /**
   * Groups that rest on nothing (no `supports`) and have lost the ground under them: with nothing
   * under the base at all they drop as a rigid block, one row per tick, and take impact damage
   * when they land (anything resting on them breaks at once); with less than a fifth of the base
   * still held, wide ones (20+ columns) give way and break. Call while the grid is settling.
   */
  checkBases(grid: Grid, fx: EffectSink): void {
    const W = grid.width;
    for (let g = 1; g <= this.count; g++) {
      if (this.broken[g] !== 0 || this.support[g * 4] !== 0) continue;
      const y = this.maxY[g]!;
      let cols = 0;
      let held = 0;
      if (y < grid.height - 1) {
        for (let x = this.minX[g]!, i = y * W + x; x <= this.maxX[g]!; x++, i++) {
          if (grid.group[i] !== g) continue;
          cols++;
          if (grid.material[i + W] !== 0) held++;
        }
      }
      if (cols > 0 && held === 0 && this.drop(grid, g, fx)) continue;
      if (this.fallen[g]! > 0) this.land(grid, g, fx);
      // a wide structure bridging a hole gives way; a small lump just rests on what holds it
      if (cols >= 20 && held * 5 < cols && this.broken[g] === 0) this.break(grid, g, fx);
    }
  }

  /** Move a whole group down one row if nothing but air (or itself) is under any of its cells. */
  private drop(grid: Grid, g: number, fx: EffectSink): boolean {
    const W = grid.width;
    const x0 = this.minX[g]!;
    const x1 = this.maxX[g]!;
    const y0 = this.minY[g]!;
    const y1 = this.maxY[g]!;
    if (y1 >= grid.height - 1) return false;
    const group = grid.group;
    const mat = grid.material;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
        if (group[i] !== g) continue;
        const j = i + W;
        if (mat[j] !== 0 && group[j] !== g) return false;
      }
    }
    for (let y = y1; y >= y0; y--) {
      for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
        if (group[i] !== g) continue;
        const j = i + W;
        mat[j] = mat[i]!;
        grid.coating[j] = grid.coating[i]!;
        grid.cellState[j] = grid.cellState[i]!;
        grid.groupMat[j] = grid.groupMat[i]!;
        group[j] = g;
        mat[i] = 0;
        grid.coating[i] = 0;
        grid.cellState[i] = 0;
        group[i] = 0;
      }
    }
    this.minY[g] = y0 + 1;
    this.maxY[g] = y1 + 1;
    if (this.fallen[g] === 0) {
      // whatever rested on it can't ride along: it comes down on its own
      for (let o = 1; o <= this.count; o++) {
        if (this.broken[o] !== 0) continue;
        for (let s = 0; s < 4; s++) if (this.support[o * 4 + s] === g) this.break(grid, o, fx);
      }
    }
    this.fallen[g] = this.fallen[g]! + 1;
    grid.markDirty(x0, y0, x1, y1 + 1);
    return true;
  }

  /** A dropped group hit the ground: 6 integrity per row fallen beyond the first four. */
  private land(grid: Grid, g: number, fx: EffectSink): void {
    const rows = this.fallen[g]!;
    this.fallen[g] = 0;
    const dmg = Math.max(0, rows - 4) * 6;
    if (dmg === 0) return;
    this.integrity[g] = this.integrity[g]! - dmg;
    if (this.integrity[g]! <= 0) this.break(grid, g, fx);
    else this.crack(grid, g, fx);
  }

  hash(h: Hasher): void {
    h.num(this.count);
    for (let g = 1; g <= this.count; g++) {
      h.num(this.integrity[g]!).num(this.cells[g]!).num(this.stage[g]!).num(this.broken[g]!);
      h.num(this.pending[g]!).num(this.fallen[g]!).num(this.minY[g]!);
    }
  }
}
