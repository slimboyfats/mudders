import { describe, expect, it } from 'vitest';
import { dropAt, flatten, makeWorld } from '../../../src/testing';

describe('weapon.tandem-charge', () => {
  it('knocks the shield flat, then the main charge hits the hull', () => {
    const w = makeWorld({
      map: { width: 800, height: 400 },
      tankColumns: [150, 500],
      turnOrder: [0, 1],
      wind: 0,
      rules: { suddenDeath: false },
    });
    flatten(w, 300);
    const t = w.tanks[1]!;
    t.shield = 60;
    t.shieldMax = 60;
    dropAt(w, 'weapon.tandem-charge', t.x);
    expect(t.shield).toBe(0);
    expect(t.health).toBeLessThan(25);
  });
});
