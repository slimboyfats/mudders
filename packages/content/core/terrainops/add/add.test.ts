import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { countCells, flatten, makeWorld } from '../../../src/testing';
import add from './behaviour';

describe('terrainop.add', () => {
  it('fills air in a disc with the material and it settles', () => {
    const w = makeWorld({ map: { width: 200, height: 100 } });
    flatten(w, 90);
    const before = countCells(w, 'material.sand');
    const params = add.params.parse({ material: 'material.sand' });
    const r = add.start(w, params, {
      x: 100,
      y: 40,
      radius: 6,
      damageType: 'blast',
      damageTypeIndex: 0,
      owner: 0,
    });
    expect(r).toBeNull();
    expect(countCells(w, 'material.sand') - before).toBeGreaterThan(100);
    w.run(120);
    expect(w.grid.surfaceY(100)).toBeLessThan(90);
    expect(w.grid.surfaceY(100)).toBeGreaterThan(70);
  });

  it('defaults to dirt in its manifest', () => {
    expect(loadContent().get('terrainop', 'terrainop.add')).toMatchObject({
      material: 'material.dirt',
    });
  });
});
