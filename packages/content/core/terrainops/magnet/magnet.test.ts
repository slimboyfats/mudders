import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.magnet', () => {
  it('pulls a tank up a gentle slope toward the mine', () => {
    const w = flatWorld(150, { tankColumns: [20, 280] });
    const dirt = w.mats.cellOf('material.dirt');
    // a low ramp up toward the mine: three 3-cell steps
    for (let s = 0; s < 3; s++)
      for (let y = 147 - s * 3; y < 150; y++)
        for (let x = 210; x < 255 - s * 12; x++) w.grid.material[y * w.grid.width + x] = dirt;
    w.grid.clearSettle();
    const y0 = w.tanks[1]!.y;
    let minX = 280;
    let minY = y0;
    for (let n = 0; n < 200 && minX > 220; n++) {
      if (n === 0) {
        const idx = w.weaponByIndex('weapon.magnet-mine');
        w.projectiles.push({
          id: 1,
          weapon: idx,
          owner: 0,
          x: 200 * 65536,
          y: (w.grid.surfaceY(200) - 4) * 65536,
          vx: 0,
          vy: 65536,
          age: 10,
          alive: true,
          data: [],
        });
        w.phase = 'resolve';
      }
      w.step();
      minX = Math.min(minX, w.tanks[1]!.x);
      minY = Math.min(minY, w.tanks[1]!.y);
    }
    expect(minX).toBeLessThan(230);
    expect(y0 - minY).toBeGreaterThanOrEqual(6);
  });

  it('tears exposed metal out of the ground and drags it in', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const iron = w.mats.cellOf('material.meteorite');
    for (let y = 148; y < 150; y++)
      for (let x = 240; x < 270; x++) w.grid.material[y * w.grid.width + x] = iron;
    w.grid.clearSettle();
    const before = countCells(w, 'material.meteorite');
    dropAt(w, 'weapon.magnet-mine', 200);
    let left = 0;
    for (let y = 140; y < 150; y++)
      for (let x = 240; x < 270; x++) if (w.grid.material[y * w.grid.width + x] === iron) left++;
    expect(left).toBeLessThan(before / 2);
  });
});
