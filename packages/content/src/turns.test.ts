import { describe, expect, it } from 'vitest';
import { flatWorld, passTurns } from './testing';

describe('turns', () => {
  it('passes the turn of a tank that died before it could shoot', () => {
    const w = flatWorld(150, { players: 3, tankColumns: [40, 200, 360], turnOrder: [0, 1, 2] });
    passTurns(w, 1);
    expect(w.activePlayer).toBe(1);
    // e.g. the sudden-death edge swallowed it at the start of its turn
    w.tanks[1]!.alive = false;
    w.run(5);
    expect(w.activePlayer).toBe(2);
    expect(w.phase).toBe('aim');
  });
});
