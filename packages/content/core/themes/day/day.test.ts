import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('theme.day', () => {
  it('loads with a full sky, light and ambient set', () => {
    const t = loadContent().get('theme', 'theme.day');
    expect(t.sky.top).toMatch(/^#[0-9a-f]{6}$/);
    expect(t.sky.bottom).toMatch(/^#[0-9a-f]{6}$/);
    expect(t.ambient.kind).toBe('dust');
    expect(t.scenery.clouds?.cover).toBeGreaterThan(0);
    expect(t.scenery.ranges).toHaveLength(3);
    expect(t.scenery.grass).toMatch(/^#[0-9a-f]{6}$/);
  });
});
