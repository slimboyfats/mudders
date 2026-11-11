import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { fireAndPress, flatWorld } from '../../../src/testing';

const world = () => flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, 560] });
const settle = (w: ReturnType<typeof world>) => {
  for (let n = 0; n < 3000 && w.phase === 'resolve'; n++) w.step();
};

describe('weapon.blink', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.blink')).toBe(true);
  });

  it('jumps the shooter to under the press point', () => {
    const w = world();
    const at = fireAndPress(w, 'weapon.blink', 60, 700, 30);
    expect(at).not.toBeNull();
    settle(w);
    expect(Math.abs(w.tanks[0]!.x - at!.x)).toBeLessThan(12);
    expect(w.tanks[0]!.alive).toBe(true);
  });
});
