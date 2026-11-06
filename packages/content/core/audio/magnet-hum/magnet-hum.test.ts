import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.magnet-hum', () => {
  it('is a licensed synth hum that sounds when a magnet field switches on', () => {
    const a = loadContent().get('audio', 'audio.magnet-hum');
    expect(a.licence.spdx).toBe('CC0-1.0');
    expect(a.synth?.voices.length).toBeGreaterThan(0);
    for (const v of a.synth?.voices ?? []) expect(v.volume).toBeGreaterThan(0);
    expect(a.on.some((o) => o.event === 'magnetOn')).toBe(true);
  });
});
