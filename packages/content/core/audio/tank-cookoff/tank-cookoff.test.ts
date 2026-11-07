import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.tank-cookoff', () => {
  it('is a licensed synth patch on tankDeath whose voices all make sound', () => {
    const a = loadContent().get('audio', 'audio.tank-cookoff');
    expect(a.licence.spdx).toBe('CC0-1.0');
    expect(a.on.map((o) => o.event)).toEqual(['tankDeath']);
    for (const v of a.synth?.voices ?? []) expect(v.volume).toBeGreaterThan(0);
  });

  it('pops four times, in step with the renderer cook-offs (34, 72, 118, 168 ticks at 60 Hz)', () => {
    const a = loadContent().get('audio', 'audio.tank-cookoff');
    const pops = (a.synth?.voices ?? [])
      .filter((v) => v.wave === 'noise' && v.hold < 1)
      .map((v) => Math.round(v.delay * 60));
    expect(pops).toEqual([34, 72, 118, 168]);
  });
});
