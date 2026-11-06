import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.magnet-clank', () => {
  it('is a licensed synth clank that sounds when a tank clamps onto a magnet', () => {
    const a = loadContent().get('audio', 'audio.magnet-clank');
    expect(a.licence.spdx).toBe('CC0-1.0');
    expect(a.synth?.voices.some((v) => v.wave === 'metal')).toBe(true);
    expect(a.on.some((o) => o.event === 'magnetClank')).toBe(true);
  });
});
