import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { flatWorld } from '../../../src/testing';

describe('weapon.cloud-whale', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.cloud-whale')).toBe(true);
  });

  it('pressing fire again in flight lets the whale out right there', () => {
    const w = flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, 560] });
    let pop: { x: number; y: number } | undefined;
    const emit = w.emit.bind(w);
    w.emit = (type, x, y, r, p) => {
      if (type === 'whalePop') pop ??= { x, y };
      emit(type, x, y, r, p);
    };
    w.tanks[0]!.inventory[w.weaponByIndex('weapon.cloud-whale')] = 1;
    w.applyInput(0, { type: 'selectWeapon', weapon: 'weapon.cloud-whale' });
    w.applyInput(0, { type: 'aim', angle: 60, power: 700 });
    w.applyInput(0, { type: 'fire' });
    w.step();
    expect(w.phase).toBe('resolve');
    for (let n = 0; n < 30; n++) w.step();
    expect(w.commandable()).toBe(0);
    // someone else pressing does nothing
    w.applyInput(1, { type: 'fire' });
    w.step();
    expect(pop).toBeUndefined();
    w.applyInput(0, { type: 'fire' });
    w.step();
    expect(pop).toBeDefined();
    // let go high in the air, well short of where it would have landed
    expect(pop!.y).toBeLessThan(120);
    expect(pop!.x).toBeLessThan(200);
    expect(w.commandable()).toBe(-1);
    for (let n = 0; n < 3000 && w.phase === 'resolve'; n++) w.step();
    expect(w.phase).toBe('aim');
    expect(w.ops).toHaveLength(0);
  });
});
