import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('gear.heavy-shield', () => {
  it('raises the shield to 100 and takes a direct missile hit without health loss', () => {
    const w = flatWorld(150, { tankSetup: [{ inventory: { 'gear.heavy-shield': 1 } }] });
    const t = w.tanks[0]!;
    w.applyInput(0, { type: 'useGear', gear: 'gear.heavy-shield' });
    w.step();
    expect(t.shield).toBe(100);
    expect(w.snapshot().entities[0]).toMatchObject({ shield: 100, maxShield: 100 });
    dropAt(w, 'weapon.missile', t.x);
    expect(t.health).toBe(100);
  });

  it('tops a Bulwark up to 100, while a plain Shield would change nothing', () => {
    const w = flatWorld(150, {
      tanks: ['tank.bulwark', null],
      tankSetup: [{ inventory: { 'gear.shield': 1, 'gear.heavy-shield': 1 } }],
    });
    const t = w.tanks[0]!;
    expect(t.shield).toBe(50);
    w.applyInput(0, { type: 'useGear', gear: 'gear.shield' });
    w.applyInput(0, { type: 'useGear', gear: 'gear.heavy-shield' });
    w.step();
    expect(t.shield).toBe(100);
    expect(t.gear[w.gear.findIndex((x) => x.id === 'gear.shield')]).toBe(1);
  });
});
