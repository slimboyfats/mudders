import { z } from '@mudders/shared';
import { defineTerrainOp, type SimApi, type TankHandle } from '@mudders/sim';
import { blocked, footing } from '../bumper/behaviour';

const params = z.strictObject({
  /** Ticks a tank takes to break apart into pixels before it jumps. */
  out: z.number().int().min(1).max(120),
  /** Ticks it takes to pull itself back together where it comes out. */
  in: z.number().int().min(1).max(120),
  /**
   * `self`: the shooter jumps to where the shell went off. `swap`: the shooter and the tank the
   * shot hit trade places.
   */
  mode: z.enum(['self', 'swap']),
  /** Swap: how far from the hit cell (beyond its hull) a tank still counts as hit. */
  hitReach: z.number().int().min(0).max(40).default(6),
  /** Gap kept to another tank sitting on the spot a tank jumps to, cells. */
  gap: z.number().int().min(0).max(20).default(3),
});
type Params = z.infer<typeof params>;

// data: [age, count, ...per jumper: player, fromX, fromY, toX, toY]
const AGE = 0;
const COUNT = 1;
const JUMPERS = 2;
const SLOT = 5;
/** Highest a jump target is lifted to get clear of the ground, cells. */
const MAX_LIFT = 240;

/** The tank the shot hit: the nearest live tank (not the shooter) whose hull is in reach. */
function hitTank(api: SimApi, x: number, y: number, owner: number, reach: number): number {
  let best = -1;
  let bestD = Infinity;
  for (const t of api.tanks) {
    if (!t.alive || t.player === owner) continue;
    const dx = Math.max(0, Math.abs(x - t.x) - t.half);
    const top = t.y - t.h;
    const dy = y < top ? top - y : y > t.y ? y - t.y : 0;
    if (dx > reach || dy > reach) continue;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = t.player;
    }
  }
  return best;
}

/**
 * Where tank `t` stands when it comes out at column x near row y: clear of the ground (lifted out
 * of a hill), set down on the first ground below, inside the map, and not on top of another tank
 * (it steps aside, towards `from`).
 */
export function landing(
  api: SimApi,
  t: TankHandle,
  x: number,
  y: number,
  from: number,
  gap: number,
  skip: number,
): [number, number] {
  const g = api.grid;
  const lo = t.half;
  const hi = g.width - 1 - t.half;
  x = Math.max(lo, Math.min(hi, x));
  for (const o of api.tanks) {
    if (!o.alive || o.player === t.player || o.player === skip) continue;
    const room = t.half + o.half + gap;
    if (Math.abs(o.x - x) >= room || Math.abs(o.y - y) > o.h + t.h) continue;
    let nx = from <= o.x ? o.x - room : o.x + room;
    if (nx < lo || nx > hi) nx = from <= o.x ? o.x + room : o.x - room;
    x = Math.max(lo, Math.min(hi, nx));
  }
  y = Math.max(t.h, Math.min(g.height - 1, y));
  for (let k = 0; k < MAX_LIFT && y > t.h && blocked(api, t, x, y); k++) y--;
  while (y < g.height - 1 && !footing(api, t, x, y) && !blocked(api, t, x, y + 1)) y++;
  return [x, y];
}

/**
 * Warp (weapon.teleport-shell, weapon.swap-ray): tanks break apart into pixels where they stand
 * and pull back together somewhere else. `self` sends the shooter to where its shell went off;
 * `swap` makes the shooter and the tank the shot hit trade places (a miss fizzles). The tank comes
 * out on the ground at the far end, stepping aside if another tank is already there; no fall
 * damage. A glued tank can't be picked up, so a warp that needs one fizzles. No terrain is touched.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.warp',
  version: 1,
  params,
  start(api, p, c) {
    const me = api.tanks[c.owner];
    if (!me?.alive) return null;
    const d = [0, 0];
    const add = (t: TankHandle, x: number, y: number) => {
      d.push(t.player, t.x, t.y, x, y);
      d[COUNT] = d[COUNT]! + 1;
    };
    let other: TankHandle | undefined;
    if (p.mode === 'self') {
      add(me, c.x, c.y);
    } else {
      const hit = hitTank(api, c.x, c.y, c.owner, p.hitReach);
      other = hit >= 0 ? api.tanks[hit] : undefined;
      if (other) {
        add(me, other.x, other.y);
        add(other, me.x, me.y);
      }
    }
    if (d[COUNT] === 0 || me.glue > 0 || (other && other.glue > 0)) {
      api.emit('warpFizzle', c.x, c.y, 6, { player: c.owner });
      return null;
    }
    for (let k = 0; k < d[COUNT]!; k++) {
      const b = JUMPERS + k * SLOT;
      const t = api.tanks[d[b]!]!;
      api.emit('warpOut', t.x, t.y - (t.h >> 1), t.half, {
        player: t.player,
        ticks: p.out,
        tx: d[b + 3]!,
        ty: d[b + 4]! - (t.h >> 1),
      });
    }
    return d;
  },
  step(api, p, inst) {
    const d = inst.data;
    const age = d[AGE]!;
    const n = d[COUNT]!;
    const swap = n > 1;
    for (let k = 0; k < n; k++) {
      const b = JUMPERS + k * SLOT;
      const t = api.tanks[d[b]!];
      if (!t?.alive) continue;
      if (age < p.out) {
        // breaking apart: it stays put
        api.hold(t.player, d[b + 1]!, d[b + 2]!);
        continue;
      }
      if (age === p.out) {
        // swapping tanks may sit where the other stood, so neither steps aside for the other
        const partner = swap ? d[JUMPERS + (1 - k) * SLOT]! : -1;
        const [x, y] = landing(api, t, d[b + 3]!, d[b + 4]!, d[b + 1]!, p.gap, partner);
        d[b + 3] = x;
        d[b + 4] = y;
        api.emit('warpIn', x, y - (t.h >> 1), t.half, { player: t.player, ticks: p.in });
      }
      api.hold(t.player, d[b + 3]!, d[b + 4]!, d[b + 4]!);
    }
    d[AGE] = age + 1;
    return age + 1 < p.out + p.in;
  },
});
