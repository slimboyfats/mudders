import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { dropAt, effectsOf, flatWorld } from '../../../src/testing';

describe('weapon.upfall', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.upfall')).toBe(true);
  });

  it('opens a column that resolves within the shot', () => {
    const w = flatWorld(150);
    let seen = 0;
    const emit = w.emit.bind(w);
    w.emit = (type, x, y, r, p) => {
      if (type === 'upfallDrop') seen++;
      emit(type, x, y, r, p);
    };
    dropAt(w, 'weapon.upfall', 200, 3000);
    expect(w.phase).toBe('aim');
    expect(w.ops).toHaveLength(0);
    expect(seen + effectsOf(w, 'upfallDrop').length).toBeGreaterThan(0);
  });
});
