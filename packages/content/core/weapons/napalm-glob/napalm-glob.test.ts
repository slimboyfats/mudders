import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.napalm-glob', () => {
  it('lands as a small pool of fire that singes a tank', () => {
    const w = flatWorld(150, { tankColumns: [40, 200] });
    dropAt(w, 'weapon.napalm-glob', 200);
    expect(w.tanks[1]!.health).toBeLessThan(100);
    expect(w.tanks[1]!.health).toBeGreaterThan(70);
  });
});
