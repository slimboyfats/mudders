import { DAMAGE_TYPES, type GenProp, type PropManifest } from '@mudders/shared';
import type { EffectSink } from './behaviours';
import type { Grid } from './grid';
import type { Hasher } from './hash';
import { KEEP, NUM_DAMAGE_TYPES, STRENGTH_ONE, type MaterialTable } from './materials';
import type { Prng } from './prng';

/** Group slots per map; slot 0 means "no group". */
export const MAX_GROUPS = 255;

/** A shelter's opening: free rows above the ground, and half its width around a tank spawn. */
export const SHELTER_ROWS = 16;
export const SHELTER_HALF = 10;

/** A resting group narrower than this many footing columns never tears; it goes as a whole. */
export const MIN_TEAR = 12;

/** A prop's group compiled to lookup tables. */
interface GroupDef {
  /** `local` glue: hits free cells where they land instead of draining integrity. */
  local: boolean;
  loosen: number;
  shield: number;
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
  embed: number;
  roughen: number;
  mirror: boolean;
  shelter: boolean;
  /** Per shape column: 1 when its bottom SHELTER_ROWS rows are empty (a tank fits under). */
  open: Uint8Array;
  /** Middle of the widest opening a tank fits in, or -1. */
  openMid: number;
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
  /** Columns of the group's footing (its bottom row as stamped): what it stands on. */
  readonly footX0 = new Int32Array(MAX_GROUPS + 1);
  readonly footX1 = new Int32Array(MAX_GROUPS + 1);
  /** Rows a dropping group has fallen so far. */
  readonly fallen = new Int32Array(MAX_GROUPS + 1);
  /** `local` groups whose hold on the ground must be checked again while things settle. */
  readonly recheck = new Uint8Array(MAX_GROUPS + 1);
  /** Flood-fill scratch for `local` groups, sized to the grid on first use. */
  private mark = new Uint8Array(0);
  private queue = new Int32Array(0);
  /** Per column: does a resting group's footing stand there (`structure` scratch). */
  private stand = new Uint8Array(0);
  /** Per column: is this part of a footing kept when it tears (`structure` scratch). */
  private keep = new Uint8Array(0);
  /** Pre-op copy of the cells around a blast while a shield is up (see `shieldBegin`). */
  private snapMat = new Uint8Array(0);
  private snapCoat = new Uint8Array(0);
  private snapState = new Uint8Array(0);
  private snapGroup = new Uint8Array(0);
  private shieldOn = false;
  private sx = 0;
  private sy = 0;
  private sx0 = 0;
  private sy0 = 0;
  private sx1 = -1;
  private sy1 = -1;
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
    this.recheck.fill(0);
  }

  /** True for a slot whose glue is `local` (its cells may be knocked loose one by one). */
  isLocal(slot: number): boolean {
    return this.def[slot]?.local === true;
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
      return {
        local: g.glue === 'local',
        loosen: g.loosen,
        shield: g.glue === 'local' ? g.shield : 0,
        integrity: g.integrity,
        resist,
        breakInto,
        crack,
      };
    });
    const names = p.groups.map((g) => g.name);
    const supports = p.groups.map((g) =>
      g.supports.map((n) => {
        const k = names.indexOf(n);
        if (k < 0) throw new Error(`${p.id}: group ${g.name} rests on unknown group ${n}`);
        return k;
      }),
    );
    const open = new Uint8Array(width);
    let openMid = -1;
    let best = 2 * SHELTER_HALF;
    for (let x = 0, run = 0; x <= width; x++) {
      let free = x < width && height >= SHELTER_ROWS;
      for (let y = height - SHELTER_ROWS; free && y < height; y++)
        if (mat[y * width + x] !== 0) free = false;
      if (free) {
        open[x] = 1;
        run++;
        continue;
      }
      if (run > best) {
        best = run;
        openMid = x - run + (run >> 1);
      }
      run = 0;
    }
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
      embed: p.placement.embed,
      roughen: p.placement.roughen,
      mirror: p.placement.mirror,
      shelter: p.placement.shelter,
      open,
      openMid,
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
    const covered = new Uint8Array(spawns.length);
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
          const flip = p.mirror && rng.chance(1, 2);
          let x: number;
          if (p.shelter && p.openMid >= 0 && attempt < 8 && spawns.length > 0) {
            // shelters first try to stand over a tank that has none yet
            const k = rng.int(spawns.length);
            if (covered[k] !== 0) continue;
            x = spawns[k]! - (flip ? p.width - 1 - p.openMid : p.openMid);
          } else {
            x =
              entry.cluster && prev >= 0 && attempt < 12
                ? prev + (rng.chance(1, 2) ? 1 : -1) * (p.width + rng.range(2, 10))
                : rng.range(4, grid.width - p.width - 4);
          }
          if (x < 4 || x + p.width > grid.width - 4) continue;
          if (!this.fits(grid, p, x, taken, spawns.length, flip)) continue;
          this.stamp(grid, p, x, flip, rng);
          for (let k = 0; k < spawns.length; k++)
            if (spawns[k]! >= x && spawns[k]! < x + p.width) covered[k] = 1;
          taken.push(x - 2, x + p.width + 2);
          prev = x;
          break;
        }
      }
    }
  }

  /**
   * Stamp one prop centred on column x (scenario showcases); a shelter's opening goes over x. With `rng` a `mirror`/`roughen`
   * prop is varied as on a generated map; without it the shape goes down exactly as drawn.
   */
  placeAt(grid: Grid, id: string, x: number, rng?: Prng): void {
    const k = this.propIndex[id];
    if (k === undefined) throw new Error(`unknown prop ${id}`);
    const p = this.props[k]!;
    // an embedded prop always roots in the higher side of the slope; others face either way
    const flip =
      p.embed > 0
        ? p.mirror && grid.surfaceY(x - (p.width >> 1)) > grid.surfaceY(x + (p.width >> 1))
        : rng !== undefined && p.mirror && rng.chance(1, 2);
    // a shelter goes with its opening over x (where the scenario puts the tank)
    const mid =
      p.shelter && p.openMid >= 0 ? (flip ? p.width - 1 - p.openMid : p.openMid) : p.width >> 1;
    const x0 = Math.max(0, Math.min(grid.width - p.width, x - mid));
    this.stamp(grid, p, x0, flip, rng);
  }

  /**
   * Room for the prop at column x: clear of other props, on gentle enough ground. The first
   * `nSpawns` taken spans are tank spawns; a shelter may cover one if the tank fits its opening.
   */
  private fits(
    grid: Grid,
    p: CompiledProp,
    x: number,
    taken: readonly number[],
    nSpawns: number,
    flip: boolean,
  ): boolean {
    for (let i = 0; i < taken.length; i += 2) {
      if (p.shelter && i < nSpawns * 2) {
        const s = (taken[i]! + taken[i + 1]!) >> 1;
        if (s + SHELTER_HALF < x || s - SHELTER_HALF >= x + p.width) continue;
        for (let c = s - SHELTER_HALF; c <= s + SHELTER_HALF; c++) {
          const sx = flip ? x + p.width - 1 - c : c - x;
          if (sx < 0 || sx >= p.width || p.open[sx] === 0) return false;
        }
        continue;
      }
      const a = taken[i]! - p.clearance;
      const b = taken[i + 1]! + p.clearance;
      if (x + p.width > a && x < b) return false;
    }
    if (p.embed > 0) {
      // the root end sits in the slope; the ground must fall away under the far end by at least
      // the prop's visible height, and no hill may stand above the prop's top
      const rootY = Groups.rootGround(grid, p, x, flip);
      const farY = grid.surfaceY(flip ? x : x + p.width - 1);
      const topY = rootY + p.embed - p.height;
      if (farY - rootY < p.height - p.embed + 4 || topY < 8 || rootY + p.embed >= grid.height - 4)
        return false;
      for (let c = x; c < x + p.width; c++) if (grid.surfaceY(c) <= topY + 2) return false;
      return true;
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

  /** Lowest ground under the root third of an embedded prop (left third, or right when flipped). */
  private static rootGround(grid: Grid, p: CompiledProp, x0: number, flip: boolean): number {
    let low = 0;
    const third = Math.max(1, Math.floor(p.width / 3));
    for (let k = 0; k < third; k++) {
      const sy = grid.surfaceY(flip ? x0 + p.width - 1 - k : x0 + k);
      if (sy > low) low = sy;
    }
    return low;
  }

  /** The shape as this copy will be stamped: mirrored and worn per the prop's placement. */
  private variant(p: CompiledProp, flip: boolean, rng: Prng | undefined): [Uint8Array, Uint8Array] {
    const w = p.width;
    const ht = p.height;
    if (!flip && (rng === undefined || p.roughen === 0)) return [p.mat, p.grp];
    const mat = new Uint8Array(w * ht);
    const grp = new Uint8Array(w * ht);
    for (let y = 0; y < ht; y++) {
      for (let x = 0; x < w; x++) {
        const from = y * w + (flip ? w - 1 - x : x);
        mat[y * w + x] = p.mat[from]!;
        grp[y * w + x] = p.grp[from]!;
      }
    }
    if (rng === undefined || p.roughen === 0) return [mat, grp];
    const mark = new Uint8Array(w * ht);
    for (let pass = 0; pass < p.roughen; pass++) {
      mark.fill(0);
      // the bottom row is the footing and stays; above it outline cells chip off, and bumps
      // grow on top of solid cells (never under an overhang, so openings only get bigger)
      for (let y = 0; y < ht - 1; y++) {
        for (let x = 0, i = y * w; x < w; x++, i++) {
          if (mat[i] !== 0) {
            const edge =
              x === 0 ||
              x === w - 1 ||
              y === 0 ||
              mat[i - 1] === 0 ||
              mat[i + 1] === 0 ||
              mat[i - w] === 0 ||
              mat[i + w] === 0;
            if (edge && rng.chance(1, 4)) mark[i] = 1;
          } else if (
            x > 0 &&
            x < w - 1 &&
            mat[i + w] !== 0 &&
            mat[i + w - 1] !== 0 &&
            mat[i + w + 1] !== 0 &&
            rng.chance(1, 5)
          ) {
            mark[i] = 2;
          }
        }
      }
      for (let i = 0; i < w * ht; i++) {
        if (mark[i] === 1) {
          mat[i] = 0;
          grp[i] = 0;
        } else if (mark[i] === 2) {
          mat[i] = mat[i + w]!;
          grp[i] = grp[i + w]!;
        }
      }
    }
    // no crumbs or needles: a cell with air on both sides and above goes (twice, top down, so
    // two-cell spikes go too), as does one with nothing under it either
    for (let k = 0; k < 2; k++) {
      for (let y = 0; y < ht - 1; y++) {
        for (let x = 0, i = y * w; x < w; x++, i++) {
          if (mat[i] === 0) continue;
          const l = x > 0 ? mat[i - 1]! : 0;
          const r = x < w - 1 ? mat[i + 1]! : 0;
          const u = y > 0 ? mat[i - w]! : 0;
          if (l === 0 && r === 0 && u === 0) {
            mat[i] = 0;
            grp[i] = 0;
          }
        }
      }
    }
    return [mat, grp];
  }

  private stamp(grid: Grid, p: CompiledProp, x0: number, flip = false, rng?: Prng): void {
    const W = grid.width;
    const slot0 = this.count;
    if (slot0 + p.groups.length > MAX_GROUPS) return;
    const [shapeMat, shapeGrp] = this.variant(p, flip, rng);
    // the base row sits at the footprint's median ground height: columns lower than that get a
    // foundation of whatever tops them, higher ones are cut back, so the prop sits level
    let base: number;
    if (p.embed > 0) {
      // jutting out of a slope: the root end goes `embed` rows into the ground, nothing is levelled
      base = Groups.rootGround(grid, p, x0, flip) + p.embed;
    } else {
      const heights: number[] = [];
      for (let c = x0; c < x0 + p.width; c++) heights.push(grid.surfaceY(c));
      heights.sort((a, b) => a - b);
      base = heights[heights.length >> 1]!;
    }
    for (let c = x0; c < x0 + p.width && p.embed === 0; c++) {
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
      this.recheck[slot] = 0;
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
        const m = shapeMat[y * p.width + x]!;
        if (m === 0) continue;
        const gx = x0 + x;
        const i = gy * W + gx;
        grid.material[i] = m;
        grid.coating[i] = 0;
        grid.cellState[i] = 0;
        const gk = shapeGrp[y * p.width + x]!;
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
    for (let k = 1; k <= p.groups.length; k++) {
      const slot = slot0 + k;
      this.origCells[slot] = this.cells[slot]!;
      // footing: the columns of its bottom row (a tree's trunk, not the branches over the canopy)
      this.footX0[slot] = this.maxX[slot]!;
      this.footX1[slot] = this.minX[slot]!;
      const y = this.maxY[slot]!;
      for (let x = this.minX[slot]!; x <= this.maxX[slot]!; x++) {
        if (y < 0 || grid.group[y * W + x] !== slot) continue;
        if (x < this.footX0[slot]!) this.footX0[slot] = x;
        if (x > this.footX1[slot]!) this.footX1[slot] = x;
      }
    }
    grid.markDirty(x0, Math.max(0, top), x0 + p.width - 1, grid.height - 1);
  }

  /**
   * Glue every loose cell of material `cell` on the map into one group with the rules of prop
   * `id`'s first group (a generator's `glue`, e.g. a cave roof with `local` glue: pieces cut off
   * from what holds them come down). The cells stay where the generator drew them.
   */
  glue(grid: Grid, id: string, cell: number): void {
    const k = this.propIndex[id];
    if (k === undefined) throw new Error(`unknown prop ${id}`);
    const p = this.props[k]!;
    const def = p.groups[0];
    if (def === undefined || this.count + 1 > MAX_GROUPS) return;
    const slot = ++this.count;
    const W = grid.width;
    this.def[slot] = def;
    this.integrity[slot] = def.integrity;
    this.maxIntegrity[slot] = def.integrity;
    this.cells[slot] = 0;
    this.minX[slot] = W;
    this.maxX[slot] = -1;
    this.minY[slot] = grid.height;
    this.maxY[slot] = -1;
    this.stage[slot] = 0;
    this.broken[slot] = 0;
    this.pending[slot] = 0;
    this.fallen[slot] = 0;
    this.recheck[slot] = 0;
    for (let s = 0; s < 4; s++) this.support[slot * 4 + s] = 0;
    const mat = grid.material;
    let n = 0;
    for (let y = 0, i = 0; y < grid.height; y++) {
      for (let x = 0; x < W; x++, i++) {
        if (mat[i] !== cell || grid.group[i] !== 0) continue;
        grid.group[i] = slot;
        grid.groupMat[i] = cell;
        n++;
        if (x < this.minX[slot]!) this.minX[slot] = x;
        if (x > this.maxX[slot]!) this.maxX[slot] = x;
        if (y < this.minY[slot]!) this.minY[slot] = y;
        if (y > this.maxY[slot]!) this.maxY[slot] = y;
      }
    }
    this.cells[slot] = n;
    this.origCells[slot] = n;
    this.footX0[slot] = this.minX[slot]!;
    this.footX1[slot] = this.maxX[slot]!;
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
      if (this.def[g]!.local) {
        this.guardLocal(grid, g, x0, y0, x1, y1, fx);
        continue;
      }
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

  /**
   * `local` glue after an op: cells it changed leave the group and keep what the op did; group
   * cells within `loosen` of them come loose as `breakInto`; then whatever is no longer joined
   * to the ground falls. An op that only touched the ground nearby (undermining) still triggers
   * the check.
   */
  private guardLocal(
    grid: Grid,
    g: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    fx: EffectSink,
  ): void {
    this.pending[g] = 0;
    const gx0 = Math.max(x0, this.minX[g]! - 1);
    const gx1 = Math.min(x1, this.maxX[g]! + 1);
    const gy0 = Math.max(y0, this.minY[g]! - 1);
    const gy1 = Math.min(y1, this.maxY[g]! + 1);
    if (gx0 > gx1 || gy0 > gy1) return;
    const W = grid.width;
    const mat = grid.material;
    const group = grid.group;
    const want = grid.groupMat;
    this.ensureScratch(grid);
    const q = this.queue;
    let n = 0;
    for (let y = gy0; y <= gy1; y++) {
      for (let x = gx0, i = y * W + gx0; x <= gx1; x++, i++) {
        if (group[i] !== g || mat[i] === want[i]) continue;
        group[i] = 0;
        q[n++] = i;
      }
    }
    this.cells[g] = this.cells[g]! - n;
    const r = this.def[g]!.loosen;
    const into = this.def[g]!.breakInto;
    let freed = n;
    if (n > 0 && r > 0) {
      for (let k = 0; k < n; k++) {
        const i = q[k]!;
        const cx = i % W;
        const cy = (i - cx) / W;
        for (let y = Math.max(0, cy - r); y <= Math.min(grid.height - 1, cy + r); y++) {
          for (let x = Math.max(0, cx - r), j = y * W + x; x <= Math.min(W - 1, cx + r); x++, j++) {
            if (group[j] !== g) continue;
            this.release(grid, j, into);
            freed++;
          }
        }
      }
      grid.markDirty(gx0 - r, gy0 - r, gx1 + r, gy1 + r);
    }
    if (freed > 0) fx.emit('creak', (gx0 + gx1) >> 1, (gy0 + gy1) >> 1, 4, { cells: freed });
    this.recheck[g] = 1;
    this.holdOn(grid, g, fx);
  }

  private ensureScratch(grid: Grid): void {
    if (this.mark.length === grid.size) return;
    this.mark = new Uint8Array(grid.size);
    this.queue = new Int32Array(grid.size);
    this.snapMat = new Uint8Array(grid.size);
    this.snapCoat = new Uint8Array(grid.size);
    this.snapState = new Uint8Array(grid.size);
    this.snapGroup = new Uint8Array(grid.size);
  }

  // ── shields ───────────────────────────────────────────────────────────────────────────────

  /**
   * Before an op call centred on (cx, cy) with reach `r`: if an intact shielding group is in
   * reach, copy the cells around so `shieldEnd` can put back whatever the rock hid. Returns
   * whether a shield is up.
   */
  shieldBegin(grid: Grid, cx: number, cy: number, r: number): boolean {
    this.shieldOn = false;
    const x0 = Math.max(0, cx - r - 1);
    const x1 = Math.min(grid.width - 1, cx + r + 1);
    const y0 = Math.max(0, cy - r - 1);
    const y1 = Math.min(grid.height - 1, cy + r + 1);
    let any = false;
    for (let g = 1; g <= this.count && !any; g++) {
      if (this.broken[g] !== 0 || this.def[g]!.shield === 0) continue;
      any =
        this.minX[g]! <= x1 && this.maxX[g]! >= x0 && this.minY[g]! <= y1 && this.maxY[g]! >= y0;
    }
    if (!any || x1 < x0 || y1 < y0) return false;
    this.ensureScratch(grid);
    const W = grid.width;
    for (let y = y0; y <= y1; y++) {
      const a = y * W + x0;
      const b = y * W + x1 + 1;
      this.snapMat.set(grid.material.subarray(a, b), a);
      this.snapCoat.set(grid.coating.subarray(a, b), a);
      this.snapState.set(grid.cellState.subarray(a, b), a);
      this.snapGroup.set(grid.group.subarray(a, b), a);
    }
    this.shieldOn = true;
    this.sx = cx;
    this.sy = cy;
    this.sx0 = x0;
    this.sy0 = y0;
    this.sx1 = x1;
    this.sy1 = y1;
    return true;
  }

  /**
   * Shield cells crossed on the straight line from (ax, ay) to (bx, by), ends excluded, stopping
   * once a crossed group's `shield` depth is reached. `pre` reads the pre-op copy.
   */
  private blocked(
    grid: Grid,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    pre: boolean,
  ): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const n = Math.max(dx < 0 ? -dx : dx, dy < 0 ? -dy : dy);
    if (n < 2) return false;
    const W = grid.width;
    const group = pre ? this.snapGroup : grid.group;
    let crossed = 0;
    for (let k = 1; k < n; k++) {
      const x = ax + Math.floor((dx * k * 2 + n) / (2 * n));
      const y = ay + Math.floor((dy * k * 2 + n) / (2 * n));
      const g = group[y * W + x]!;
      if (g === 0 || this.broken[g] !== 0) continue;
      const depth = this.def[g]!.shield;
      if (depth === 0) continue;
      if (++crossed >= depth) return true;
    }
    return false;
  }

  /** During a shielded op: may the cell at index i be launched? */
  shields(grid: Grid, i: number): boolean {
    if (!this.shieldOn) return false;
    const x = i % grid.width;
    const y = (i - x) / grid.width;
    if (x < this.sx0 || x > this.sx1 || y < this.sy0 || y > this.sy1) return false;
    return this.underRock(grid, x, y) || this.blocked(grid, this.sx, this.sy, x, y, true);
  }

  /**
   * A shielding group's footing: a non-group cell with the group's rock within `shield` rows
   * above it, which no blast may dig out (the rock stands on it; a blast can't undercut it).
   */
  private underRock(grid: Grid, x: number, y: number): boolean {
    const W = grid.width;
    const sg = this.snapGroup;
    if (sg[y * W + x] !== 0) return false;
    for (let k = 1; k <= 8 && y - k >= 0; k++) {
      const g = sg[(y - k) * W + x]!;
      if (g === 0 || this.broken[g] !== 0) continue;
      if (this.def[g]!.shield !== 0 && k <= this.def[g]!.shield) return true;
    }
    return false;
  }

  /** After a shielded op: undo whatever it did to cells the rock hid from the blast. */
  shieldEnd(grid: Grid): void {
    if (!this.shieldOn) return;
    this.shieldOn = false;
    const W = grid.width;
    const mat = grid.material;
    let n = 0;
    for (let y = this.sy0; y <= this.sy1; y++) {
      for (let x = this.sx0, i = y * W + x; x <= this.sx1; x++, i++) {
        if (mat[i] === this.snapMat[i] && grid.coating[i] === this.snapCoat[i]) continue;
        if (!this.underRock(grid, x, y) && !this.blocked(grid, this.sx, this.sy, x, y, true))
          continue;
        mat[i] = this.snapMat[i]!;
        grid.coating[i] = this.snapCoat[i]!;
        grid.cellState[i] = this.snapState[i]!;
        grid.fallVel[i] = 0;
        grid.group[i] = this.snapGroup[i]!;
        n++;
      }
    }
    if (n > 0)
      grid.addRenderRect(this.sx0, this.sy0, this.sx1 - this.sx0 + 1, this.sy1 - this.sy0 + 1);
  }

  /** Is the line from a blast at (ax, ay) to (bx, by) behind enough intact rock to stop it? */
  shelters(grid: Grid, ax: number, ay: number, bx: number, by: number): boolean {
    if (this.count === 0) return false;
    return this.blocked(grid, ax, ay, bx, by, false);
  }

  /** One cell of a `local` group comes loose. */
  private release(grid: Grid, i: number, into: Uint8Array): void {
    grid.group[i] = 0;
    const b = into[grid.material[i]!]!;
    if (b !== KEEP) {
      grid.material[i] = b;
      if (b === 0) grid.coating[i] = 0;
      grid.cellState[i] = 0;
    }
  }

  /**
   * `local` glue: flood the group from the cells that hold on to something (anything solid right
   * under them, or a static cell or another group beside or above them); every group cell the
   * flood doesn't reach comes loose and falls as `breakInto`.
   */
  private holdOn(grid: Grid, g: number, fx: EffectSink): void {
    const x0 = this.minX[g]!;
    const x1 = this.maxX[g]!;
    const y0 = this.minY[g]!;
    const y1 = this.maxY[g]!;
    if (x1 < x0) return;
    this.ensureScratch(grid);
    const W = grid.width;
    const H = grid.height;
    const mat = grid.material;
    const group = grid.group;
    const kind = this.mats.settle;
    const mark = this.mark;
    const q = this.queue;
    let head = 0;
    let tail = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
        if (group[i] !== g) continue;
        const below = y === H - 1 || (mat[i + W] !== 0 && group[i + W] !== g);
        if (
          below ||
          (x > 0 && Groups.holds(mat, group, kind, g, i - 1)) ||
          (x < W - 1 && Groups.holds(mat, group, kind, g, i + 1)) ||
          (y > 0 && Groups.holds(mat, group, kind, g, i - W))
        ) {
          mark[i] = 1;
          q[tail++] = i;
        }
      }
    }
    while (head < tail) {
      const i = q[head++]!;
      const x = i % W;
      if (x > 0 && group[i - 1] === g && mark[i - 1] === 0) {
        mark[i - 1] = 1;
        q[tail++] = i - 1;
      }
      if (x < W - 1 && group[i + 1] === g && mark[i + 1] === 0) {
        mark[i + 1] = 1;
        q[tail++] = i + 1;
      }
      if (i >= W && group[i - W] === g && mark[i - W] === 0) {
        mark[i - W] = 1;
        q[tail++] = i - W;
      }
      if (i + W < W * H && group[i + W] === g && mark[i + W] === 0) {
        mark[i + W] = 1;
        q[tail++] = i + W;
      }
    }
    const into = this.def[g]!.breakInto;
    let fell = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
        if (group[i] !== g) continue;
        if (mark[i] !== 0) {
          mark[i] = 0;
          continue;
        }
        this.release(grid, i, into);
        fell++;
      }
    }
    this.cells[g] = tail;
    if (fell > 0) {
      grid.markDirty(x0, y0, x1, y1);
      fx.emit('collapse', (x0 + x1) >> 1, (y0 + y1) >> 1, Math.max(x1 - x0, y1 - y0) >> 1, {
        cells: fell,
      });
    }
    if (tail === 0) {
      this.broken[g] = 1;
      this.recheck[g] = 0;
    }
  }

  /** A neighbour a `local` group can hang on to sideways: static terrain or another prop. */
  private static holds(
    mat: Uint8Array,
    group: Uint8Array,
    kind: Uint8Array,
    g: number,
    j: number,
  ): boolean {
    const m = mat[j]!;
    if (m === 0 || group[j] === g) return false;
    return group[j] !== 0 || kind[m] === 0;
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
      if (this.def[g]!.local) {
        // knocked loose (launched, burnt): see what still holds
        this.holdOn(grid, g, fx);
        this.recheck[g] = 1;
      } else if (this.cells[g]! * 2 < this.origCells[g]!) this.break(grid, g, fx);
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
      if (this.broken[g] !== 0) continue;
      if (this.def[g]!.local) {
        // what held it a moment ago may have been loose rubble that has since fallen away
        if (this.recheck[g] !== 0) this.holdOn(grid, g, fx);
        continue;
      }
      if (this.support[g * 4] !== 0) continue;
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
      if (this.broken[g] === 0) this.structure(grid, g, fx);
    }
  }

  /**
   * Structure (§4c) of a resting group (`whole` glue, no `supports`): in each column of its
   * footing (its bottom row as stamped) the lowest cell stands on something or hangs over air.
   * With every column standing it is fine. Otherwise its reach is worked out: the base cells'
   * average `span`, shortened by the load (its weight, density over its own cells and everything
   * resting on it, per column). The part that sticks out past the outer standing columns further
   * than that, or past a gap between standing columns wider than twice that, tears off along a
   * ragged line and falls as rubble, along with whatever rested on it; the rest stays up with a
   * cracked edge. With nothing left to tear, a weight centred outside the standing columns tips the
   * whole thing over (it breaks). A base with any material that has no `span` skips this.
   * Cost: one cell per column, plus one pass over the group's box when a column hangs free.
   */
  private structure(grid: Grid, g: number, fx: EffectSink): void {
    const W = grid.width;
    const group = grid.group;
    const mat = grid.material;
    const spanOf = this.mats.span;
    const x0 = Math.max(this.minX[g]!, this.footX0[g]!);
    const x1 = Math.min(this.maxX[g]!, this.footX1[g]!);
    const y0 = this.minY[g]!;
    const y1 = this.maxY[g]!;
    if (this.stand.length < W) this.stand = new Uint8Array(W);
    const stand = this.stand;
    let first = -1;
    let last = -1;
    let left = -1;
    let right = -1;
    let span = 0;
    let free = 0;
    let baseDensity = 0;
    let cols = 0;
    for (let x = x0; x <= x1; x++) {
      stand[x] = 0;
      let i = y1 * W + x;
      let y = y1;
      while (y >= y0 && group[i] !== g) {
        y--;
        i -= W;
      }
      if (y < y0) continue;
      cols++;
      if (first < 0) first = x;
      last = x;
      const m = mat[i]!;
      const sp = spanOf[m]!;
      if (sp === 255) return; // a material with no structural rule: the old rule only
      span += sp;
      baseDensity += this.mats.density[m]!;
      const under = group[i + W]!;
      const stands =
        y < grid.height - 1 && mat[i + W] !== 0 && (under === 0 || !this.restsOn(under, g));
      if (stands) {
        stand[x] = 1;
        if (left < 0) left = x;
        right = x;
      } else free++;
    }
    // all standing, nothing measured, no rule, or bare (`drop` handles that)
    if (free === 0 || left < 0) return;
    // weight and its centre, over this group and everything resting on it
    let w = 0;
    let wx = 0;
    const dens = this.mats.density;
    for (let o = 1; o <= this.count; o++) {
      if (this.broken[o] !== 0 || !this.restsOn(o, g)) continue;
      const ox1 = this.maxX[o]!;
      for (let y = this.minY[o]!; y <= this.maxY[o]!; y++) {
        for (let x = this.minX[o]!, i = y * W + x; x <= ox1; x++, i++) {
          if (group[i] !== o) continue;
          const d = dens[mat[i]!]!;
          w += d;
          wx += d * x;
        }
      }
    }
    if (w === 0) return;
    // rows of its own base material each column carries (weight over the summed density of the
    // column bottoms); the reach is the base's average span, shortened as that load grows
    const load = Math.trunc(w / Math.max(1, baseDensity));
    const reach = Math.trunc((span * 32) / (cols * (16 + Math.max(16, load))));
    if (
      left - first <= reach &&
      last - right <= reach &&
      !this.gapOver(stand, left, right, reach)
    ) {
      // nothing sticks out too far; it tips over if its weight is centred off what stands
      // (half a cell of slack)
      if (2 * wx < w * (2 * left - 1) || 2 * wx > w * (2 * right + 1)) this.break(grid, g, fx);
      return;
    }
    // narrow things (a trunk, a lump) don't tear: they go as a whole
    if (last - first + 1 < MIN_TEAR) {
      this.break(grid, g, fx);
      return;
    }
    // keep every stretch of 2+ standing columns (gaps up to 2×reach bridged) plus `reach` either side
    if (this.keep.length < W) this.keep = new Uint8Array(W);
    const keep = this.keep;
    keep.fill(0, first, last + 1);
    for (let x = left, segL = left, n = 0, prev = left; x <= right + 1; x++) {
      if (x <= right && stand[x] === 0) continue;
      if (x > right || x - prev - 1 > 2 * reach) {
        if (n >= 2) keep.fill(1, Math.max(first, segL - reach), Math.min(last, prev + reach) + 1);
        segL = x;
        n = 0;
      }
      n++;
      prev = x;
    }
    this.tear(grid, g, first, last, fx);
  }

  /** Is there a run of free columns between `left` and `right` longer than 2×reach? */
  private gapOver(stand: Uint8Array, left: number, right: number, reach: number): boolean {
    let run = 0;
    for (let x = left; x <= right; x++) {
      if (stand[x] !== 0) run = 0;
      else if (++run > 2 * reach) return true;
    }
    return false;
  }

  /**
   * Tear group `g` (and everything resting on it) along ragged lines: cells in footing columns
   * `keep` doesn't mark (columns beyond the footing [first, last] go with its end column), give
   * or take a cell per row, convert per their group's `breakInto` and come loose; the cells along
   * a tear on the kept side crack.
   */
  private tear(grid: Grid, g: number, first: number, last: number, fx: EffectSink): void {
    const W = grid.width;
    const group = grid.group;
    const mat = grid.material;
    const keep = this.keep;
    let lost = 0;
    let lx0 = W;
    let lx1 = -1;
    let ly0 = grid.height;
    let ly1 = -1;
    for (let o = 1; o <= this.count; o++) {
      if (this.broken[o] !== 0 || !this.restsOn(o, g)) continue;
      const def = this.def[o]!;
      const ox0 = this.minX[o]!;
      const ox1 = this.maxX[o]!;
      const oy0 = this.minY[o]!;
      const oy1 = this.maxY[o]!;
      let n = 0;
      let nx0 = W;
      let nx1 = -1;
      let ny0 = grid.height;
      let ny1 = -1;
      for (let y = oy0; y <= oy1; y++) {
        // the tear wanders a cell either way from row to row
        const jag = (h(y * 0x9e37 + g) % 3) - 1;
        for (let x = ox0, i = y * W + ox0; x <= ox1; x++, i++) {
          if (group[i] !== o) continue;
          const k = x - jag;
          if (keep[k < first ? first : k > last ? last : k] === 0) {
            group[i] = 0;
            const b = def.breakInto[mat[i]!]!;
            if (b !== KEEP) {
              mat[i] = b;
              if (b === 0) grid.coating[i] = 0;
            }
            grid.cellState[i] = 0;
            lost++;
            if (x < lx0) lx0 = x;
            if (x > lx1) lx1 = x;
            if (y < ly0) ly0 = y;
            if (y > ly1) ly1 = y;
            continue;
          }
          const kl = k - 2;
          const kr = k + 2;
          if (
            keep[kl < first ? first : kl > last ? last : kl] === 0 ||
            keep[kr < first ? first : kr > last ? last : kr] === 0
          ) {
            const c = def.crack[mat[i]!]!;
            if (c !== KEEP) {
              mat[i] = c;
              grid.groupMat[i] = c;
            }
          }
          n++;
          if (x < nx0) nx0 = x;
          if (x > nx1) nx1 = x;
          if (y < ny0) ny0 = y;
          if (y > ny1) ny1 = y;
        }
      }
      this.cells[o] = n;
      if (n === 0) {
        this.broken[o] = 1;
        this.integrity[o] = 0;
        continue;
      }
      this.minX[o] = nx0;
      this.maxX[o] = nx1;
      this.minY[o] = ny0;
      this.maxY[o] = ny1;
      if (this.footX0[o]! < nx0) this.footX0[o] = nx0;
      if (this.footX1[o]! > nx1) this.footX1[o] = nx1;
    }
    if (lost === 0) return;
    grid.markDirty(lx0 - 1, ly0, lx1 + 1, ly1);
    fx.emit('collapse', (lx0 + lx1) >> 1, (ly0 + ly1) >> 1, Math.max(lx1 - lx0, ly1 - ly0) >> 1, {
      cells: lost,
    });
    // too little left to stand on its own: the rest comes down too
    if (this.cells[g]! * 4 < this.origCells[g]!) {
      this.break(grid, g, fx);
      return;
    }
    // what is left counts as whole again (cells lost later are measured against it)
    for (let o = 1; o <= this.count; o++)
      if (this.broken[o] === 0 && this.restsOn(o, g)) this.origCells[o] = this.cells[o]!;
  }

  /** Is `o` the group `g` itself, or resting on it through any chain of `supports`? */
  private restsOn(o: number, g: number, depth = 0): boolean {
    if (o === g) return true;
    if (depth >= 8) return false;
    for (let s = 0; s < 4; s++) {
      const t = this.support[o * 4 + s]!;
      if (t === 0) break;
      if (this.restsOn(t, g, depth + 1)) return true;
    }
    return false;
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

  /** The grid has gone still: nothing `local` groups lean on can still fall away. */
  settled(): void {
    this.recheck.fill(0);
  }

  hash(h: Hasher): void {
    h.num(this.count);
    for (let g = 1; g <= this.count; g++) {
      h.num(this.integrity[g]!).num(this.cells[g]!).num(this.stage[g]!).num(this.broken[g]!);
      h.num(this.pending[g]!).num(this.fallen[g]!).num(this.minY[g]!);
      h.num(this.footX0[g]!).num(this.footX1[g]!);
      if (this.def[g]!.local) h.num(this.recheck[g]!);
    }
  }
}
