import { FP } from '@mudders/shared';
import type { EffectSink } from './behaviours';
import { DEBRIS_CAP, type DebrisPool } from './debris';
import { cosDeci, isqrt, sinDeci } from './fixed';
import type { Grid } from './grid';
import type { Hasher } from './hash';
import { KEEP, SETTLE_FLOW, SETTLE_GAS, SETTLE_STATIC, type MaterialTable } from './materials';

/** Pieces in the air at once; what breaks off beyond that falls as loose cells. */
export const MAX_CHUNKS = 32;
/** Smaller bits than this fall as loose cells. */
const MIN_CELLS = 12;
/** A breaking shelf splits into pieces about this size. */
const BLOCK_W = 18;
const BLOCK_H = 13;
/** A breaking prop (a wall, a rock arch) comes apart in bigger slabs. */
const WALL_W = 28;
const WALL_H = 20;
/** Largest box a piece may have. */
const MAX_SIDE = 64;
/** Fastest a piece falls, per tick. */
const MAX_FALL = 3 * FP;
/** Landing this fast knocks crumbs off the piece and raises dust. */
const HARD = (FP * 3) >> 1;
/** Radians → 1/256 deci-degree. */
const SPIN_UNIT = 573 * 256;
/** A piece on the ground turning slower than this (1/256 deci-degree per tick) lies still. */
const REST_SPIN = 200;
/** Ticks a piece may go without moving before it is ground again. */
const STUCK = 10;
/** Ticks a piece may roll on the ground, and live at all. */
const MAX_GROUND = 90;
const MAX_AGE = 900;
/** Loosen steps rubble gets where a piece breaks up. */
const LAND_LOOSE = 16;
const HALF = FP >> 1;
const RASTER_CAP = 16384;
const HIT_CAP = 512;

/** One piece of rock or wall in the air: its cells in a local box, turning about its centre. */
interface Body {
  w: number;
  h: number;
  mat: Uint8Array;
  coat: Uint8Array;
  state: Uint8Array;
  shade: Uint8Array;
  /** Cells it still has. */
  n: number;
  /** Local indices of its outline cells. */
  edge: Int32Array;
  edgeN: number;
  /** Centre of mass in the local box, and in the grid (FP). */
  lcx: number;
  lcy: number;
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  /** Deci-degrees, clockwise on screen. */
  angle: number;
  /** 1/256 deci-degree per tick, and the part of a deci-degree not turned yet. */
  omega: number;
  frac: number;
  /** Reach from the centre, in cells. */
  r: number;
  age: number;
  ground: number;
  stuck: number;
  /** It has hit the ground hard once already. */
  hit: boolean;
  material: number;
  /** material → what it breaks into where it lands (KEEP = unchanged), or null. */
  into: Uint8Array | null;
  /** Ticks before it may break up while it only rests on something. */
  wait: number;
  /** Where it started (FP), to tell a piece that fell from one that broke where it stood. */
  sx: number;
  sy: number;
}

function mix(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return (h ^ (h >>> 12)) >>> 0;
}

/** Which piece a cell of a breaking shelf belongs to: a grid of blocks with wandering seams. */
function blockOf(x: number, y: number, big: boolean): number {
  const bx = Math.floor((x + (mix(y >> 2, 11) % 6)) / (big ? WALL_W : BLOCK_W));
  const by = Math.floor((y + (mix(x >> 2, 23) % 5)) / (big ? WALL_H : BLOCK_H));
  return by * 8192 + bx;
}

/**
 * Rock, ice and walls that break off and fall as pieces (§4b). When the support pass lets go of
 * ground that hangs too far, connected cells with air under them leave the grid as rigid pieces
 * instead of single loose cells. A piece falls under gravity and turns as it goes (the end that
 * was held drops last). Where it touches down it tips over the point it stands on, rolls while
 * its weight is to one side of that point, and lies still once its weight is over what holds it;
 * a hard landing knocks crumbs off it. Then its cells are plain terrain again, at the angle it
 * came to rest. While it is in the air it is not in the grid: the renderer gets its cells with
 * the debris. Fixed-point integers and the sin table only; all of it is hashed.
 */
export class Chunker {
  private readonly bodies: Body[] = [];
  private readonly rx = new Int32Array(RASTER_CAP);
  private readonly ry = new Int32Array(RASTER_CAP);
  private readonly rs = new Int32Array(RASTER_CAP);
  private rn = 0;
  private readonly hx = new Int32Array(HIT_CAP);
  private readonly hy = new Int32Array(HIT_CAP);
  private hn = 0;
  private seen = new Uint8Array(0);
  private seenGen = 0;

  get any(): boolean {
    return this.bodies.length > 0;
  }

  get count(): number {
    return this.bodies.length;
  }

  reset(): void {
    this.bodies.length = 0;
  }

  /**
   * Take what can fall in one piece out of cells that are coming loose. `list[0..n)` are those
   * cells (row by row, top first), each stamped `rel` in `mark`; the rest of `list` is scratch.
   * `dist` (support pass) is how far each hangs from what held it. `into` (a prop breaking) maps
   * each material to what it breaks into where it lands; `kickX` is the column of the blast that
   * broke it, or -1. Cells taken are cleared from the grid; the caller deals with the rest.
   * Without `into`, only pieces with two cells of air under them are taken, so a piece that
   * lands is never taken again where it lies.
   */
  take(
    grid: Grid,
    mats: MaterialTable,
    list: Int32Array,
    n: number,
    mark: Uint8Array,
    rel: number,
    dist: Uint8Array | null,
    into: Uint8Array | null,
    kickX: number,
  ): void {
    if (n < MIN_CELLS || n * 2 > list.length) return;
    const W = grid.width;
    const H = grid.height;
    const mat = grid.material;
    if (this.seen.length < grid.size) this.seen = new Uint8Array(grid.size);
    const seen = this.seen;
    const settle = mats.settle;
    const lowest = (list[n - 1]! - (list[n - 1]! % W)) / W;
    // from the bottom up, so what is under a piece has already gone (or is staying)
    for (let k = n - 1; k >= 0 && this.bodies.length < MAX_CHUNKS; k--) {
      const start = list[k]!;
      if (mark[start] !== rel || mat[start] === 0) continue;
      if (this.seenGen === 255) {
        seen.fill(0);
        this.seenGen = 0;
      }
      const gen = ++this.seenGen;
      const sx = start % W;
      const big = into !== null;
      const block = blockOf(sx, (start - sx) / W, big);
      let head = n;
      let tail = n;
      list[tail++] = start;
      seen[start] = gen;
      let x0 = W;
      let x1 = -1;
      let y0 = H;
      let y1 = -1;
      let near = 255;
      let nearX = 0;
      while (head < tail) {
        const i = list[head++]!;
        const x = i % W;
        const y = (i - x) / W;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (dist && dist[i]! < near) {
          near = dist[i]!;
          nearX = x;
        }
        for (let q = 0; q < 4; q++) {
          const nx = q === 0 ? x - 1 : q === 1 ? x + 1 : x;
          const ny = q === 2 ? y - 1 : q === 3 ? y + 1 : y;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const j = ny * W + nx;
          if (mark[j] !== rel || seen[j] === gen || mat[j] === 0) continue;
          if (blockOf(nx, ny, big) !== block) continue;
          seen[j] = gen;
          list[tail++] = j;
        }
      }
      const c = tail - n;
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      let ok = c >= MIN_CELLS && w <= MAX_SIDE && h <= MAX_SIDE;
      // room to fall: two cells of air under every cell
      for (let q = n; q < tail && ok && !into; q++) {
        const i = list[q]!;
        for (let d = 1; d <= 2; d++) {
          const j = i + d * W;
          if (j >= grid.size) {
            ok = false;
            break;
          }
          const b = mat[j]!;
          if (b !== 0 && seen[j] !== gen && settle[b] !== SETTLE_GAS && settle[b] !== SETTLE_FLOW)
            ok = false;
        }
      }
      // decided either way: never looked at again
      for (let q = n; q < tail; q++) mark[list[q]!] = 0;
      if (!ok) continue;
      const body: Body = {
        w,
        h,
        mat: new Uint8Array(w * h),
        coat: new Uint8Array(w * h),
        state: new Uint8Array(w * h),
        shade: new Uint8Array(w * h),
        n: c,
        edge: new Int32Array(w * h),
        edgeN: 0,
        lcx: 0,
        lcy: 0,
        cx: 0,
        cy: 0,
        vx: 0,
        vy: 0,
        angle: 0,
        omega: 0,
        frac: 0,
        r: 0,
        age: 0,
        ground: 0,
        stuck: 0,
        hit: false,
        material: 0,
        into,
        wait: into ? 2 + 2 * Math.trunc((lowest - y1) / WALL_H) : 0,
        sx: 0,
        sy: 0,
      };
      let sumX = 0;
      let sumY = 0;
      for (let q = n; q < tail; q++) {
        const i = list[q]!;
        const x = i % W;
        const y = (i - x) / W;
        const l = (y - y0) * w + (x - x0);
        body.mat[l] = mat[i]!;
        body.coat[l] = grid.coating[i]!;
        body.state[l] = grid.cellState[i]!;
        body.shade[l] = grid.shadeOf(i);
        sumX += x - x0;
        sumY += y - y0;
        mat[i] = 0;
        grid.coating[i] = 0;
        grid.cellState[i] = 0;
        grid.fallVel[i] = 0;
        grid.group[i] = 0;
      }
      body.material = body.mat[((start - sx) / W - y0) * w + (sx - x0)]!;
      body.lcx = Math.trunc((sumX * FP) / c) + HALF;
      body.lcy = Math.trunc((sumY * FP) / c) + HALF;
      body.cx = x0 * FP + body.lcx;
      body.cy = y0 * FP + body.lcy;
      body.sx = body.cx;
      body.sy = body.cy;
      this.outline(body);
      const roll = mix(start, c);
      if (kickX >= 0) {
        // thrown clear of the blast that broke it, the nearer the harder
        const away = body.cx >= kickX * FP ? 1 : -1;
        const off = Math.abs(Math.trunc(body.cx / FP) - kickX);
        const push = Math.max(FP >> 3, FP - off * (FP >> 6)) + (roll & (FP / 4 - 1));
        body.vx = away * push;
        body.vy = -(push >> 1);
        body.omega = away * (300 + ((roll >>> 8) & 1023));
      } else if (near < 255) {
        // the end that was held drops last, so it turns away from where it broke
        const side = body.cx > nearX * FP + HALF ? 1 : -1;
        body.omega = side * (500 + (roll & 1023));
      } else body.omega = (roll & 511) - 256;
      this.bodies.push(body);
      grid.markDirty(x0, y0, x1, y1);
    }
  }

  /** Rebuild a piece's outline and reach from the cells it has. */
  private outline(body: Body): void {
    const { w, h, mat } = body;
    let e = 0;
    let far = 0;
    for (let y = 0, l = 0; y < h; y++) {
      for (let x = 0; x < w; x++, l++) {
        if (mat[l] === 0) continue;
        const dx = x * FP + HALF - body.lcx;
        const dy = y * FP + HALF - body.lcy;
        const d = Math.trunc((dx * dx + dy * dy) / (FP * FP));
        if (d > far) far = d;
        if (
          x === 0 ||
          y === 0 ||
          x === w - 1 ||
          y === h - 1 ||
          mat[l - 1] === 0 ||
          mat[l + 1] === 0 ||
          mat[l - w] === 0 ||
          mat[l + w] === 0
        )
          body.edge[e++] = l;
      }
    }
    body.edgeN = e;
    body.r = isqrt(far) + 2;
  }

  /**
   * Would the piece, with its centre at (cx, cy) and turned to `angle`, be inside solid ground?
   * Notes the grid cells it would be in (`hx`/`hy`, `hn` of them). Liquid and gas don't count.
   */
  private hits(grid: Grid, mats: MaterialTable, body: Body, cx: number, cy: number, a: number) {
    const W = grid.width;
    const H = grid.height;
    const mat = grid.material;
    const settle = mats.settle;
    const sin = sinDeci(a);
    const cos = cosDeci(a);
    const w = body.w;
    let n = 0;
    for (let k = 0; k < body.edgeN; k++) {
      const l = body.edge[k]!;
      const lx = l % w;
      const dx = lx * FP + HALF - body.lcx;
      const dy = ((l - lx) / w) * FP + HALF - body.lcy;
      const tx = Math.floor((cx + Math.trunc((dx * cos - dy * sin) / FP)) / FP);
      const ty = Math.floor((cy + Math.trunc((dx * sin + dy * cos) / FP)) / FP);
      if (tx < 0 || tx >= W || ty < 0) continue;
      if (ty < H) {
        const m = mat[ty * W + tx]!;
        if (m === 0 || settle[m] === SETTLE_GAS || settle[m] === SETTLE_FLOW) continue;
        // loose grains in the air (falling dirt) are swept aside
        if (settle[m] !== SETTLE_STATIC && ty + 1 < H) {
          if (grid.fallVel[ty * W + tx] !== 0) continue;
          const below = mat[(ty + 1) * W + tx]!;
          if (below === 0 || settle[below] === SETTLE_GAS) continue;
        }
      }
      if (n < HIT_CAP) {
        this.hx[n] = tx;
        this.hy[n] = ty;
        n++;
      }
    }
    this.hn = n;
    return n > 0;
  }

  /** The grid cells the piece covers now (`rx`/`ry`) and the local cell each shows (`rs`). */
  private raster(grid: Grid, body: Body): void {
    const W = grid.width;
    const H = grid.height;
    const sin = sinDeci(body.angle);
    const cos = cosDeci(body.angle);
    const pcx = Math.floor(body.cx / FP);
    const pcy = Math.floor(body.cy / FP);
    const tx0 = Math.max(0, pcx - body.r);
    const tx1 = Math.min(W - 1, pcx + body.r);
    const ty0 = Math.max(0, pcy - body.r);
    const ty1 = Math.min(H - 1, pcy + body.r);
    let n = 0;
    for (let ty = ty0; ty <= ty1; ty++) {
      const ry = ty * FP + HALF - body.cy;
      for (let tx = tx0; tx <= tx1; tx++) {
        const rx = tx * FP + HALF - body.cx;
        const lx = Math.floor((body.lcx + Math.trunc((rx * cos + ry * sin) / FP)) / FP);
        const ly = Math.floor((body.lcy + Math.trunc((ry * cos - rx * sin) / FP)) / FP);
        if (lx < 0 || ly < 0 || lx >= body.w || ly >= body.h) continue;
        const l = ly * body.w + lx;
        if (body.mat[l] === 0 || n >= RASTER_CAP) continue;
        this.rx[n] = tx;
        this.ry[n] = ty;
        this.rs[n] = l;
        n++;
      }
    }
    this.rn = n;
  }

  /** One tick for every piece in the air. */
  step(grid: Grid, mats: MaterialTable, gravity: number, debris: DebrisPool, fx: EffectSink): void {
    for (let b = 0; b < this.bodies.length; b++) {
      const body = this.bodies[b]!;
      if (this.move(grid, mats, gravity, debris, fx, body)) continue;
      this.land(grid, mats, debris, body);
      this.bodies.splice(b, 1);
      b--;
    }
  }

  /** Advance one piece; false once it has come to rest. */
  private move(
    grid: Grid,
    mats: MaterialTable,
    gravity: number,
    debris: DebrisPool,
    fx: EffectSink,
    body: Body,
  ): boolean {
    if (++body.age > MAX_AGE || body.n < 4) return false;
    // something filled the space it is in (another piece landed): rise out of it, or give up
    if (this.hits(grid, mats, body, body.cx, body.cy, body.angle)) {
      let k = 1;
      while (k <= 4 && this.hits(grid, mats, body, body.cx, body.cy - k * FP, body.angle)) k++;
      if (k > 4) return false;
      body.cy -= k * FP;
      body.vy = 0;
    }
    if (body.vy < 0 || !this.hits(grid, mats, body, body.cx, body.cy + FP, body.angle)) {
      return this.fly(grid, mats, gravity, debris, fx, body);
    }
    return this.tip(grid, mats, gravity, body);
  }

  /** Free fall, turning. */
  private fly(
    grid: Grid,
    mats: MaterialTable,
    gravity: number,
    debris: DebrisPool,
    fx: EffectSink,
    body: Body,
  ): boolean {
    body.vy = Math.min(MAX_FALL, body.vy + gravity);
    body.frac += body.omega;
    const da = Math.trunc(body.frac / 256);
    body.frac -= da * 256;
    const { cx, cy, vx, vy, angle } = body;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) / FP));
    let s = 1;
    for (; s <= n; s++) {
      const nx = cx + Math.trunc((vx * s) / n);
      const ny = cy + Math.trunc((vy * s) / n);
      const na = angle + Math.trunc((da * s) / n);
      if (this.hits(grid, mats, body, nx, ny, na)) break;
      body.cx = nx;
      body.cy = ny;
      body.angle = na;
    }
    if (s > n) {
      body.stuck = 0;
      return true;
    }
    if (s === 1) {
      // caught on something beside it: go on without the turn, then without the sideways drift
      const sx = cx + Math.trunc(vx / n);
      const sy = cy + Math.trunc(vy / n);
      if (da !== 0 && !this.hits(grid, mats, body, sx, sy, angle)) {
        body.cx = sx;
        body.cy = sy;
        body.omega = -Math.trunc(body.omega / 2);
        return true;
      }
      if (vx !== 0 && !this.hits(grid, mats, body, cx, sy, angle)) {
        body.cy = sy;
        body.vx = 0;
        body.omega = -Math.trunc(body.omega / 2);
        return true;
      }
      if (++body.stuck > STUCK) return false;
    }
    // touched down
    if (vy >= HARD && !body.hit) {
      body.hit = true;
      this.crumble(grid, debris, body, vy);
      fx.emit(
        'collapse',
        Math.floor(body.cx / FP),
        Math.floor(body.cy / FP) + (body.r >> 1),
        body.r,
        {
          cells: body.n,
          terrain: 1,
          material: body.material,
        },
      );
    }
    // what it had of sideways speed sets it rolling
    body.omega =
      Math.trunc(body.omega / 2) +
      Math.trunc((Math.trunc((vx * SPIN_UNIT) / FP) / Math.max(2, body.r)) * 2);
    body.vx = Math.trunc(vx / 2);
    body.vy = 0;
    return true;
  }

  /** On the ground: tip over the point it stands on, roll, or lie still. */
  private tip(grid: Grid, mats: MaterialTable, gravity: number, body: Body): boolean {
    if (++body.ground > MAX_GROUND) return false;
    // what holds it (the cells it would be in one row lower)
    let lo = this.hx[0]!;
    let hi = lo;
    for (let k = 1; k < this.hn; k++) {
      const x = this.hx[k]!;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    const inside = body.cx >= lo * FP - HALF && body.cx <= (hi + 1) * FP + HALF;
    if (inside && Math.abs(body.omega) < REST_SPIN) {
      // lying still: ground again, once what broke under it has had its turn
      if (body.age >= body.wait) return false;
      body.omega = 0;
      body.vx = 0;
      body.vy = 0;
      return true;
    }
    // the point it turns about: the outermost one on the side its weight is, else the one under it
    const want = body.cx < lo * FP ? lo : body.cx > (hi + 1) * FP ? hi : Math.floor(body.cx / FP);
    let px = this.hx[0]!;
    let py = this.hy[0]!;
    for (let k = 1; k < this.hn; k++) {
      const x = this.hx[k]!;
      const y = this.hy[k]!;
      const d = Math.abs(x - want) - Math.abs(px - want);
      if (d < 0 || (d === 0 && y < py)) {
        px = x;
        py = y;
      }
    }
    const pvx = px * FP + HALF;
    const pvy = py * FP;
    const dx = body.cx - pvx;
    const dy = body.cy - pvy;
    if (!inside) {
      const r2 = Math.trunc((dx * dx + dy * dy) / (FP * FP)) + Math.trunc((body.r * body.r) / 3);
      body.omega += Math.trunc(
        (Math.trunc((gravity * dx) / FP) * SPIN_UNIT) / (FP * Math.max(4, r2)),
      );
    }
    body.omega -= Math.trunc(body.omega / 12);
    body.frac += body.omega;
    let da = Math.trunc(body.frac / 256);
    body.frac -= da * 256;
    if (da === 0) return ++body.stuck <= STUCK;
    for (let attempt = 0; attempt < 2 && da !== 0; attempt++) {
      const sin = sinDeci(da);
      const cos = cosDeci(da);
      const nx = pvx + Math.trunc((dx * cos - dy * sin) / FP);
      const ny = pvy + Math.trunc((dx * sin + dy * cos) / FP);
      if (!this.hits(grid, mats, body, nx, ny, body.angle + da)) {
        body.vx = nx - body.cx;
        body.vy = Math.min(MAX_FALL, ny - body.cy);
        body.cx = nx;
        body.cy = ny;
        body.angle += da;
        body.stuck = 0;
        return true;
      }
      da = Math.trunc(da / 2);
    }
    // it can't turn that way: it rocks back, a little less each time
    body.omega = -Math.trunc(body.omega / 3);
    body.frac = 0;
    body.vx = 0;
    body.vy = 0;
    return ++body.stuck <= STUCK;
  }

  /** What local cell `l` of a piece is once it is ground again (0 = nothing). */
  private lands(body: Body, l: number): number {
    const m = body.mat[l]!;
    if (!body.into) return m;
    const b = body.into[m]!;
    return b === KEEP ? m : b;
  }

  /** A hard landing knocks some of the outline off as loose cells. */
  private crumble(grid: Grid, debris: DebrisPool, body: Body, speed: number): void {
    const sin = sinDeci(body.angle);
    const cos = cosDeci(body.angle);
    const w = body.w;
    const W = grid.width;
    let lost = 0;
    for (let k = 0; k < body.edgeN; k++) {
      const l = body.edge[k]!;
      const roll = mix(l + body.n * 131, Math.floor(body.cx / FP));
      if ((roll & 7) > 1) continue;
      const lx = l % w;
      const dx = lx * FP + HALF - body.lcx;
      const dy = ((l - lx) / w) * FP + HALF - body.lcy;
      const x = body.cx + Math.trunc((dx * cos - dy * sin) / FP);
      const y = body.cy + Math.trunc((dx * sin + dy * cos) / FP);
      if (x < 0 || x >= W * FP || y < 0) continue;
      const kick = (speed >> 2) + ((roll >>> 8) % (speed >> 1));
      const vx = (((roll >>> 3) & 1) === 0 ? 1 : -1) * ((roll >>> 16) % (speed >> 1));
      const m = this.lands(body, l);
      if (m !== 0 && !debris.spawn(x, y, vx, -kick, m, body.coat[l]!, 0, body.shade[l]!)) break;
      body.mat[l] = 0;
      lost++;
    }
    if (lost === 0) return;
    body.n -= lost;
    this.outline(body);
  }

  /** It came to rest: its cells are plain terrain again, where and how it lies. */
  private land(grid: Grid, mats: MaterialTable, debris: DebrisPool, body: Body): void {
    const W = grid.width;
    const mat = grid.material;
    const settle = mats.settle;
    this.raster(grid, body);
    // a piece of a prop that broke where it stood crumbles altogether; one that fell stays in one
    // piece and only its skin (two cells) breaks up
    const fell =
      Math.abs(body.cx - body.sx) + Math.abs(body.cy - body.sy) >= 3 * FP || body.angle !== 0;
    let skin: Uint8Array | null = null;
    if (body.into && fell) {
      skin = new Uint8Array(body.w * body.h);
      for (let k = 0; k < body.edgeN; k++) {
        const l = body.edge[k]!;
        const lx = l % body.w;
        skin[l] = 1;
        if (lx > 0) skin[l - 1] = 1;
        if (lx < body.w - 1) skin[l + 1] = 1;
        if (l >= body.w) skin[l - body.w] = 1;
        if (l + body.w < skin.length) skin[l + body.w] = 1;
      }
    }
    let x0 = W;
    let x1 = -1;
    let y0 = grid.height;
    let y1 = -1;
    for (let k = 0; k < this.rn; k++) {
      const x = this.rx[k]!;
      const y = this.ry[k]!;
      const l = this.rs[k]!;
      const i = y * W + x;
      const here = mat[i]!;
      const m = skin && skin[l] === 0 ? body.mat[l]! : this.lands(body, l);
      if (m === 0) continue;
      // what broke up lands loose (its state byte counts loosen steps), so it slumps into a heap
      const st = m === body.mat[l] ? body.state[l]! : mats.repose[m] !== 0 ? LAND_LOOSE : 0;
      if (here !== 0 && settle[here] !== SETTLE_GAS) {
        if (settle[here] === SETTLE_FLOW) {
          // liquid makes way: it goes to the nearest air above
          let up = i - W;
          let steps = 0;
          while (up >= 0 && steps < 64 && mat[up] !== 0) {
            up -= W;
            steps++;
          }
          if (up >= 0 && mat[up] === 0) {
            mat[up] = here;
            grid.coating[up] = grid.coating[i]!;
            grid.cellState[up] = grid.cellState[i]!;
            grid.shade[up] = grid.shade[i]!;
            grid.fallVel[up] = 0;
            if (y - steps - 1 < y0) y0 = y - steps - 1;
          }
        } else {
          // no room: that cell drops beside it as a loose one
          debris.spawn(x * FP + HALF, y * FP + HALF, 0, 0, m, body.coat[l]!, st, body.shade[l]!);
          continue;
        }
      }
      grid.gas[i] = 0;
      mat[i] = m;
      grid.coating[i] = body.coat[l]!;
      grid.cellState[i] = st;
      grid.shade[i] = body.shade[l]!;
      grid.fallVel[i] = 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 >= x0) grid.markDirty(x0, Math.max(0, y0), x1, y1);
  }

  /**
   * Hand the renderer the cells of every piece in the air: they are written after the pool's own
   * particles (which the pool ignores) and drawn like them. Returns the new count.
   */
  view(grid: Grid, pool: DebrisPool): number {
    let n = pool.count;
    for (let b = 0; b < this.bodies.length; b++) {
      const body = this.bodies[b]!;
      this.raster(grid, body);
      for (let k = 0; k < this.rn && n < DEBRIS_CAP; k++) {
        const l = this.rs[k]!;
        pool.x[n] = this.rx[k]! * FP + HALF;
        pool.y[n] = this.ry[k]! * FP + HALF;
        pool.vx[n] = 0;
        pool.mat[n] = body.mat[l]!;
        pool.shade[n] = body.shade[l]!;
        n++;
      }
    }
    return n;
  }

  hash(h: Hasher): void {
    if (this.bodies.length === 0) return;
    h.num(this.bodies.length);
    for (const b of this.bodies) {
      h.num(b.cx).num(b.cy).num(b.vx).num(b.vy).num(b.angle).num(b.omega).num(b.n);
    }
  }
}
