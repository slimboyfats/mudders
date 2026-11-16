import { describe, expect, it } from 'vitest';
import { dropAt, effectsOf, flatWorld, propWorld } from '../../../src/testing';

/** A flat world with a long pool 8 deep from 150 to 330; tank 1 stands in it at 300. */
function pond(wet: boolean) {
  const w = flatWorld(150, { tankColumns: [40, 300] });
  const water = w.mats.cellOf('material.water');
  for (let x = 150; x < 330; x++) for (let y = 150; y < 158; y++) w.grid.set(x, y, wet ? water : 0);
  w.grid.markDirty(150, 140, 330, 160);
  const t = w.tanks[1]!;
  t.y = 157;
  w.run(60);
  return w;
}

/**
 * A rail of `material` one cell high lying on flat ground from `from` to `to` (row 149, on the
 * dirt at 150), with tank 1 standing on it at `tankX`.
 */
function rail(material: string, from: number, to: number, tankX: number, width = 400) {
  const w = flatWorld(150, { tankColumns: [40, tankX], map: { width, height: 200 } });
  const cell = w.mats.cellOf(material);
  for (let x = from; x < to; x++) w.grid.set(x, 149, cell);
  w.grid.markDirty(from, 140, to, 152);
  const t = w.tanks[1]!;
  t.x = tankX;
  t.y = 148;
  w.run(60);
  return w;
}

describe('terrainop.conduct', () => {
  it('shocks a tank standing in the water a lightning bolt hits, far from the blast', () => {
    const w = pond(true);
    const hp = w.tanks[1]!.health;
    dropAt(w, 'weapon.thunderstorm-bolt', 170);
    expect(w.tanks[1]!.health).toBeLessThan(hp);
    expect(w.snapshot().effectEvents.some((e) => e.type === 'charge')).toBe(true);
  });

  it('does nothing without water to carry it', () => {
    const w = pond(false);
    const hp = w.tanks[1]!.health;
    dropAt(w, 'weapon.thunderstorm-bolt', 170);
    expect(w.tanks[1]!.health).toBe(hp);
  });

  it('spares a tank on dry ground beside the lake', () => {
    const w = pond(true);
    const hp = w.tanks[0]!.health;
    dropAt(w, 'weapon.thunderstorm-bolt', 170);
    expect(w.tanks[0]!.health).toBe(hp);
  });

  it('runs along a steel rail to a tank far from the strike, but not along dry dirt', () => {
    const steel = rail('material.steel', 120, 340, 320);
    const hp = steel.tanks[1]!.health;
    dropAt(steel, 'weapon.thunderstorm-bolt', 140);
    expect(steel.tanks[1]!.health).toBe(hp - 30);
    // the spark crawl runs through the steel itself
    const crawls = effectsOf(steel, 'sparkCrawl');
    expect(crawls.length).toBeGreaterThan(4);
    expect(crawls.some((e) => e.x > 250)).toBe(true);

    const dirt = rail('material.dirt', 120, 340, 320);
    dropAt(dirt, 'weapon.thunderstorm-bolt', 140);
    expect(dirt.tanks[1]!.health).toBe(hp);
    expect(effectsOf(dirt, 'sparkCrawl')).toHaveLength(0);
  });

  it('carries farther through steel than through water, and stops at its reach', () => {
    // 260 cells out: steel (cost 1) carries it, water (cost 3, a third as far) does not
    const steel = rail('material.steel', 100, 400, 380, 600);
    const hp = steel.tanks[1]!.health;
    dropAt(steel, 'weapon.thunderstorm-bolt', 120);
    expect(steel.tanks[1]!.health).toBeLessThan(hp);

    const water = flatWorld(150, { tankColumns: [40, 380], map: { width: 600, height: 200 } });
    const wc = water.mats.cellOf('material.water');
    for (let x = 100; x < 400; x++) for (let y = 150; y < 154; y++) water.grid.set(x, y, wc);
    water.grid.markDirty(100, 140, 400, 160);
    water.tanks[1]!.y = 153;
    water.run(60);
    dropAt(water, 'weapon.thunderstorm-bolt', 120);
    expect(water.tanks[1]!.health).toBe(hp);

    // and a steel rail longer than the reach (480) leaves a tank at its far end untouched
    const long = rail('material.steel', 60, 1180, 1150, 1200);
    dropAt(long, 'weapon.thunderstorm-bolt', 80);
    expect(long.tanks[1]!.health).toBe(hp);
  });

  it('shocks a tank leaning on an office tower when lightning hits the roof', () => {
    // tower centred on 200: columns 184..215, its corner girders at 184 and 215
    const w = propWorld('prop.tower', 200, 180, {
      map: { width: 400, height: 240 },
      tankColumns: [40, 360],
    });
    const t = w.tanks[1]!;
    t.x = 216 + t.half;
    t.y = 179;
    w.run(30);
    const hp = t.health;
    const far = w.tanks[0]!.health;
    dropAt(w, 'weapon.thunderstorm-bolt', 196);
    expect(t.health).toBe(hp - 30);
    expect(w.tanks[0]!.health).toBe(far);
  });
});
