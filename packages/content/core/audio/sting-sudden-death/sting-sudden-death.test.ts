import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.sting-sudden-death', () => {
  it('is a licensed live music-bus sting', () => {
    const a = loadContent().get('audio', 'audio.sting-sudden-death');
    expect(a.bus).toBe('music');
    expect(a.licence.spdx).toBe('CC0-1.0');
    expect(a.live?.song).toBe('sting-sudden-death');
  });
});
