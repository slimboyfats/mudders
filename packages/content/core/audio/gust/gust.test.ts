import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.gust', () => {
  it('is a quiet licensed synth whoosh that plays on gusts', () => {
    const a = loadContent().get('audio', 'audio.gust');
    expect(a.licence.spdx).toBe('CC0-1.0');
    expect(a.synth?.voices.length).toBeGreaterThan(0);
    for (const v of a.synth?.voices ?? []) expect(v.volume).toBeGreaterThan(0);
    expect(a.on.some((o) => o.event === 'gust')).toBe(true);
    // gusts come every second or so: never stack the whoosh
    expect(a.gap).toBeGreaterThanOrEqual(1);
  });
});
