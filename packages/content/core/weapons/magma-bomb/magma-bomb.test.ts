import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.magma-bomb', () => {
  it('hurts a tank in the lava again at the end of the turn', () => {
    const w = flatWorld(150, { tankColumns: [40, 205] });
    dropAt(w, 'weapon.magma-bomb', 200);
    expect(w.tanks[1]!.health).toBeLessThan(100 - 20);
  });

  it('erupts and throws lava bombs out to both sides', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    dropAt(w, 'weapon.magma-bomb', 200);
    const ev = w.snapshot().effectEvents;
    expect(ev.filter((e) => e.type === 'eruption')).toHaveLength(1);
    const bombs = ev.filter((e) => e.type === 'flash' && e.radius === 3);
    expect(bombs).toHaveLength(10);
    expect(bombs.some((b) => b.x < 180)).toBe(true);
    expect(bombs.some((b) => b.x > 220)).toBe(true);
  });
});
