import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.frost-blast', () => {
  it('is a licensed synth patch that plays on the Frost Bomb burst', () => {
    const a = loadContent().get('audio', 'audio.frost-blast');
    expect(a.licence.spdx).toBe('CC0-1.0');
    expect(a.synth?.voices.length).toBeGreaterThan(0);
    for (const v of a.synth?.voices ?? []) expect(v.volume).toBeGreaterThan(0);
    expect(a.on.map((o) => o.event)).toEqual(['frostBlast']);
  });
});
