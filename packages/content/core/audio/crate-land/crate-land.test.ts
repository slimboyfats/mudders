import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.crate-land', () => {
  it('is a licensed synth patch that plays on dropLand', () => {
    const a = loadContent().get('audio', 'audio.crate-land');
    expect(a.licence.spdx).toBe('CC0-1.0');
    expect(a.synth?.voices.length).toBeGreaterThan(0);
    for (const v of a.synth?.voices ?? []) expect(v.volume).toBeGreaterThan(0);
    expect(a.on.map((o) => o.event)).toContain('dropLand');
  });
});
