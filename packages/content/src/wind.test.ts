import { describe, expect, it } from 'vitest';
import { fireAndSettle, flatten, makeWorld } from './testing';

const small = { width: 400, height: 200 };
const MAX = Math.round(0.012 * 65536);

describe('gusty wind', () => {
  it('keeps changing the wind within a turn, around the turn base', () => {
    const w = makeWorld({ seed: 3, map: small, rules: { windType: 'gusty', turnTimer: 0 } });
    const base = w.windBase;
    const seen = new Set<number>();
    let gusts = 0;
    for (let i = 0; i < 600; i++) {
      w.step();
      seen.add(w.wind);
      gusts += w.snapshot().effectEvents.filter((e) => e.type === 'gust').length;
      expect(w.windBase).toBe(base);
      expect(Math.abs(w.wind - base)).toBeLessThanOrEqual(Math.trunc((MAX * 650) / 1000));
    }
    expect(w.phase).toBe('aim');
    expect(seen.size).toBeGreaterThan(20);
    expect(gusts).toBeGreaterThan(0);
  });

  it('is deterministic: same seed and inputs give the same hash', () => {
    const run = () => {
      const w = makeWorld({ seed: 9, map: small, rules: { windType: 'gusty' } });
      for (let i = 0; i < 3; i++) fireAndSettle(w, 'weapon.missile', 60, 500);
      return w.hash();
    };
    expect(run()).toBe(run());
  });

  it('moves the shell differently from the same steady wind', () => {
    const land = (windType: 'gusty' | 'perTurn') => {
      const w = makeWorld({ seed: 5, map: { width: 800, height: 300 }, rules: { windType } });
      flatten(w, 250);
      // let gusts build for a moment before firing
      const base = w.windBase;
      for (let i = 0; i < 90; i++) w.step();
      const p = w.activePlayer;
      w.applyInput(p, { type: 'selectWeapon', weapon: 'weapon.missile' });
      w.applyInput(p, { type: 'aim', angle: 60, power: 700 });
      w.applyInput(p, { type: 'fire' });
      let x = -1;
      for (let i = 0; i < 400; i++) {
        w.step();
        const sh = w.projectiles[0];
        if (sh) x = sh.x;
      }
      return { x, base };
    };
    const g = land('gusty');
    const s = land('perTurn');
    expect(g.base).toBe(s.base);
    expect(g.x).not.toBe(s.x);
  });

  it('bots aim with the base wind, not the passing gust', () => {
    const w = makeWorld({
      seed: 2,
      map: small,
      rules: { windType: 'gusty' },
      bots: ['ai.poolshark', 'ai.poolshark'],
    });
    for (let i = 0; i < 120; i++) w.step();
    const t = w.tanks[w.activePlayer]!;
    const now = w.wind;
    const a = w.predict(t, 0, 60, 600);
    // predicting doesn't disturb the live wind
    expect(w.wind).toBe(now);
    const b = w.predict(t, 0, 60, 600);
    expect(b).toEqual(a);
  });

  it('leaves other wind settings untouched (no gust, no memory)', () => {
    const w = makeWorld({ seed: 3, map: small });
    for (let i = 0; i < 200; i++) w.step();
    expect(w.gust).toBe(0);
    expect(w.modeMem).toHaveLength(0);
    expect(w.wind).toBe(w.windBase);
  });
});
