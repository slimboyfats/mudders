import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.tornado', () => {
  it('picks up a tank in its path, carries it and throws it for fall damage', () => {
    const w = flatWorld(150, { tankColumns: [40, 260], map: { width: 600, height: 300 } });
    let highest = w.tanks[1]!.y;
    const idx = w.weaponByIndex('weapon.tornado');
    w.projectiles.push({
      id: 1,
      weapon: idx,
      owner: 0,
      x: 200 * 65536,
      y: (w.grid.surfaceY(200) - 6) * 65536,
      vx: 0,
      vy: 65536,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    for (let n = 0; n < 2000 && w.phase === 'resolve'; n++) {
      w.step();
      highest = Math.min(highest, w.tanks[1]!.y);
    }
    expect(w.phase).not.toBe('resolve');
    expect(150 - highest).toBeGreaterThan(30);
    expect(w.tanks[1]!.health).toBeLessThan(80);
    expect(w.tanks[1]!.x).toBeGreaterThan(270);
    // the shooter, far behind it, is left alone
    expect(w.tanks[0]!.health).toBe(100);
  });

  it('runs off with the wind', () => {
    const w = flatWorld(150, { tankColumns: [20, 380], wind: -0.004 });
    dropAt(w, 'weapon.tornado', 250);
    // a trench is scooped along its track, to the left of the impact
    expect(w.grid.surfaceY(180)).toBeGreaterThan(150);
    expect(w.grid.surfaceY(330)).toBeLessThanOrEqual(150);
  });
});
