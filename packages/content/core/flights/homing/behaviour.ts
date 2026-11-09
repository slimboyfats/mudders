import { z } from '@mudders/shared';
import { FP, defineFlight, toFixed } from '@mudders/sim';
import { ballisticStep, lureNear } from '../../../src/flight';

const params = z.strictObject({
  gravityScale: z.number().min(0).max(10),
  windScale: z.number().min(-10).max(10),
  maxTicks: z.number().int().min(1),
  /** Ticks of plain ballistic flight before the seeker switches on. */
  armTicks: z.number().int().min(0),
  /** Steering acceleration toward the target, cells/tick². */
  accel: z.number().min(0).max(2),
  /** Only targets within this many cells are seen. */
  range: z.number().int().min(1).max(4096),
  /** Speed cap while steering, cells/tick. */
  maxSpeed: z.number().min(1).max(40),
});

/**
 * Homing (§5.1 guided): ballistic, but once armed it accelerates toward the nearest enemy tank in
 * range. Mild for a Smart Bomb, strong for a Heat Seeker.
 */
export default defineFlight<z.infer<typeof params>>({
  kind: 'flight',
  id: 'flight.homing',
  version: 2,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    if (proj.age >= p.armTicks) {
      let best = -1;
      let bestD = p.range * p.range;
      const cx = Math.floor(proj.x / FP);
      const cy = Math.floor(proj.y / FP);
      for (const t of api.tanks) {
        if (!t.alive || t.player === proj.owner) continue;
        const dx = t.x - cx;
        const dy = t.y - 5 - cy;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = t.player;
        }
      }
      // a decoy runs hot: it wins unless a real tank is less than half as far
      const team = api.tanks[proj.owner]?.team ?? proj.owner;
      const lure = lureNear(api, team, cx, cy, p.range);
      let tx = 0;
      let ty = 0;
      if (lure && (best < 0 || lure.d2 <= bestD * 4)) {
        tx = lure.x;
        ty = lure.y;
        best = 0;
      } else if (best >= 0) {
        const t = api.tanks[best]!;
        tx = t.x;
        ty = t.y - 5;
      }
      if (best >= 0) {
        const dx = tx - cx;
        const dy = ty - cy;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len >= 1) {
          const a = toFixed(p.accel);
          proj.vx += Math.trunc((dx * a) / len);
          proj.vy += Math.trunc((dy * a) / len);
          const cap = toFixed(p.maxSpeed);
          const v = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy);
          if (v > cap) {
            proj.vx = Math.trunc((proj.vx * cap) / v);
            proj.vy = Math.trunc((proj.vy * cap) / v);
          }
        }
      }
    }
    ballisticStep(api, proj, p.gravityScale, p.windScale);
  },
});
