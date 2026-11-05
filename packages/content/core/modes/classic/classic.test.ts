import { describe, expect, it } from 'vitest';
import { fireAndSettle, makeWorld } from '../../../src/testing';

describe('mode.classic', () => {
  it('shuffles the turn order per seed and changes wind every turn', () => {
    const orders = new Set<string>();
    const small = { width: 400, height: 200 };
    for (let s = 0; s < 20; s++)
      orders.add(makeWorld({ seed: s, players: 3, map: small }).order.join());
    expect(orders.size).toBeGreaterThan(1);
    const w = makeWorld({ seed: 4, map: small });
    const winds = [w.wind];
    for (let i = 0; i < 4; i++) {
      const t = w.tanks[w.activePlayer]!;
      fireAndSettle(w, 'weapon.baby-missile', t.angle, 100);
      winds.push(w.wind);
    }
    expect(new Set(winds).size).toBeGreaterThan(2);
    expect(Math.max(...winds.map(Math.abs))).toBeLessThanOrEqual(Math.round(0.012 * 65536));
  });

  it('gives every tank the loadout and ends when one tank is left', () => {
    const w = makeWorld({ seed: 4 });
    expect(w.tanks[0]!.inventory.filter((n) => n !== 0).sort()).toEqual(
      [-1, 10, 3, 2, 1, 1].sort(),
    );
    w.tanks[1]!.health = 1;
    w.tanks[1]!.alive = true;
    // a tank killed by any means ends the 2-player round
    const p = w.activePlayer;
    const target = w.tanks[1 - p]!;
    target.health = 1;
    target.y = w.grid.height - 1;
    for (let x = target.x - 8; x < target.x + 8; x++)
      for (let y = 0; y < w.grid.height; y++) w.grid.set(x, y, 0);
    w.grid.markDirty(target.x - 8, 0, target.x + 8, w.grid.height - 1);
    target.y = 10;
    fireAndSettle(w, 'weapon.baby-missile', 90, 10);
    expect(w.phase).toBe('shop');
    expect(w.results).toHaveLength(1);
  });
});
