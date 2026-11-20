import { describe, expect, it } from 'vitest';
import { makeWorld } from '../../../src/testing';

describe('gen.bare-hills', () => {
  it('is the hills ground with nothing standing on it', () => {
    const opts = (generator: string) => ({
      seed: 202,
      players: 2,
      map: { generator, width: 800, height: 400 },
      tankColumns: [100, 600],
      rules: { mapEvents: true },
    });
    const bare = makeWorld(opts('gen.bare-hills'));
    const hills = makeWorld(opts('gen.hills'));
    expect(bare.groups.count).toBe(0);
    expect(hills.groups.count).toBeGreaterThan(0);
    // same ground: the surface height of every column matches except where hills levelled ground for its props
    const g = bare.grid;
    let same = 0;
    for (let x = 0; x < g.width; x++) {
      let a = 0;
      let b = 0;
      while (a < g.height && g.material[a * g.width + x] === 0) a++;
      while (b < g.height && hills.grid.material[b * g.width + x] === 0) b++;
      if (a === b) same++;
    }
    expect(same).toBeGreaterThan(g.width * 0.7);
    expect(bare.hash()).toBe(makeWorld(opts('gen.bare-hills')).hash());
  });
});
