import { ContentIdSchema, z } from '@mudders/shared';
import {
  damageTypeIndex,
  defineTerrainOp,
  type OpCall,
  type OpInstance,
  type SimApi,
} from '@mudders/sim';
import volcano, { type Params as VolcanoParams } from '../volcano/behaviour';

const materialId = ContentIdSchema.refine(
  (id) => id.startsWith('material.'),
  'must be a material.* id',
);

const params = z.strictObject({
  cone: materialId,
  lava: materialId,
  /** Cone: half-width at the foot, height at the rim, crater half-width and depth, cells. */
  radius: z.number().int().min(8).max(120),
  height: z.number().int().min(4).max(120),
  craterRadius: z.number().int().min(1).max(30),
  craterDepth: z.number().int().min(1).max(30),
  /** Keep the vent at least this many columns from every tank and from the map edges. */
  clear: z.number().int().min(0).max(400),
  margin: z.number().int().min(0).max(400),
  /** Turns between eruptions: the first after `first` turns, then every `every[0]`–`every[1]`. */
  first: z.number().int().min(1).max(40),
  every: z.tuple([z.number().int().min(1).max(40), z.number().int().min(1).max(40)]),
  /** Eruption: ticks it lasts, lava cells spat and poured per tick, launch speeds (cells/tick). */
  ticks: z.number().int().min(1).max(240),
  rate: z.number().int().min(0).max(64),
  pour: z.number().int().min(0).max(16),
  minSpeed: z.number().min(0.2).max(10),
  maxSpeed: z.number().min(0.2).max(10),
  spread: z.number().min(0).max(6),
  /** Shake of the rumble a turn before it blows, and of the eruption itself. */
  rumble: z.number().min(0).max(4),
});
type Params = z.infer<typeof params>;

function grow(p: Params): VolcanoParams {
  return {
    mode: 'grow',
    cone: p.cone,
    lava: p.lava,
    height: p.height,
    craterRadius: p.craterRadius,
    craterDepth: p.craterDepth,
    ticks: 40,
    rate: 0,
    pour: 0,
    minSpeed: p.minSpeed,
    maxSpeed: p.maxSpeed,
    spread: p.spread,
  };
}

function erupt(p: Params): VolcanoParams {
  return { ...grow(p), mode: 'erupt', ticks: p.ticks, rate: p.rate, pour: p.pour };
}

/** Data slots. */
const VENT = 0;
const NEXT = 1;
const LAST = 2;
const ERUPT_T = 3;

/** Top row of real ground in column x: the first solid cell that isn't part of a prop. */
function groundY(api: SimApi, x: number): number {
  const g = api.grid;
  const W = g.width;
  for (let y = g.surfaceY(x), i = y * W + x; y < g.height; y++, i += W) {
    if (g.material[i] !== 0 && g.group[i] === 0) return y;
  }
  return g.height;
}

/**
 * The highest open ground clear of every tank and the edges, so the cone rises on a hilltop where
 * it can be seen. Measured on real ground, not on the roof of a rock arch or a building. -1 when
 * the map has no such spot.
 */
function pickVent(api: SimApi, p: Params): number {
  const g = api.grid;
  let best = -1;
  let bestY = g.height;
  for (let x = p.margin; x < g.width - p.margin; x += 4) {
    let near = false;
    for (const t of api.tanks) if (t.alive && Math.abs(t.x - x) < p.clear) near = true;
    if (near) continue;
    const y = groundY(api, x);
    if (y < bestY) {
      bestY = y;
      best = x;
    }
  }
  return best;
}

/** Props (arches, houses) standing where the cone will rise are pushed out of its way. */
function clearProps(api: SimApi, x: number, half: number): void {
  const g = api.grid;
  const W = g.width;
  const x0 = Math.max(0, x - half);
  const x1 = Math.min(W - 1, x + half);
  let minY = g.height;
  let maxY = -1;
  for (let cx = x0; cx <= x1; cx++) {
    const ground = groundY(api, cx);
    for (let y = g.surfaceY(cx), i = y * W + cx; y < ground; y++, i += W) {
      if (g.group[i] === 0) continue;
      g.leaveGroup(i);
      g.material[i] = 0;
      g.cellState[i] = 0;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxY >= 0) g.markDirty(x0, minY, x1, maxY);
}

function nested(call: OpCall, t: number, data: number[]): OpInstance {
  return { op: -1, call, t, data };
}

/**
 * A rumbling volcano (map event, Badlands). On a fresh map a cinder cone rises on the highest
 * hilltop clear of the tanks, its crater full of lava. Every few turns it wakes: at the start of
 * the turn before, the ground rumbles (a warning shake and a `rumble` event the HUD names), and
 * at the start of the next it erupts, spitting real lava high into the air that rains down, runs
 * downhill, burns tanks sitting in it and cools to rock (the Volcano Seed's eruption). It never
 * holds up a turn and lasts the round.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.rumbling-volcano',
  version: 1,
  params,
  start(api, p) {
    const x = pickVent(api, p);
    if (x < 0) return null;
    clearProps(api, x, p.radius + 6);
    const call: OpCall = { ...callAt(x, p), y: api.grid.surfaceY(x) };
    const gp = grow(p);
    // the cone is part of the map: it rises in full before the first turn
    const d = volcano.start(api, gp, call);
    if (d)
      for (let t = 1; t <= 2 * gp.ticks; t++)
        if (!volcano.step?.(api, gp, nested(call, t, d))) break;
    return [x, api.turn + p.first, api.turn, -1];
  },
  step(api, p, inst) {
    const d = inst.data;
    const x = d[VENT]!;
    const call: OpCall = { ...callAt(x, p), y: api.grid.surfaceY(x) };
    if (api.turn !== d[LAST]) {
      d[LAST] = api.turn;
      const next = d[NEXT]!;
      if (api.turn === next - 1) {
        // a turn's warning: the ground shakes and the crater smokes
        api.emit('rumble', x, call.y, p.radius, { strength: p.rumble, turns: 1 });
        api.emit('shake', x, call.y, p.radius, { strength: p.rumble * 0.5 });
      } else if (api.turn >= next) {
        api.emit('rumble', x, call.y, p.radius, { strength: p.rumble, turns: 0 });
        api.emit('shake', x, call.y, p.radius, { strength: p.rumble });
        volcano.start(api, erupt(p), call);
        d[ERUPT_T] = 0;
        d[NEXT] = api.turn + api.rng.range(p.every[0], Math.max(p.every[0], p.every[1]));
      }
    }
    if (d[ERUPT_T]! >= 0) {
      const t = d[ERUPT_T]! + 1;
      d[ERUPT_T] = t;
      const more = volcano.step?.(api, erupt(p), nested(call, t, [])) ?? false;
      if (!more) d[ERUPT_T] = -1;
    }
    return 'idle';
  },
});

function callAt(x: number, p: Params): OpCall {
  return {
    x,
    y: 0,
    radius: p.radius,
    damageType: 'heat',
    damageTypeIndex: damageTypeIndex('heat'),
    owner: -1,
  };
}
