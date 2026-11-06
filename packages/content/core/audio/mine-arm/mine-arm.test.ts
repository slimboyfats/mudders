import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.mine-arm', () => {
  it('is a licensed synth patch whose voices all make sound', () => {
    const a = loadContent().get('audio', 'audio.mine-arm');
    expect(a.licence.spdx).toBe('CC0-1.0');
    expect(a.synth?.voices.length).toBeGreaterThan(0);
    for (const v of a.synth?.voices ?? []) expect(v.volume).toBeGreaterThan(0);
  });
});
