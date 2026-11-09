import { z } from '@mudders/shared';
import { FP, defineTerrainOp, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Cells per tick it flies. */
  speed: z.number().min(0.25).max(6),
  /** Rows above the target's turret it hovers. */
  hover: z.number().int().min(2).max(60),
  /** HP it patches on arrival, then at the start of every later turn. */
  arrive: z.number().int().min(0).max(200),
  perTurn: z.number().int().min(0).max(200),
  /** Rounds of turns it stays (each round = one turn per tank alive when it arrived). */
  rounds: z.number().int().min(1).max(10),
  /** A shell passing within `hitRadius` cells knocks it out of the sky... */
  hitRadius: z.number().int().min(1).max(40),
  /** ...and so does a shell going off within `blastRadius` cells of it. */
  blastRadius: z.number().int().min(1).max(80),
  /** Ticks it may spend flying to its tank before it gives up (holds the turn meanwhile). */
  maxFlight: z.number().int().min(10).max(2000),
});
type Params = z.infer<typeof params>;

// data layout
const ID = 0; // spawn tick, so the renderer can tell drones apart
const X = 1; // fixed-point position
const Y = 2;
const TARGET = 3; // player, or -1
const STATE = 4; // FLY or HOVER
const TURNS = 5; // turns left to patch
const SEEN = 6; // api.turn last seen
const WATCH = 7; // id of the nearest shell within blastRadius last tick, or -1
const AGE = 8;
const ARRIVED = 9; // age it reached its tank
/** Ticks after arriving in which a turn change is the one its own shot ended (no extra patch). */
const SETTLE_IN = 30;
const FLY = 0;
const HOVER = 1;

/** The live tank on `team` nearest to (x, y) (fixed-point), or -1. Lowest player on ties. */
function nearestFriend(api: SimApi, team: number, x: number, y: number): number {
  let best = -1;
  let bestD = Infinity;
  for (const t of api.tanks) {
    if (!t.alive || t.team !== team) continue;
    const dx = t.x - Math.trunc(x / FP);
    const dy = t.y - Math.trunc(y / FP);
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      best = t.player;
      bestD = d;
    }
  }
  return best;
}

/**
 * True when a shell has knocked the drone down: one passing within `hitRadius`, or the shell that
 * was within `blastRadius` last tick having gone off (gone from the sky) since. Updates the watch.
 */
function shotDown(api: SimApi, p: Params, d: number[]): boolean {
  const cx = Math.trunc(d[X]! / FP);
  const cy = Math.trunc(d[Y]! / FP);
  const watched = d[WATCH]!;
  let still = false;
  let near = -1;
  let nearD = p.blastRadius * p.blastRadius + 1;
  const hit2 = p.hitRadius * p.hitRadius;
  const own = d[TARGET]!;
  for (const s of api.projectiles) {
    if (!s.alive) continue;
    // its own tank's shell leaving the barrel underneath it doesn't count
    if (s.owner === own && s.age < 30) continue;
    if (s.id === watched) still = true;
    const dx = Math.trunc(s.x / FP) - cx;
    const dy = Math.trunc(s.y / FP) - cy;
    const dd = dx * dx + dy * dy;
    if (dd <= hit2) return true;
    if (dd < nearD) {
      near = s.id;
      nearD = dd;
    }
  }
  if (watched >= 0 && !still) return true;
  d[WATCH] = near;
  return false;
}

/** One move of `speed` cells towards (tx, ty), fixed-point. Returns true once there. */
function flyTo(d: number[], tx: number, ty: number, speed: number): boolean {
  const dx = tx - d[X]!;
  const dy = ty - d[Y]!;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= speed) {
    d[X] = tx;
    d[Y] = ty;
    return true;
  }
  d[X]! += Math.trunc((dx * speed) / len);
  d[Y]! += Math.trunc((dy * speed) / len);
  return false;
}

/** Patch `amount` HP onto the target and tell the renderer. */
function patch(api: SimApi, d: number[], amount: number): void {
  const t = api.tanks[d[TARGET]!];
  if (!t) return;
  const healed = api.heal(t.player, amount);
  api.emit('droneHeal', t.x, t.y - (t.h >> 1), t.half + 2, {
    id: d[ID]!,
    player: t.player,
    healed,
  });
}

/**
 * Repair Drone: the shell lets loose a little drone that flies to the nearest friendly tank (the
 * shooter's own, or a teammate's), hovers over it and patches its armour: some HP on arrival and
 * more at the start of every turn for a couple of rounds, never above its round-start health. It
 * lives on the map like a resident monster, so the turn goes on while it works, and it is fair
 * game: a shell passing close to it, or going off near it, knocks it out of the sky. If its tank
 * dies it moves on to the next friend, and with none left it is gone.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.repair-drone',
  version: 1,
  params,
  start(api, p, c) {
    const owner = api.tanks[c.owner];
    const team = owner?.team ?? c.owner;
    const x = c.x * FP + FP / 2;
    const y = (c.y - 3) * FP + FP / 2;
    const target = nearestFriend(api, team, x, y);
    api.emit('droneLaunch', c.x, c.y - 3, 4, { id: api.tick & 0xffff });
    if (target < 0) return null;
    let alive = 0;
    for (const t of api.tanks) if (t.alive) alive++;
    return [api.tick & 0xffff, x, y, target, FLY, p.rounds * alive, api.turn, -1, 0, 0];
  },
  step(api, p, inst) {
    const d = inst.data;
    d[AGE]!++;
    const cx = Math.trunc(d[X]! / FP);
    const cy = Math.trunc(d[Y]! / FP);
    if (shotDown(api, p, d)) {
      api.emit('droneDown', cx, cy, 6, { id: d[ID]! });
      return false;
    }
    let t = api.tanks[d[TARGET]!];
    if (!t?.alive) {
      const team = t?.team ?? -1;
      const next = team >= 0 ? nearestFriend(api, team, d[X]!, d[Y]!) : -1;
      if (next < 0) {
        api.emit('droneDown', cx, cy, 4, { id: d[ID]!, quiet: 1 });
        return false;
      }
      d[TARGET] = next;
      d[STATE] = FLY;
      t = api.tanks[next]!;
    }
    const tx = t.x * FP + FP / 2;
    const ty = (t.y - t.h - p.hover) * FP + FP / 2;
    const there = flyTo(d, tx, ty, Math.trunc(p.speed * FP));
    if (d[STATE] === FLY) {
      if (there) {
        d[STATE] = HOVER;
        d[SEEN] = api.turn;
        d[ARRIVED] = d[AGE]!;
        patch(api, d, p.arrive);
      } else if (d[AGE]! > p.maxFlight) {
        api.emit('droneDown', cx, cy, 4, { id: d[ID]!, quiet: 1 });
        return false;
      }
    } else if (api.turn !== d[SEEN] && d[ARRIVED]! >= 0 && d[AGE]! - d[ARRIVED]! < SETTLE_IN) {
      // the shot that brought it just ended: the arrival patch covers this turn
      d[SEEN] = api.turn;
      d[ARRIVED] = -1;
    } else if (api.turn !== d[SEEN]) {
      // a new turn: patch again, until its rounds run out
      d[SEEN] = api.turn;
      d[TURNS]!--;
      patch(api, d, p.perTurn);
      if (d[TURNS]! <= 0) {
        api.emit('droneDown', Math.trunc(d[X]! / FP), Math.trunc(d[Y]! / FP), 4, {
          id: d[ID]!,
          quiet: 1,
        });
        return false;
      }
    }
    api.emit('drone', Math.trunc(d[X]! / FP), Math.trunc(d[Y]! / FP), 4, {
      id: d[ID]!,
      player: t.player,
      hover: d[STATE] === HOVER ? 1 : 0,
      turns: d[TURNS]!,
      ty: t.y - t.h,
    });
    // flying in holds the turn (you see it arrive); hovering it just works on in the background
    return d[STATE] === FLY ? true : 'idle';
  },
});
