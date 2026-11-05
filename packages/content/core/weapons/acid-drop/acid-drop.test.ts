import { describe, expect, it } from 'vitest';
import { countCells, dropAt, propWorld } from '../../../src/testing';

describe('weapon.acid-drop', () => {
  it('eats into brick over the next turns', () => {
    const w = propWorld('prop.house', 200, 150, { tankColumns: [20, 380] });
    const brick = () => countCells(w, 'material.brick') + countCells(w, 'material.cracked-brick');
    const b = brick();
    dropAt(w, 'weapon.acid-drop', 196);
    expect(w.zones).toHaveLength(1);
    expect(w.zones[0]!.look).toBe(1);
    expect(brick()).toBeLessThanOrEqual(b);
  });
});
