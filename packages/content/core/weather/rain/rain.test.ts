import { describe, expect, it } from 'vitest';
import { countCells, flatWorld, flatten, makeWorld, passTurns } from '../../../src/testing';

const range = (weather?: string) => {
  const w = makeWorld({
    map: { width: 2000, height: 300 },
    tankColumns: [100, 1900],
    wind: 0,
    ...(weather ? { weather } : {}),
  });
  flatten(w, 250);
  const t = w.tanks[0]!;
  return w.predict(t, w.weaponByIndex('weapon.missile'), 45, 600).x - t.x;
};

describe('weather.rain', () => {
  it('drags shells: the same shot lands shorter than in clear skies', () => {
    const clear = Math.abs(range());
    const wet = Math.abs(range('weather.rain'));
    expect(wet).toBeLessThan(clear);
    expect(wet).toBeGreaterThan(clear * 0.6);
  });

  it('soaks the hollows into mud and leaves the flat ground dry', () => {
    const w = flatWorld(150, { weather: 'weather.rain' });
    // a crater for the water to run into
    for (let x = 180; x < 220; x++) for (let y = 150; y < 160; y++) w.grid.set(x, y, 0);
    w.grid.markDirty(170, 140, 230, 170);
    passTurns(w, 8);
    const mud = w.mats.cellOf('material.mud');
    const g = w.grid;
    let mudCells = 0;
    for (let i = 0; i < g.material.length; i++) {
      if (g.material[i] !== mud) continue;
      mudCells++;
      // only in the crater: the flat ground around it stays dry
      const x = i % g.width;
      expect(x).toBeGreaterThanOrEqual(176);
      expect(x).toBeLessThan(224);
    }
    expect(mudCells).toBeGreaterThan(10);
  });

  it('rains water into the hollows, up to the cap', () => {
    const w = flatWorld(150, { weather: 'weather.rain' });
    for (let x = 180; x < 220; x++) for (let y = 150; y < 160; y++) w.grid.set(x, y, 0);
    w.grid.markDirty(170, 140, 230, 170);
    passTurns(w, 3);
    w.applyInput(w.activePlayer, { type: 'aim', angle: 90, power: 0 });
    w.step();
    const water = countCells(w, 'material.water');
    expect(water).toBeGreaterThan(0);
    expect(water).toBeLessThanOrEqual(Math.trunc((120 * 400) / 100));
  });

  it('is deterministic and leaves clear matches alone', () => {
    const run = (weather?: string) => {
      const w = flatWorld(150, weather ? { weather } : {});
      passTurns(w, 3);
      return w.hash();
    };
    expect(run('weather.rain')).toBe(run('weather.rain'));
    expect(run('weather.rain')).not.toBe(run());
  });
});
