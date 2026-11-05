import { z } from '@mudders/shared';
import { defineAi } from '@mudders/sim';
import { buyByValue, cheapest, flatPower, me, nearest, strongest } from '../../../src/ai';

const params = z.strictObject({
  /** Launch angle (mirrored for targets on the left). */
  angle: z.number().int().min(10).max(80),
  /** ± power noise per shot. */
  jitter: z.number().int().min(0).max(200),
});

/** Memory: [target player, last power] — bracketing restarts when the target changes. */
export default defineAi<z.infer<typeof params>>({
  kind: 'ai',
  id: 'ai.shooter',
  version: 1,
  params,
  aim(api, p) {
    const m = me(api);
    const target = nearest(api);
    const w = api.rng.chance(1, 3) ? strongest(api) : cheapest(api);
    if (!target) return { weapon: w.index, angle: 90, power: 300 };
    const dx = target.x - m.x;
    const angle = dx >= 0 ? p.angle : 180 - p.angle;
    const mem = api.memory;
    let power: number;
    const last = api.lastShot;
    if (mem[0] === target.player && last && mem[1] !== undefined) {
      // Bracket: horizontal range ∝ power², so scale by √(wanted / got).
      const got = Math.max(8, Math.abs(last.x - m.x));
      const sameSide = (last.x - m.x) * dx > 0;
      const k = sameSide ? Math.sqrt(Math.abs(dx) / got) : 1.25;
      power = Math.round(mem[1] * Math.max(0.6, Math.min(1.5, k)));
    } else {
      power = flatPower(api, dx);
    }
    power = Math.max(60, Math.min(1000, power + api.rng.range(-p.jitter, p.jitter)));
    mem[0] = target.player;
    mem[1] = power;
    return { weapon: w.index, angle, power };
  },
  shop(api) {
    return buyByValue(api, (i) => i.expectedDamage, 0, 2);
  },
});
