import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.kaiju', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.kaiju')).toBe(true);
  });

  it('summons a monster that stays after the shot resolves', () => {
    const w = flatWorld(150, { map: { width: 800, height: 240 }, tankColumns: [60, 700] });
    dropAt(w, 'weapon.kaiju', 400);
    expect(w.phase).toBe('aim');
    expect(w.ops).toHaveLength(1);
  });
});
