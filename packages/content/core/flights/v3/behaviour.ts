import { z } from '@mudders/shared';
import { FP, defineFlight, toFixed } from '@mudders/sim';
import { ballisticStep } from '../../../src/flight';

const params = z.strictObject({
  gravityScale: z.number().min(0).max(10),
  windScale: z.number().min(-10).max(10),
  maxTicks: z.number().int().min(1),
  /** Stage 1 burns out after this many ticks of flight (or at the top of its arc, if sooner). */
  igniteTicks: z.number().int().min(1).max(600),
  /** Stage 2 climb: upward thrust, cells/tick², and top climbing speed, cells/tick. */
  climbAccel: z.number().min(0.05).max(4),
  climbSpeed: z.number().min(1).max(30),
  /** Stage 2 burns out on reaching this row (cells from the top of the map) … */
  climbTo: z.number().int().min(-200).max(400),
  /** … or after this many ticks of climbing. */
  climbTicks: z.number().int().min(1).max(600),
  /** Stage 3: how hard the warhead can turn, cells/tick², and its dive speed, cells/tick. */
  turnAccel: z.number().min(0.05).max(4),
  diveSpeed: z.number().min(1).max(30),
  /** Enemy tanks within this many columns of the turnover are seen; else it dives straight down. */
  range: z.number().int().min(1).max(4096),
});
type Params = z.infer<typeof params>;

/** `data` slots. */
const STAGE = 0;
const TX = 1;
const TY = 2;
const SINCE = 3;

/**
 * V3 (§5.1 guided): a three-stage rocket. Stage 1 flies the plain ballistic arc. After `igniteTicks` (or at the
 * top of its arc) it burns out (a `pulse`, which drops the spent stage) and stage 2 lights: thrust straight
 * up, no gravity or wind, until it reaches `climbTo` high in the sky. There it burns out too (a
 * second `pulse`), the warhead locks on to the enemy tank nearest the turnover column and stage 3
 * turns it over and drives it down onto the target at `diveSpeed`, the turn limited to
 * `turnAccel`. `v3Burn` effect events mark each ignition (`stage` 2 and 3, the shell `id`).
 * `data` = [stage, target column, target row, tick the stage lit].
 */
export default defineFlight<Params>({
  kind: 'flight',
  id: 'flight.v3',
  version: 1,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    if (proj.data.length === 0) proj.data = [1, 0, 0, 0];
    const stage = proj.data[STAGE] ?? 1;
    const since = proj.age - (proj.data[SINCE] ?? 0);
    if (stage === 1) {
      const vy0 = proj.vy;
      ballisticStep(api, proj, p.gravityScale, p.windScale);
      if ((vy0 < 0 && proj.vy >= 0) || proj.age + 1 >= p.igniteTicks) {
        proj.data[STAGE] = 2;
        proj.data[SINCE] = proj.age + 1;
        api.emit('v3Burn', Math.floor(proj.x / FP), Math.floor(proj.y / FP), 0, {
          stage: 2,
          id: proj.id,
        });
        return 'pulse';
      }
      return undefined;
    }
    if (stage === 2) {
      // climb: sideways speed bleeds off, thrust drives it straight up
      proj.vx -= Math.trunc(proj.vx / 6);
      proj.vy = Math.max(-toFixed(p.climbSpeed), proj.vy - toFixed(p.climbAccel));
      proj.x += proj.vx;
      proj.y += proj.vy;
      const cy = Math.floor(proj.y / FP);
      if (cy > p.climbTo && since < p.climbTicks) return undefined;
      // burn-out at the top: lock on to the enemy nearest the turnover column
      const cx = Math.floor(proj.x / FP);
      let tx = Math.max(0, Math.min(api.grid.width - 1, cx));
      let ty = api.grid.surfaceY(tx);
      let best = p.range + 1;
      const team = api.tanks[proj.owner]?.team ?? proj.owner;
      for (const t of api.tanks) {
        if (!t.alive || t.player === proj.owner || t.team === team) continue;
        const d = Math.abs(t.x - cx);
        if (d < best) {
          best = d;
          tx = t.x;
          ty = t.y - (t.h >> 1);
        }
      }
      proj.data[STAGE] = 3;
      proj.data[TX] = tx;
      proj.data[TY] = ty;
      proj.data[SINCE] = proj.age + 1;
      api.emit('v3Burn', cx, cy, 0, { stage: 3, id: proj.id });
      return 'pulse';
    }
    // stage 3: turn over and drive down onto the target
    const tx = proj.data[TX] ?? 0;
    const ty = proj.data[TY] ?? 0;
    const dx = tx * FP + FP / 2 - proj.x;
    const dy = ty * FP + FP / 2 - proj.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    // the motor spools up over the first ticks of the dive
    const speed = Math.trunc((toFixed(p.diveSpeed) * Math.min(since + 4, 24)) / 24);
    let wx = 0;
    let wy = speed;
    if (len >= 1) {
      wx = Math.trunc((dx * speed) / len);
      wy = Math.trunc((dy * speed) / len);
    }
    let ax = wx - proj.vx;
    let ay = wy - proj.vy;
    const al = Math.sqrt(ax * ax + ay * ay);
    const cap = toFixed(p.turnAccel);
    if (al > cap) {
      ax = Math.trunc((ax * cap) / al);
      ay = Math.trunc((ay * cap) / al);
    }
    proj.vx += ax;
    proj.vy += ay;
    proj.x += proj.vx;
    proj.y += proj.vy;
    return undefined;
  },
});
