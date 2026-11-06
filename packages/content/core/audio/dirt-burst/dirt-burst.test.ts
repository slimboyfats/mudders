import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.dirt-burst', () => {
  it('is a licensed synth patch on the Dirt Bomb burst whose voices all make sound', () => {
    const a = loadContent().get('audio', 'audio.dirt-burst');
    expect(a.licence.spdx).toBe('CC0-1.0');
    expect(a.on.map((o) => o.event)).toEqual(['dirtBurst']);
    for (const v of a.synth?.voices ?? []) expect(v.volume).toBeGreaterThan(0);
  });
});
