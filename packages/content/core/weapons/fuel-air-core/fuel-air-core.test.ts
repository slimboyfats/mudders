import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('weapon.fuel-air-core', () => {
  it('hangs at the burst and throws a blast wave one tick after the cloud ignites', () => {
    const c = loadContent();
    const core = c.get('weapon', 'weapon.fuel-air-core');
    const cloud = c.get('weapon', 'weapon.fuel-air-cloud');
    expect(core.flight.ref).toBe('flight.static');
    expect(core.triggers).toContainEqual({ onTimer: 81 });
    expect(cloud.triggers).toContainEqual({ onTimer: 80 });
    const imp = core.impact[0]!;
    expect('explosion' in imp && imp.explosion.terrainOp?.ref).toBe('terrainop.displace');
  });
});
