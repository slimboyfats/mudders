import type { Grid } from './grid';
import { SETTLE_FLOW, type MaterialTable } from './materials';

/** Fixed point of heights and flows here: 1/256 cell. */
const ONE = 256;
/** Fixed point of speeds: 1/4096 column per substep. */
const V_SHIFT = 12;
const V_MAX = 2 << V_SHIFT;
/** Substeps per tick: a wave may cross this many columns a tick. */
const SUBSTEPS = 6;
/** Speed gained per substep is the height difference >> this. */
const GRAVITY_SHIFT = 2;
/** Speed lost per substep is speed >> this. */
const DAMP_SHIFT = 7;
/** Depth that carries flow, at most (keeps the scheme stable in deep lakes), in cells. */
const DEPTH_CAP = 16;
/** A surface standing a cell higher than the one beside it is at rest (a part-filled row). */
const DEAD_BAND = ONE;
/** How far up a bank a wave may throw water above its own surface, in cells. */
const RUN_UP = 2;
/** Below this speed, with nothing pushing, an interface is at rest. */
const REST_SPEED = 6;
/** Depth up to which liquid counts as a film. */
const FILM = 2 * ONE;
/**
 * A drop deeper than this beside a column is a fall: the column step leaves that edge alone,
 * and the liquid goes over it cell by cell (settle's own rules), as a waterfall.
 */
const FALL = 3;
/** Speed lost per substep whatever the speed. */
const FRICTION = 1;
/** Ticks without a whole cell crossing after which an edge counts as at rest. */
const IDLE_REST = 40;
/** A film on a slope slower than this (1/4096 column per substep) stops and stays. */
const STICK = 160;
/** A pool level to within a cell whose water moves slower than this everywhere is at rest. */
const CALM_SPEED = 96;
const CALM_RANGE = 2 * ONE;
/** A pass never leaves the taking column standing more than this over the giving one, in cells. */
const NEEDLE = 6;
/** This many falling cells standing on a column are a fall coming down on it, fewer are drops. */
const STREAM = 4;
/** Open water slower than this everywhere is only rippling out: a turn doesn't wait for it. */
const BUSY_SPEED = 400;
/** Most cells one interface passes in a tick. */
const MAX_PASS = 24;

let cap = 0;
/** Row of the first free cell over each column's liquid or bed, or -1 = takes no part. */
let free = new Int16Array(0);
/** Liquid in each column (0 = dry bed). */
let wet = new Uint8Array(0);
/** Surface height and depth of each column, fixed point, measured up from the map bottom. */
let eta = new Int32Array(0);
let depth = new Int32Array(0);
let flux = new Int32Array(0);
/** 1 = the column is in a pool that is level to within a cell (a part-filled top row): at rest. */
let calm = new Uint8Array(0);
/** 1 = the liquid of column x stands over a fall into x+1, 2 = that of x+1 over one into x. */
let cliff = new Uint8Array(0);
/** Row of what each column's liquid stands on (its surface row if dry). */
let bed = new Int16Array(0);
/** Row of each column's top cell at rest (under `capped`, a fall is coming down on it). */
let top = new Int16Array(0);
let capped = new Uint8Array(0);

/**
 * Open water as columns (a shallow-water step). Every column whose topmost matter is a runny
 * liquid resting on something is a column of that liquid; between neighbours the liquid has a
 * speed (`Grid.surfVel`, kept between ticks) that the difference in surface height drives and
 * drag wears down, and it carries `speed × depth` across. So a hump or a hole in a lake
 * spreads as waves that run to the banks, climb them, come back and die down; a lake whose
 * side is opened pours out with its whole depth; and a pool levels because it overshoots and
 * sloshes, not because cells trickle along its surface.
 *
 * The flow is done in whole cells off the top of one column onto the top of the next; the
 * fraction left over waits in `Grid.surfAcc`. Only the settle region's columns are looked at,
 * and a region with moving water in it stays alive (the turn's own grace bounds the wait).
 */
export function surfaceFlowStep(grid: Grid, mats: MaterialTable): void {
  grid.surfLive = false;
  grid.surfBusy = false;
  if (!grid.settling || grid.surfSeenMaxX < 0) return;
  const W = grid.width;
  const H = grid.height;
  if (cap < W) {
    cap = W;
    free = new Int16Array(W);
    wet = new Uint8Array(W);
    eta = new Int32Array(W);
    depth = new Int32Array(W);
    flux = new Int32Array(W);
    calm = new Uint8Array(W);
    cliff = new Uint8Array(W);
    bed = new Int16Array(W);
    top = new Int16Array(W);
    capped = new Uint8Array(W);
  }
  const mat = grid.material;
  const group = grid.group;
  const kind = mats.settle;
  const runny = mats.disperse;
  const sv = grid.surfVel;
  const fall = grid.fallVel;
  const acc = grid.surfAcc;
  const idle = grid.surfIdle;
  const x0 = Math.max(0, Math.max(grid.settleMinX, grid.surfSeenMinX) - SUBSTEPS - 1);
  const x1 = Math.min(W - 1, Math.min(grid.settleMaxX, grid.surfSeenMaxX) + SUBSTEPS + 1);
  if (x1 <= x0) return;

  // columns: the first thing under the sky that rests on something
  let any = false;
  for (let x = x0; x <= x1; x++) {
    let y = 0;
    let p = x;
    let m = 0;
    let found = false;
    let y0 = 0;
    while (!found && y < H) {
      while (y < H && mat[p] === 0) {
        y++;
        p += W;
      }
      if (y >= H) break;
      m = mat[p]!;
      if (kind[m] !== SETTLE_FLOW || runny[m]! <= 1 || group[p] !== 0) {
        m = 0;
        found = true;
        break;
      }
      // a fall of the liquid coming down on the column (STREAM cells or more of it, really
      // falling) is not the column yet, and caps it; a few drops on top are just its top
      y0 = y;
      while (y < H && mat[p] === m && fall[p]! > 1) {
        y++;
        p += W;
      }
      if (y - y0 < STREAM && y < H && mat[p] === m) {
        p -= (y - y0) * W;
        y = y0;
      }
      if (y >= H || mat[p] !== m) continue;
      capped[x] = y > y0 ? 1 : 0;
      // a run of this liquid at rest: a column if it stands on something, else it hangs
      let q = p;
      let d = 0;
      while (y + d < H && mat[q] === m && group[q] === 0) {
        d++;
        q += W;
      }
      if (y + d >= H || mat[q] !== 0) {
        found = true;
        depth[x] = (d > DEPTH_CAP ? DEPTH_CAP : d) * ONE;
        bed[x] = y + d;
        break;
      }
      y += d;
      p = q;
    }
    if (m === 0) {
      capped[x] = 0;
      bed[x] = y;
    }
    top[x] = y;
    if (!found) {
      free[x] = -1;
      wet[x] = 0;
      continue;
    }
    free[x] = (capped[x] !== 0 ? y0 : y) - 1;
    wet[x] = m;
    eta[x] = (H - y) * ONE;
    if (m === 0) depth[x] = 0;
    else any = true;
  }
  if (!any) {
    for (let x = x0; x <= x1; x++) {
      sv[x] = 0;
      acc[x] = 0;
      grid.surfTop[x] = -1;
    }
    return;
  }

  for (let x = x0; x < x1; x++) {
    const fa = free[x]!;
    const fb = free[x + 1]!;
    // a fall: the other column's top lies well below what this one's liquid stands on (a lip)
    cliff[x] =
      fa < 0 || fb < 0
        ? 0
        : wet[x] !== 0 && fb + 1 - bed[x]! > FALL
          ? 1
          : wet[x + 1] !== 0 && fa + 1 - bed[x + 1]! > FALL
            ? 2
            : 0;
  }
  cliff[x1] = 0;
  // pools (runs of columns of one liquid) that are level to within a cell are at rest: a
  // part-filled top row is as flat as cells get, and must not slosh for ever
  for (let x = x0; x <= x1;) {
    const m = free[x]! < 0 ? 0 : wet[x]!;
    let e = x;
    let lo = eta[x]!;
    let hi = lo;
    let fast = false;
    if (m !== 0) {
      while (e < x1 && free[e + 1]! >= 0 && wet[e + 1] === m) {
        const v = sv[e]!;
        if (v > CALM_SPEED || v < -CALM_SPEED) fast = true;
        e++;
        const h = eta[e]!;
        if (h < lo) lo = h;
        else if (h > hi) hi = h;
      }
    }
    // nearly level but still moving (2): only a step of more than a cell drives it, so the
    // last ripples die instead of chasing single cells round a pond for ever
    // (not a pool that runs out over a lip or onto lower dry ground beside it: that one drains)
    const open =
      cliff[e] === 1 ||
      (x > x0 && cliff[x - 1] === 2) ||
      (e < x1 && free[e + 1]! >= 0 && wet[e + 1] === 0 && top[e + 1]! - top[e]! > 1) ||
      (x > x0 && free[x - 1]! >= 0 && wet[x - 1] === 0 && top[x - 1]! - top[x]! > 1);
    const c = m !== 0 && !open && hi - lo <= CALM_RANGE ? (fast ? 2 : 1) : 0;
    for (let i = x; i <= e; i++) calm[i] = c;
    x = e + 1;
  }
  // the heights the cells show are whole; the fractions of a cell on their way between
  // columns (waiting in `acc`) belong to the surface too, so its shape carries over the ticks
  for (let x = x0; x < x1; x++) {
    const f = acc[x]!;
    if (f === 0 || calm[x] === 1 || wet[x] === 0 || wet[x] !== wet[x + 1]) continue;
    eta[x] = eta[x]! - f;
    eta[x + 1] = eta[x + 1]! + f;
  }

  // a little viscosity: each interface's speed is drawn towards its neighbours', which wears
  // down cell-sized chop (that the whole cells keep stirring up) and leaves long waves alone
  let pv = 0;
  let pw = false;
  for (let x = x0; x < x1; x++) {
    const v = sv[x]!;
    const w = wet[x] !== 0 && wet[x] === wet[x + 1] && free[x]! >= 0 && free[x + 1]! >= 0;
    if (w) {
      const l = pw ? pv : v;
      const r = x + 1 < x1 && wet[x + 2] === wet[x] && free[x + 2]! >= 0 ? sv[x + 1]! : v;
      const d = l + r - 2 * v;
      sv[x] = v + (d > 0 ? d >> 2 : -(-d >> 2));
    }
    pv = v;
    pw = w;
  }

  let liveMin = W;
  let busy = false;
  let liveMax = -1;
  for (let x = x0; x < x1; x++) flux[x] = acc[x]!;
  for (let s = 0; s < SUBSTEPS; s++) {
    for (let x = x0; x < x1; x++) {
      const a = wet[x]!;
      const b = wet[x + 1]!;
      // an interface works between two columns of one liquid, or a liquid and a dry bed
      if (
        free[x]! < 0 ||
        free[x + 1]! < 0 ||
        (a === 0 && b === 0) ||
        (a !== 0 && b !== 0 && a !== b)
      ) {
        sv[x] = 0;
        flux[x] = 0;
        continue;
      }
      const dh = eta[x]! - eta[x + 1]!;
      let v = sv[x]!;
      const c = cliff[x]!;
      if (c !== 0) {
        // over a lip: the liquid above it runs out freely, driven by its own depth
        if (c === 1) {
          v += depth[x]! >> GRAVITY_SHIFT;
          v -= v >> DAMP_SHIFT;
          if (v < 0) v = 0;
          else if (v > V_MAX) v = V_MAX;
        } else {
          v -= depth[x + 1]! >> GRAVITY_SHIFT;
          v += -v >> DAMP_SHIFT;
          if (v > 0) v = 0;
          else if (v < -V_MAX) v = -V_MAX;
        }
        sv[x] = v;
        continue;
      }
      if (a === b) {
        if (calm[x] === 1 && calm[x + 1] === 1) {
          sv[x] = 0;
          flux[x] = 0;
          continue;
        }
        if (
          dh < 2 * ONE &&
          dh > -2 * ONE &&
          depth[x]! <= FILM &&
          depth[x + 1]! <= FILM &&
          top[x]! < bed[x]! &&
          top[x + 1]! < bed[x + 1]! &&
          (bed[x] === bed[x + 1] || (v <= STICK && v >= -STICK))
        ) {
          // a film a cell or two deep on level ground lies still over a step of one cell (both
          // columns have cells of it: one only wet by this tick's flow is still a dry bed), and
          // on a slope it sticks once it has slowed (a sheet that runs keeps running)
          sv[x] = 0;
          flux[x] = 0;
          continue;
        }
        if (calm[x] === 2 && calm[x + 1] === 2) {
          if (dh > ONE) v += (dh - ONE) >> GRAVITY_SHIFT;
          else if (dh < -ONE) v -= (-dh - ONE) >> GRAVITY_SHIFT;
          v -= v > 0 ? v >> 4 : -(-v >> 4);
        } else v += dh > 0 ? dh >> GRAVITY_SHIFT : -(-dh >> GRAVITY_SHIFT);
      } else if (dh > DEAD_BAND) v += (dh - DEAD_BAND) >> GRAVITY_SHIFT;
      else if (dh < -DEAD_BAND) v -= (-dh - DEAD_BAND) >> GRAVITY_SHIFT;
      v -= v > 0 ? v >> DAMP_SHIFT : -(-v >> DAMP_SHIFT);
      // and a little friction that doesn't shrink with the speed, which ends the last ripples
      v = v > FRICTION ? v - FRICTION : v < -FRICTION ? v + FRICTION : 0;
      // nothing flows out of a dry bed, or up a bank that stands too far over the surface
      if (a !== b && (v > 0 ? a === 0 || -dh > RUN_UP * ONE : b === 0 || dh > RUN_UP * ONE)) v = 0;
      if (v > V_MAX) v = V_MAX;
      else if (v < -V_MAX) v = -V_MAX;
      sv[x] = v;
    }
    for (let x = x0; x < x1; x++) {
      const v = sv[x]!;
      if (v === 0) continue;
      const d = v > 0 ? depth[x]! : depth[x + 1]!;
      let f = v > 0 ? (v * d) >> V_SHIFT : -((-v * d) >> V_SHIFT);
      const lim = d >> 2;
      if (f > lim) f = lim;
      else if (f < -lim) f = -lim;
      flux[x] = flux[x]! + f;
      eta[x] = eta[x]! - f;
      eta[x + 1] = eta[x + 1]! + f;
      // depth follows, so a column can't give more than it has over the substeps, and a dry
      // bed that takes liquid is wet from then on (the front runs on within the tick)
      const up = f > 0 ? x : x + 1;
      const dn = f > 0 ? x + 1 : x;
      const g = f > 0 ? f : -f;
      depth[up] = depth[up]! - g < 0 ? 0 : depth[up]! - g;
      if (cliff[x] !== 0) {
        // what goes over the lip is out of the columns (it falls as cells)
        eta[dn] = eta[dn]! - g;
        continue;
      }
      depth[dn] = depth[dn]! + g > DEPTH_CAP * ONE ? DEPTH_CAP * ONE : depth[dn]! + g;
      if (wet[dn] === 0) wet[dn] = wet[up]!;
    }
  }

  // pass whole cells across each interface, top of one column to top of the next
  const coat = grid.coating;
  const state = grid.cellState;
  const shade = grid.shade;
  const vel = grid.fallVel;
  const fl = grid.flowVel;
  const act = mats.active;
  let minY = H;
  let maxY = -1;
  // how many whole cells each interface owes (flux[] from here on), the fraction waits
  let most = 0;
  for (let x = x0; x < x1; x++) {
    const f = flux[x]!;
    let v = sv[x]!;
    if (v !== 0) {
      // speed out of a column that has no cell of the liquid (it was only wet with a fraction
      // on its way through this tick) is nothing: it would keep the region awake for ever
      const from = v > 0 ? x : x + 1;
      const fy = top[from]!;
      const fm = fy < H ? mat[fy * W + from]! : 0;
      if (kind[fm] !== SETTLE_FLOW || runny[fm]! <= 1) {
        v = 0;
        sv[x] = 0;
      }
    }
    let n = f > 0 ? f >> 8 : -(-f >> 8);
    // an edge that no whole cell has crossed for a while only shifts fractions back and forth:
    // that is water at rest, however its speed flickers, and must not keep the region awake
    const id =
      n !== 0 || v > BUSY_SPEED || v < -BUSY_SPEED ? 0 : idle[x]! < 255 ? idle[x]! + 1 : 255;
    idle[x] = id;
    if (id < IDLE_REST && (v > REST_SPEED || v < -REST_SPEED)) {
      if (v > BUSY_SPEED || v < -BUSY_SPEED) busy = true;
      if (x < liveMin) liveMin = x;
      if (x + 1 > liveMax) liveMax = x + 1;
    }
    if (n > MAX_PASS) n = MAX_PASS;
    else if (n < -MAX_PASS) n = -MAX_PASS;
    acc[x] = n === 0 && (f >= ONE || f <= -ONE) ? 0 : f - n * ONE;
    flux[x] = n;
    if (n > most) most = n;
    else if (-n > most) most = -n;
  }
  // A cell at a time, round by round: in each round every interface passes one cell, the
  // rightward ones left to right and the leftward ones right to left. So a column in a stream
  // gets one and gives one (the stream runs through it without piling up), and a column has
  // what came in upstream before it gives downstream.
  for (let round = 0; round < most; round++) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = x0; i < x1; i++) {
        const x = pass === 0 ? i : x1 - 1 - (i - x0);
        const n = flux[x]!;
        if (pass === 0 ? n <= 0 : n >= 0) continue;
        const from = n > 0 ? x : x + 1;
        const to = n > 0 ? x + 1 : x;
        const sy = top[from]!;
        const ty = free[to]!;
        const src = sy * W + from;
        const m = sy < H ? mat[src]! : 0;
        if (kind[m] !== SETTLE_FLOW || runny[m]! <= 1 || group[src] !== 0) {
          flux[x] = 0;
          continue;
        }
        flux[x] = n > 0 ? n - 1 : n + 1;
        let dst: number;
        const over = cliff[x] !== 0;
        if (over) {
          // over a lip: out beside where it was, with the flow's speed (in settle's 1/8
          // cells per tick); settle carries it on in an arc
          dst = src + (to - from);
          if (mat[dst] !== 0) {
            flux[x] = 0;
            continue;
          }
        } else {
          // never onto a column that already stands well over this one (no needles)
          if (ty < sy - NEEDLE) {
            flux[x] = 0;
            continue;
          }
          dst = ty * W + to;
          if (ty >= 0 && mat[dst] === m && group[dst] === 0) {
            // a drop of the same liquid in the way joins the column
            free[to] = ty - 1;
            top[to] = ty;
            flux[x] = n;
            continue;
          }
          if (ty < 0 || mat[dst] !== 0) {
            // nowhere to put it (a roof over the column): the flow stops there
            flux[x] = 0;
            sv[x] = 0;
            acc[x] = 0;
            continue;
          }
        }
        mat[dst] = m;
        mat[src] = 0;
        coat[dst] = coat[src]!;
        coat[src] = 0;
        state[dst] = state[src]!;
        state[src] = 0;
        shade[dst] = grid.shadeOf(src);
        vel[src] = 0;
        fl[src] = 0;
        if (over) {
          const va = sv[x]! < 0 ? -sv[x]! : sv[x]!;
          let spill = (va * SUBSTEPS * 8) >> V_SHIFT;
          if (spill < 8) spill = 8;
          else if (spill > runny[m]! * 8) spill = runny[m]! * 8;
          vel[dst] = 1;
          fl[dst] = n < 0 ? -spill : spill;
        } else {
          vel[dst] = 0;
          fl[dst] = 0;
          if (grid.gas[dst] !== 0) {
            grid.gas[src] = grid.gas[dst]!;
            grid.gas[dst] = 0;
            grid.extendGas(from, sy);
          }
          free[to] = ty - 1;
          top[to] = ty;
          if (ty < minY) minY = ty;
          if (ty > maxY) maxY = ty;
        }
        top[from] = sy + 1;
        if (capped[from] === 0) free[from] = sy;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
        if (act[m] !== 0 || mats.decayTurns[m] !== 0)
          grid.extendReact(x - 1, sy - 1, x + 2, sy + 1);
        if (x < liveMin) liveMin = x;
        if (x + 1 > liveMax) liveMax = x + 1;
      }
    }
  }
  // settle leaves the top cells of these columns to this step
  const st = grid.surfTop;
  for (let x = x0; x <= x1; x++) {
    const fy = top[x]!;
    st[x] =
      free[x]! >= -1 && fy < H && capped[x] === 0 && wet[x] !== 0 && mat[fy * W + x] === wet[x]
        ? fy
        : -1;
  }
  for (let x = x0; x < x1; x++) {
    const c = cliff[x]!;
    if (c !== 0) st[c === 1 ? x : x + 1] = -1;
  }
  grid.surfLive = liveMax >= liveMin;
  grid.surfBusy = busy;
  if (grid.surfLive) {
    let low = maxY;
    for (let x = liveMin; x <= liveMax; x++) if (free[x]! + 1 > low) low = free[x]! + 1;
    grid.surfMinX = liveMin - 1;
    grid.surfMaxX = liveMax + 1;
    grid.surfMaxY = low + 1;
    grid.extendSettle(liveMin - 1, liveMax + 1, low + 1);
  }
  if (maxY >= 0) {
    grid.addRenderRect(liveMin, minY, liveMax - liveMin + 1, maxY - minY + 1);
    grid.extendStruct(liveMin, minY, liveMax, maxY);
  }
}

/**
 * A push on the open water at column `x` towards `d` (liquid running or pouring into a pool
 * hands its speed over): `amount` in 1/8 cells per tick, as `Grid.flowVel` keeps it.
 */
export function pushSurface(grid: Grid, x: number, d: number, amount: number): void {
  const i = d > 0 ? x : x - 1;
  if (i < 0 || i >= grid.width - 1) return;
  const v = grid.surfVel[i]! + d * amount * PUSH_GAIN;
  grid.surfVel[i] = v > V_MAX ? V_MAX : v < -V_MAX ? -V_MAX : v;
}
const PUSH_GAIN = 16;
