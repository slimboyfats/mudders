import { z } from '@mudders/shared';
import { defineMode, type ModeApi } from '@mudders/sim';

const params = z.strictObject({});

function rollWind(api: ModeApi): void {
  api.setWind(api.windMax > 0 ? api.rng.range(-api.windMax, api.windMax) : 0);
}

/** Sequential turns in a random order per round; wind per the manifest's `wind.type` (§3.1, §3.4). */
export default defineMode<z.infer<typeof params>>({
  kind: 'mode',
  id: 'mode.classic',
  version: 1,
  params,
  turnOrder(api) {
    const order: number[] = [];
    for (let i = 0; i < api.players; i++) order.push(i);
    return api.rng.shuffle(order);
  },
  onRoundStart(api) {
    if (api.windType === 'none') api.setWind(0);
    if (api.windType === 'constant') rollWind(api);
  },
  onTurnStart(api) {
    if (api.windType === 'perTurn') rollWind(api);
  },
});
