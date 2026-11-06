import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.bonk', () => {
  it('is a licensed synth patch that sounds on bumpBounce', () => {
    const a = loadContent().get('audio', 'audio.bonk');
    expect(a.licence.spdx).toBe('CC0-1.0');
    expect(a.synth?.voices.length).toBeGreaterThan(0);
    for (const v of a.synth?.voices ?? []) expect(v.volume).toBeGreaterThan(0);
    expect(a.on.some((o) => o.event === 'bumpBounce')).toBe(true);
  });
});
