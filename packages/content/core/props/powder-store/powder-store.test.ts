import { describe, expect, it } from 'vitest';
import { countCells, dropAt, effectsOf, propWorld } from '../../../src/testing';

describe('prop.powder-store', () => {
  it('stands as a brick bunker full of gunpowder kegs and stays still', () => {
    const w = propWorld('prop.powder-store', 200);
    expect(countCells(w, 'material.keg-powder')).toBeGreaterThan(90);
    expect(countCells(w, 'material.brick')).toBeGreaterThan(80);
    w.run(200);
    expect(w.quiet).toBe(true);
  });

  it('goes off in a chain when a shell lands on it, and is torn apart', () => {
    const w = propWorld('prop.powder-store', 200);
    const powder = countCells(w, 'material.keg-powder');
    effectsOf(w, 'shake');
    dropAt(w, 'weapon.baby-missile', 196);
    w.run(600);
    const booms = effectsOf(w, 'shake').length;
    expect(countCells(w, 'material.keg-powder')).toBeLessThan(powder / 4);
    expect(booms).toBeGreaterThan(3);
    expect(w.groups.broken[1]).toBe(1);
  });
});
