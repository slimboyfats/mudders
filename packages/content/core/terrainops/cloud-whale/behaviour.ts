import { ContentIdSchema, z } from '@mudders/shared';
import { DECI, FP, cosDeci, defineTerrainOp, sinDeci, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Weapon thrown down where it hits: its slam (the crater and shockwave). */
  slam: ContentIdSchema.refine((id) => id.startsWith('weapon.'), 'must be a weapon.* id'),
  /** What it bursts into, and the radius of the ball of it, cells. */
  material: ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id'),
  burst: z.number().int().min(0).max(80),
  /**
   * Released on the ground (the shell landed before its shooter let it go): it appears this many
   * rows above the spot instead, so it still has a drop.
   */
  lift: z.number().int().min(0).max(300),
  /** Ticks it hangs in the air as it pops out of the shell before it drops. */
  hang: z.number().int().min(0).max(120),
  /** Most it tips nose down as it falls, degrees, and degrees per tick it tips. */
  tilt: z.number().int().min(0).max(90),
  tiltRate: z.number().min(0).max(10),
  /** Top falling speed, cells/tick. */
  maxFall: z.number().min(1).max(20),
  /** Ticks after the slam it bursts. */
  burstAfter: z.number().int().min(0).max(60),
  /** Half its length and its belly depth below the centre, cells (where it hits from). */
  half: z.number().int().min(8).max(120),
  belly: z.number().int().min(2).max(60),
});
type Params = z.infer<typeof params>;

const FALL = 0;
const LANDED = 1;

// state: age, phase, x and y (FP), fall speed (FP), facing, pitch (deci-degrees), hit x, hit y
const AGE = 0;
const PHASE = 1;
const X = 2;
const Y = 3;
const VY = 4;
const DIR = 5;
const PITCH = 6;
const HX = 7;
const HY = 8;

/** Solid ground or a live tank at cell (x, y)? Off the bottom counts as ground. */
function hits(api: SimApi, x: number, y: number): boolean {
  const g = api.grid;
  if (y >= g.height) return true;
  if (x < 0 || x >= g.width || y < 0) return false;
  if (g.material[y * g.width + x] !== 0) return true;
  for (const t of api.tanks) {
    if (t.alive && x >= t.x - t.half && x <= t.x + t.half && y > t.y - t.h && y <= t.y) return true;
  }
  return false;
}

/** A ball of `cell` in the air cells around (cx, cy): what the whale bursts into. */
function deluge(api: SimApi, cell: number, cx: number, cy: number, r: number): number {
  const g = api.grid;
  const W = g.width;
  let n = 0;
  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(W - 1, cx + r);
  const y0 = Math.max(0, cy - r);
  const y1 = Math.min(g.height - 1, cy + r);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r * r || g.material[i] !== 0) continue;
      g.material[i] = cell;
      n++;
    }
  }
  if (n > 0) g.markDirty(x0, y0, x1, y1);
  return n;
}

/**
 * Cloud Whale: a whale made of storm cloud pops out of the shell wherever it is when its shooter
 * presses fire again (or a little above the spot where the shell lands, if they never do). It
 * hangs there a moment, then free-falls, tipping nose down, and where it hits ground or a tank it
 * throws down its `slam` weapon (crater, shockwave) and bursts into a ball of water that floods
 * the crater, puts out fires and quenches lava.
 *
 * Emits `whalePop` as it appears, `whale` every tick (x, y; dir, pitch in deci-degrees, phase,
 * age), and `whaleBurst` when it bursts.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.cloud-whale',
  version: 3,
  params,
  start(api, p, c) {
    const g = api.grid;
    let y = c.y;
    // let go on the ground: it appears up in the air above the spot
    const x = Math.max(0, Math.min(g.width - 1, c.x));
    if (g.surfaceY(x) - y < p.belly + 4) y = Math.max(p.belly + 2, y - p.lift);
    const shooter = api.tanks[c.owner];
    // it faces away from its shooter
    const dir = shooter && shooter.x > c.x ? -1 : 1;
    api.emit('whalePop', c.x, y, p.half, { dir });
    return [0, FALL, c.x * FP + (FP >> 1), y * FP, 0, dir, 0, c.x, y];
  },
  step(api, p, inst) {
    const d = inst.data;
    const c = inst.call;
    const age = d[AGE]! + 1;
    d[AGE] = age;
    const dir = d[DIR]!;
    if (d[PHASE] === FALL) {
      if (age > p.hang) {
        const vy = Math.min(Math.round(p.maxFall * FP), d[VY]! + api.gravity);
        d[VY] = vy;
        d[PITCH] = Math.min(p.tilt * DECI, d[PITCH]! + Math.round(p.tiltRate * DECI));
        // move a cell at a time so it can't pass through anything
        const steps = Math.max(1, Math.ceil(vy / FP));
        for (let s = 0; s < steps; s++) {
          const y = d[Y]! + Math.trunc(vy / steps);
          const cx = Math.floor(d[X]! / FP);
          const cy = Math.floor(y / FP);
          // its lowest points: the belly under its middle and its nose as it tips down
          const sn = sinDeci(d[PITCH]!);
          const cs = cosDeci(d[PITCH]!);
          const nx = cx + dir * Math.trunc((p.half * cs) / FP);
          const ny = cy + Math.trunc((p.half * sn) / FP) + Math.trunc((p.belly * cs) / (2 * FP));
          const by = cy + p.belly;
          let hx = -1;
          let hy = -1;
          if (hits(api, nx, ny)) {
            hx = nx;
            hy = ny;
          } else if (hits(api, cx, by)) {
            hx = cx;
            hy = by;
          } else if (hits(api, cx + dir * (p.half >> 1), by)) {
            hx = cx + dir * (p.half >> 1);
            hy = by;
          }
          if (hx >= 0) {
            const g = api.grid;
            hx = Math.max(0, Math.min(g.width - 1, hx));
            hy = Math.min(g.height - 1, hy);
            const slam = api.weaponByIndex(p.slam);
            if (slam >= 0) api.throwShell(slam, c.owner, hx * FP + (FP >> 1), (hy - 2) * FP, 0, FP);
            d[PHASE] = LANDED;
            d[HX] = hx;
            d[HY] = hy;
            d[AGE] = 0;
            return true;
          }
          d[Y] = y;
        }
      }
      api.emit('whale', Math.floor(d[X]! / FP), Math.floor(d[Y]! / FP), 0, {
        dir,
        pitch: d[PITCH]!,
        phase: age > p.hang ? 1 : 0,
        age,
        hang: p.hang,
      });
      // fell out of the bottom of the map
      if (Math.floor(d[Y]! / FP) > api.grid.height + p.half) return false;
      return true;
    }
    if (age < p.burstAfter) return true;
    const g = api.grid;
    const hx = d[HX]!;
    const sy = Math.min(g.height - 1, g.surfaceY(hx));
    const r = p.burst;
    const n = deluge(api, api.mats.cellOf(p.material), hx, Math.max(r + 1, sy - r - 2), r);
    api.emit('whaleBurst', hx, sy, r, { cells: n });
    return false;
  },
});
