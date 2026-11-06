import { z } from '@mudders/shared';
import type { ModeApi } from '@mudders/sim';

/** Gust settings a mode manifest may carry (used only when the wind is `gusty`). */
export const GustParams = z.strictObject({
  /** Average ticks between gusts; each one comes after half to one and a half of this. */
  every: z.number().int().min(4).max(600),
  /** Strongest gust as a share of the mode's `wind.max`, in thousandths. */
  share: z.number().int().min(0).max(2000),
  /** How fast the wind swings to a new gust: 1/2^ease of the gap per tick. */
  ease: z.number().int().min(0).max(8),
});
export type GustParams = z.infer<typeof GustParams>;

export const DEFAULT_GUSTS: GustParams = { every: 45, share: 650, ease: 3 };

/** A fresh base wind for the round or turn, anywhere in ±`windMax`. */
export function rollWind(api: ModeApi): void {
  api.setWind(api.windMax > 0 ? api.rng.range(-api.windMax, api.windMax) : 0);
}

/** Classic wind rules (§3.4) for a mode's round start. */
export function windOnRoundStart(api: ModeApi): void {
  if (api.windType === 'none') api.setWind(0);
  if (api.windType === 'constant') rollWind(api);
}

/** Classic wind rules for a mode's turn start: a new base wind each turn (gusty blows around it). */
export function windOnTurnStart(api: ModeApi): void {
  if (api.windType === 'perTurn' || api.windType === 'gusty') rollWind(api);
}

/**
 * Gusty wind, every tick: now and then a new gust is drawn from the match PRNG, and the wind swings
 * towards it a fraction of the gap per tick, so it keeps changing while you aim and while the shell
 * flies. Integer only. State lives in `api.memory`: [gust, target, next gust tick].
 */
export function windOnTick(api: ModeApi, g: GustParams = DEFAULT_GUSTS): void {
  if (api.windType !== 'gusty') return;
  const m = api.memory;
  if (m.length < 3) {
    m.length = 0;
    m.push(0, 0, api.now());
  }
  let gust = m[0]!;
  let target = m[1]!;
  const amp = Math.trunc((api.windMax * g.share) / 1000);
  if (api.now() >= m[2]!) {
    target = amp > 0 ? api.rng.range(-amp, amp) : 0;
    const half = g.every >> 1;
    m[2] = api.now() + api.rng.range(half, g.every + half);
    const swing = target - gust;
    // a strong change of wind is a gust you can hear and see
    if (amp > 0 && Math.abs(swing) * 2 > amp) {
      api.emit('gust', 0, 0, 0, {
        dir: swing > 0 ? 1 : -1,
        strength: Math.min(1000, Math.trunc((Math.abs(swing) * 1000) / (2 * amp))),
      });
    }
  }
  const d = target - gust;
  const step = Math.trunc(d / (1 << g.ease));
  gust += step !== 0 ? step : d;
  m[0] = gust;
  m[1] = target;
  api.setGust(gust);
}
