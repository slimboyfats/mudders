import { describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import { rasterTrail } from '../render/pixel/renderer';
import { flightStyles, muzzleHeft, paletteFrom, TRAIL_BY_CATEGORY, trailColors } from './palette';

describe('shell trail colours', () => {
  const content = loadContent();
  const colors = trailColors(content);

  it('colours a weapon by its type', () => {
    expect(colors.get('weapon.missile')).toBe(TRAIL_BY_CATEGORY.explosive);
    expect(colors.get('weapon.heat-seeker')).toBe(TRAIL_BY_CATEGORY.guided);
    expect(colors.get('weapon.roller')).toBe(TRAIL_BY_CATEGORY.roller);
  });

  it('gives submunitions the colour of the weapon that spawns them', () => {
    expect(colors.get('weapon.mirv-warhead')).toBe(TRAIL_BY_CATEGORY.explosive);
    expect(colors.get('weapon.napalm-glob')).toBe(TRAIL_BY_CATEGORY.incendiary);
    expect(colors.get('weapon.nuke-core')).toBe(TRAIL_BY_CATEGORY.explosive);
  });

  it('lists every weapon in the palette, keeping manifest looks', () => {
    const shells = paletteFrom(content).shells!;
    for (const w of content.list('weapon')) expect(shells[w.id]).toBeDefined();
    expect(shells['weapon.missile']).toMatchObject({ shell: 'spark', trail: true });
    expect(shells['weapon.meteor']).toMatchObject({ shell: 'meteor', trail: false });
  });
});

describe('in-flight looks', () => {
  const content = loadContent();
  const flights = flightStyles(content);

  it('gives each weapon family its own look', () => {
    expect(flights.get('weapon.missile')).toBe('missile');
    expect(flights.get('weapon.nuke')).toBe('bomb');
    expect(flights.get('weapon.heat-seeker')).toBe('homing');
    expect(flights.get('weapon.napalm')).toBe('flask');
    expect(flights.get('weapon.digger')).toBe('drill');
  });

  it('makes what a missile or bomb drops tumble as a bomblet', () => {
    expect(flights.get('weapon.mirv-warhead')).toBe('bomblet');
    expect(flights.get('weapon.scatter-bomblet')).toBe('bomblet');
  });

  it('leaves weapons with their own manifest look alone', () => {
    const shells = paletteFrom(content).shells!;
    expect(shells['weapon.missile']?.flight).toBe('missile');
    expect(shells['weapon.v3-rocket']?.flight).toBeUndefined();
    expect(shells['weapon.napalm-glob']?.flight).toBeUndefined();
  });
});

describe('rasterTrail', () => {
  it('stores each crossed cell once, in order', () => {
    const out: number[] = [];
    rasterTrail(out, 0.5, 0.5, 3.5, 0.5);
    rasterTrail(out, 3.5, 0.5, 3.5, 2.5);
    expect(out).toEqual([0, 0, 1, 0, 2, 0, 3, 0, 3, 1, 3, 2]);
  });
});

describe('muzzle heft', () => {
  const content = loadContent();
  const ids = content.list('weapon').map((w) => w.id);
  const heft = muzzleHeft(content);
  const of = (id: string) => heft[ids.indexOf(id)] ?? -1;

  it('has one value per weapon, in the sim weapon order', () => {
    expect(heft).toHaveLength(ids.length);
    for (const h of heft) expect(h).toBeGreaterThanOrEqual(0.1);
    for (const h of heft) expect(h).toBeLessThanOrEqual(1);
  });

  it('kicks harder for bigger guns', () => {
    if (process.env.HEFT_DUMP) console.log(ids.map((id, i) => `${id} ${heft[i]}`).join('\n'));
    expect(of('weapon.baby-nuke')).toBeGreaterThan(of('weapon.mirv'));
    expect(of('weapon.mirv')).toBeGreaterThan(of('weapon.missile'));
    expect(of('weapon.missile')).toBeGreaterThan(of('weapon.baby-missile'));
    expect(of('weapon.nuke')).toBe(1);
  });
});
