import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.tsunami', () => {
  it('is a licensed synth patch that rumbles as the Dirt Tsunami rears up', () => {
    const a = loadContent().get('audio', 'audio.tsunami');
    expect(a.licence.spdx).toBe('CC0-1.0');
    expect(a.synth?.voices.length).toBeGreaterThan(0);
    for (const v of a.synth?.voices ?? []) expect(v.volume).toBeGreaterThan(0);
    expect(a.on.map((o) => o.event)).toEqual(['tsunamiRise']);
  });
});
