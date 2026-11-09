import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.rogue-hole', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.rogue-hole')).toBe(true);
  });

  it('opens a hole that stays after the shot resolves', () => {
    const w = flatWorld(150, { map: { width: 800, height: 240 }, tankColumns: [60, 700] });
    dropAt(w, 'weapon.rogue-hole', 300);
    expect(w.phase).toBe('aim');
    expect(w.ops).toHaveLength(1);
  });
});
