import { FP, z } from '@mudders/shared';
import { defineFlight, type SimApi } from '@mudders/sim';
import { lureNear } from '../../../src/flight';

const params = z.strictObject({
  maxTicks: z.number().int().min(1),
  /** Cells the orb climbs above where it was spawned, over `riseTicks`. */
  rise: z.number().int().min(0).max(200),
  riseTicks: z.number().int().min(1).max(120),
  /** Bob height in cells (a slow triangle wave while it hovers). */
  bob: z.number().int().min(0).max(20),
  /** Drift toward the nearest enemy while hovering, in 1/16 cells per tick (0 = stays put). */
  drift: z.number().int().min(0).max(64),
  /** Arc reach in cells (orb to tank middle), damage per zap, and ticks between zaps. */
  reach: z.number().int().min(4).max(400),
  zapDamage: z.number().int().min(0).max(200),
  zapEvery: z.number().int().min(1).max(120),
});
type Params = z.infer<typeof params>;

// data: [spawn x (fixed), spawn y (fixed), x (1/16 cells, for slow drift)]
const SY = 1;
const DX = 2;

/** Nearest live tank not on the owner's team, within `reach` of (x, y); -1 if none. */
function nearest(
  tanks: readonly {
    player: number;
    team: number;
    alive: boolean;
    x: number;
    y: number;
    h: number;
  }[],
  team: number,
  x: number,
  y: number,
  reach: number,
): number {
  let best = -1;
  let bd = reach * reach + 1;
  for (const t of tanks) {
    if (!t.alive || t.team === team) continue;
    const dx = t.x - x;
    const dy = t.y - (t.h >> 1) - y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = t.player;
    }
  }
  return best;
}

/** Squared distance from (x, y) to tank `i`'s centre. */
function d2(api: SimApi, i: number, x: number, y: number): number {
  const t = api.tanks[i]!;
  const dx = t.x - x;
  const dy = t.y - (t.h >> 1) - y;
  return dx * dx + dy * dy;
}

/**
 * Plasma Orb (weapon.plasma-orb-core): the orb climbs out of the impact, then hangs in the air,
 * bobbing and creeping toward the nearest enemy, and every `zapEvery` ticks lashes the nearest
 * enemy tank in reach with an arc (`zapDamage`, soaked by shields). Its timer trigger then bursts
 * it where it hangs. Passes through anything it touches (it never goes off by contact).
 */
export default defineFlight<Params>({
  kind: 'flight',
  id: 'flight.plasma-orb',
  version: 2,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    const d = proj.data;
    if (d.length === 0) d.push(proj.x, proj.y, Math.trunc((proj.x * 16) / FP));
    proj.vx = 0;
    proj.vy = 0;
    const age = proj.age;
    const owner = api.tanks[proj.owner];
    const team = owner ? owner.team : -1;
    const g = api.grid;
    if (age < p.riseTicks) {
      // ease out: fast off the ground, slowing into the hover
      const k = p.riseTicks - age;
      const left = Math.trunc((p.rise * k * k * FP) / (p.riseTicks * p.riseTicks));
      proj.y = d[SY]! - p.rise * FP + left;
    } else {
      const ph = (age - p.riseTicks) % 64;
      const tri = ph < 32 ? ph - 16 : 48 - ph;
      proj.y = d[SY]! - p.rise * FP + Math.trunc((tri * p.bob * FP) / 16);
      const cx = Math.floor(proj.x / FP);
      const cy = Math.floor(proj.y / FP);
      const tgt = nearest(api.tanks, team, cx, cy, g.width);
      // a decoy draws it unless a real tank is less than half as far
      const lure = lureNear(api, team, cx, cy, g.width);
      const goLure = lure !== null && (tgt < 0 || lure.d2 <= d2(api, tgt, cx, cy) * 4);
      const gx = goLure ? lure.x : tgt >= 0 ? api.tanks[tgt]!.x : -1;
      if (p.drift > 0 && gx >= 0) {
        const dir = gx > cx + 2 ? 1 : gx < cx - 2 ? -1 : 0;
        const nx16 = d[DX]! + dir * p.drift;
        const nx = nx16 >> 4;
        // creeps through the air only: a hillside in the way stops it
        if (
          nx >= 0 &&
          nx < g.width &&
          cy >= 0 &&
          cy < g.height &&
          g.material[cy * g.width + nx] === 0
        ) {
          d[DX] = nx16;
          proj.x = Math.trunc((nx16 * FP) / 16);
        }
      }
      if ((age - p.riseTicks) % p.zapEvery === 0) {
        const hit = nearest(api.tanks, team, cx, cy, p.reach);
        const bait = lureNear(api, team, cx, cy, p.reach);
        if (bait && (hit < 0 || bait.d2 <= d2(api, hit, cx, cy) * 4)) {
          api.hurtLure(bait.index, p.zapDamage, proj.owner);
          api.emit('plasmaZap', cx, cy, p.reach, { tx: bait.x, ty: bait.y, player: -1 });
        } else if (hit >= 0) {
          const t = api.tanks[hit]!;
          api.hurt(hit, p.zapDamage, proj.owner);
          api.emit('plasmaZap', cx, cy, p.reach, { tx: t.x, ty: t.y - (t.h >> 1), player: hit });
        }
      }
    }
    const cx = Math.floor(proj.x / FP);
    const cy = Math.floor(proj.y / FP);
    api.emit('plasmaOrb', cx, cy, p.reach, { age, life: p.maxTicks });
  },
  contact() {
    return 'continue';
  },
});
