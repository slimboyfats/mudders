import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('weapon.magnet-mine-core', () => {
  it('is a timed static charge that goes off after the magnet field has run', () => {
    const c = loadContent();
    const core = c.get('weapon', 'weapon.magnet-mine-core');
    const op = c.get('terrainop', 'terrainop.magnet') as unknown as { arm: number; life: number };
    const timer = core.triggers.find((t) => typeof t === 'object' && 'onTimer' in t);
    expect(timer).toBeDefined();
    expect((timer as { onTimer: number }).onTimer).toBeGreaterThan(op.arm + op.life);
    expect(core.shop.price).toBe(0);
  });
});
