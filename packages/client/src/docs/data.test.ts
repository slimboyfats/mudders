import { loadContent } from '@mudders/content';
import { describe, expect, it } from 'vitest';
import { docsData } from './data';

describe('docs data', () => {
  const data = docsData(loadContent());

  it('lists every shop weapon, prop, material, tank and gear item', () => {
    const c = loadContent();
    expect(data.weapons.length).toBe(c.list('weapon').filter((w) => w.shop.price > 0).length);
    expect(data.props.length).toBe(c.list('prop').length);
    expect(data.materials.length).toBe(c.list('material').length);
    expect(data.tanks.length).toBe(c.list('tank').length);
    expect(data.gear.length).toBe(c.list('gear').length);
  });

  it('reads blast numbers from the manifests, children included', () => {
    const missile = data.weapons.find((w) => w.id === 'weapon.missile');
    expect(missile?.peakRadius).toBe(24);
    expect(missile?.peakDamage).toBe(60);
    // the nuke's damage lives in its spawned core
    const nuke = data.weapons.find((w) => w.id === 'weapon.nuke');
    expect(nuke?.peakDamage).toBeGreaterThan(0);
    expect(nuke?.effects.some((e) => e.children.length > 0)).toBe(true);
  });

  it('carries material structure and prop pictures', () => {
    const brick = data.materials.find((m) => m.id === 'material.brick');
    expect(brick?.span).toBe(4);
    expect(brick?.usedBy).toContain('prop.house');
    const house = data.props.find((p) => p.id === 'prop.house');
    expect(house?.pixels.length).toBe(house?.height);
    expect(house?.maps).toContain('City');
    expect(house?.cells).toBeGreaterThan(0);
  });
});
