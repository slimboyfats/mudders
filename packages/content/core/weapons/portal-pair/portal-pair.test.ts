import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.portal-pair', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.portal-pair')).toBe(true);
  });

  it('opens a pair of rings that stay after the shot resolves, harmlessly', () => {
    const w = flatWorld(150, { map: { width: 800, height: 240 }, tankColumns: [60, 700] });
    dropAt(w, 'weapon.portal-pair', 400);
    expect(w.phase).toBe('aim');
    expect(w.ops).toHaveLength(1);
    expect(w.tanks[0]!.health).toBe(100);
    expect(w.tanks[1]!.health).toBe(100);
  });
});
