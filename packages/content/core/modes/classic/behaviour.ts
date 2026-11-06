import { z } from '@mudders/shared';
import { defineMode } from '@mudders/sim';
import {
  DEFAULT_GUSTS,
  GustParams,
  windOnRoundStart,
  windOnTick,
  windOnTurnStart,
} from '../../../src/wind';

const params = z.strictObject({
  /** Gusts for the `gusty` wind setting. */
  gusts: GustParams.optional(),
});

/** Sequential turns in a random order per round; wind per the manifest's `wind.type` (§3.1, §3.4). */
export default defineMode<z.infer<typeof params>>({
  kind: 'mode',
  id: 'mode.classic',
  version: 2,
  params,
  turnOrder(api) {
    const order: number[] = [];
    for (let i = 0; i < api.players; i++) order.push(i);
    return api.rng.shuffle(order);
  },
  onRoundStart(api) {
    windOnRoundStart(api);
  },
  onTurnStart(api) {
    windOnTurnStart(api);
  },
  onTick(api, p) {
    windOnTick(api, p.gusts ?? DEFAULT_GUSTS);
  },
});
