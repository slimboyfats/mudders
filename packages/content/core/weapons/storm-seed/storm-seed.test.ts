import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { fireAndPress, flatWorld } from '../../../src/testing';

const world = () => flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, 560] });
const settle = (w: ReturnType<typeof world>) => {
  for (let n = 0; n < 3000 && w.phase === 'resolve'; n++) w.step();
};

describe('weapon.storm-seed', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.storm-seed')).toBe(true);
  });

  it('leaves a storm cloud over where it was let go', () => {
    const w = world();
    const at = fireAndPress(w, 'weapon.storm-seed', 60, 700, 30);
    expect(at).not.toBeNull();
    settle(w);
    expect(w.zones).toHaveLength(1);
    expect(Math.abs(w.zones[0]!.x - at!.x)).toBeLessThan(10);
  });
});
