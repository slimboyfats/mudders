import { describe, expect, it } from 'vitest';
import { dropAt, effectsOf, flatWorld, passTurns } from '../../../src/testing';

describe('weapon.shield-breaker', () => {
  it('strips shields, cooks batteries and jams tanks in reach, with little damage', () => {
    const w = flatWorld(150, { tankColumns: [40, 300] });
    const t = w.tanks[1]!;
    t.shield = 80;
    const battery = w.gear.findIndex((x) => x.id === 'gear.battery');
    t.gear[battery] = 2;
    dropAt(w, 'weapon.shield-breaker', 280);
    expect(t.shield).toBe(0);
    expect(t.gear[battery]).toBe(0);
    expect(t.jam).toBe(1);
    expect(t.health).toBeGreaterThan(90);
    expect(effectsOf(w, 'shieldStrip').length).toBe(1);
  });

  it('leaves the ground almost whole', () => {
    const w = flatWorld(150, { tankColumns: [40, 360] });
    dropAt(w, 'weapon.shield-breaker', 200);
    expect(w.grid.surfaceY(200 + 20)).toBe(150);
  });

  it('a jammed tank cannot drive or use gear on its turn, then recovers', () => {
    const w = flatWorld(150, { tankColumns: [40, 300] });
    const t = w.tanks[1]!;
    const shield = w.gear.findIndex((x) => x.id === 'gear.shield');
    dropAt(w, 'weapon.shield-breaker', 300);
    // player 1 aims now, jammed
    expect(w.activePlayer).toBe(1);
    expect(t.driveLeft).toBe(0);
    t.gear[shield] = 1;
    expect(w.useGear(t, shield)).toBe(false);
    passTurns(w, 2);
    expect(t.jam).toBe(0);
    expect(w.useGear(t, shield)).toBe(true);
  });
});
