import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.drill', () => {
  it('is a licensed synth patch on the drill event whose voices all make sound', () => {
    const a = loadContent().get('audio', 'audio.drill');
    expect(a.licence.spdx).toBe('CC0-1.0');
    expect(a.on.map((o) => o.event)).toContain('drill');
    for (const v of a.synth?.voices ?? []) expect(v.volume).toBeGreaterThan(0);
  });
});
