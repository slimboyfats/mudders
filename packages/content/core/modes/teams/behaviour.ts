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

/**
 * Team turn order (milestone 7): each team's players are shuffled, the teams are shuffled, then the
 * order deals one player from each team in turn (A1 B1 A2 B2 …), so no team shoots twice in a row
 * while another still has players. A smaller team's players simply run out first.
 * Win condition and team scoring are the kernel's (`WorldOptions.teams`); wind is classic.
 */
export default defineMode<z.infer<typeof params>>({
  kind: 'mode',
  id: 'mode.teams',
  version: 2,
  params,
  turnOrder(api) {
    // teams in order of their first player (stable, no key iteration)
    const teams: number[] = [];
    const members: number[][] = [];
    for (let p = 0; p < api.players; p++) {
      const t = api.team(p);
      let k = teams.indexOf(t);
      if (k < 0) {
        k = teams.length;
        teams.push(t);
        members.push([]);
      }
      members[k]!.push(p);
    }
    for (const m of members) api.rng.shuffle(m);
    const lineup = api.rng.shuffle(members.map((_, i) => i));
    const order: number[] = [];
    for (let round = 0; order.length < api.players; round++) {
      for (const k of lineup) {
        const p = members[k]![round];
        if (p !== undefined) order.push(p);
      }
    }
    return order;
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
