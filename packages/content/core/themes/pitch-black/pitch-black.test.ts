import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('theme.pitch-black', () => {
  it('is dark, with a black sky and no stars, so only glow lights the map', () => {
    const t = loadContent().get('theme', 'theme.pitch-black');
    expect(t.dark).toBeGreaterThan(0.8);
    expect(t.ambient.kind).toBe('none');
    expect(t.scenery.clouds).toBeUndefined();
    expect(parseInt(t.sky.bottom.slice(1), 16)).toBeLessThan(0x101010);
  });

  it('leaves ordinary themes lit', () => {
    expect(loadContent().get('theme', 'theme.default').dark).toBe(0);
  });
});
