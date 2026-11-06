import { z } from '@mudders/shared';
import { FP, defineFlight, toFixed, type Projectile, type SimApi } from '@mudders/sim';
import { ballisticStep, cellX, cellY, placeAt, solidAt } from '../../../src/flight';

const params = z.strictObject({
  gravityScale: z.number().min(0).max(10),
  windScale: z.number().min(-10).max(10),
  maxTicks: z.number().int().min(1),
  /** Cells per tick along the ground while burrowing (keep it below the tunnel's carve radius). */
  speed: z.number().min(0.25).max(4),
  /** Rows under the surface it runs at. */
  depth: z.number().int().min(2).max(40),
  /** Most rows per tick it climbs or dives to keep its depth as the ground rises and falls. */
  climb: z.number().min(0.1).max(4),
  /** Ticks it burrows before it gives up and surfaces where it is. */
  length: z.number().int().min(1).max(1200),
  /** Cells per tick on the way up to the surface. */
  riseSpeed: z.number().min(0.5).max(6),
  /** Rows above the torpedo it looks for an enemy tank to come up under. */
  sense: z.number().int().min(4).max(200),
});
type Params = z.infer<typeof params>;

// data: [mode, dir, target, run]; mode 0 = flying
const BURROW = 1;
const RISE = 2;

/** First air row above (x, y) in this column within `max` rows, or -1. */
function airAbove(api: SimApi, x: number, y: number, max: number): number {
  for (let k = 1; k <= max; k++) {
    if (!solidAt(api, x, y - k)) return y - k;
  }
  return -1;
}

/** The nearest living enemy tank right above the torpedo (within the middle half of the hull), or -1. */
function tankAbove(api: SimApi, owner: number, x: number, y: number, sense: number): number {
  const team = api.tanks[owner]?.team ?? owner;
  let best = -1;
  let bestDy = sense + 1;
  for (const t of api.tanks) {
    if (!t.alive || t.team === team) continue;
    const reach = Math.max(1, t.half >> 1);
    if (x < t.x - reach || x > t.x + reach) continue;
    const dy = y - t.y;
    if (dy < 0 || dy > sense || dy >= bestDy) continue;
    best = t.player;
    bestDy = dy;
  }
  return best;
}

/** Turn straight up, at `target` (a player, or -1 to just break out). */
function startRise(proj: Projectile, p: Params, target: number): void {
  proj.data[0] = RISE;
  proj.data[2] = target;
  proj.vx = 0;
  proj.vy = -toFixed(p.riseSpeed);
  proj.y += proj.vy;
}

/**
 * Drill torpedo (§5.1): flies an arc, then burrows on along the ground the way it was heading,
 * a few rows under the surface, following the ground up and down. The moment it passes under an
 * enemy tank it turns and drills straight up, going off right under the hull. It runs out of
 * steam after `length` ticks and surfaces where it is. The weapon's `pulse` cuts the tunnel (and
 * heaves the ground above it); the flight itself only moves, so the AI's predictor can run it.
 */
export default defineFlight<Params>({
  kind: 'flight',
  id: 'flight.drill-torpedo',
  version: 1,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    const mode = proj.data[0];
    if (mode !== BURROW && mode !== RISE) {
      ballisticStep(api, proj, p.gravityScale, p.windScale);
      return undefined;
    }
    const x = cellX(proj);
    const y = cellY(proj);
    if (mode === RISE) {
      const target = proj.data[2]!;
      const t = target >= 0 ? api.tanks[target] : undefined;
      // under a tank: go off just beneath its tracks; otherwise break out into the open
      if (t?.alive && y <= t.y) return 'impact';
      if (!(t?.alive ?? false) && y >= 1 && !solidAt(api, x, y) && !solidAt(api, x, y - 1)) {
        return 'impact';
      }
      if (y <= 0) return 'impact';
      proj.y += proj.vy;
      return 'pulse';
    }
    // burrowing
    const run = proj.data[3]! + 1;
    proj.data[3] = run;
    const under = tankAbove(api, proj.owner, x, y, p.sense);
    if (under >= 0) {
      startRise(proj, p, under);
      return 'pulse';
    }
    if (run >= p.length) {
      startRise(proj, p, -1);
      return 'pulse';
    }
    const dir = proj.data[1]!;
    const nx = x + dir;
    // keep `depth` rows of ground overhead, measured in the column ahead
    const air = airAbove(api, nx, y, p.depth * 3);
    const want = air < 0 ? y : air + 1 + p.depth;
    const climb = toFixed(p.climb);
    const dy = (want - y) * FP;
    proj.vy = Math.max(-climb, Math.min(climb, dy));
    proj.vx = dir * toFixed(p.speed);
    proj.x += proj.vx;
    proj.y += proj.vy;
    return 'pulse';
  },
  contact(_api, proj, _p, hit) {
    if (hit.tank >= 0) return 'impact';
    if (proj.data[0] === BURROW || proj.data[0] === RISE) {
      // the tunnel didn't clear this cell (rock, a bunker): blow up against it
      return 'impact';
    }
    placeAt(proj, hit.x, hit.y);
    const dir = proj.vx < 0 ? -1 : 1;
    proj.vx = 0;
    proj.vy = 0;
    proj.data.length = 0;
    proj.data.push(BURROW, dir, -1, 0);
    return 'pulse';
  },
});
