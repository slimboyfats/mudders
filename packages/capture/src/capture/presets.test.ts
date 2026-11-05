import { describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import { ScenarioSchema } from '@mudders/shared';
import { ScenarioDriver } from '@mudders/sim';
import { isPreset, weaponShowcase } from './presets';

describe('weapon-showcase preset', () => {
  it('builds a valid scenario whose three shots land near their targets', () => {
    expect(isPreset('weapon-showcase')).toBe(true);
    const content = loadContent();
    const s = ScenarioSchema.parse(weaponShowcase(content, 'weapon.baby-missile'));
    expect(s.inputs.filter((i) => i.action.type === 'fire')).toHaveLength(3);
    const d = new ScenarioDriver(content, s);
    const impacts: number[] = [];
    while (!d.done) {
      d.step();
      for (const e of d.world.snapshot().effectEvents) if (e.type === 'burst') impacts.push(e.x);
    }
    expect(impacts.length).toBeGreaterThanOrEqual(3);
    const targets = s.tanks!.slice(1).map((t) => t.x);
    targets.forEach((tx, i) => expect(Math.abs(impacts[i]! - tx)).toBeLessThan(12));
  });
  it('rejects unknown weapons', () => {
    expect(() => weaponShowcase(loadContent(), 'weapon.nope')).toThrow();
  });
});
