import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('audio.earth-bridge', () => {
  it('is a licensed synth patch on the earthBridge event whose voices all make sound', () => {
    const a = loadContent().get('audio', 'audio.earth-bridge');
    expect(a.licence.spdx).toBe('CC0-1.0');
    expect(a.on.map((o) => o.event)).toContain('earthBridge');
    expect(a.synth?.voices.length).toBeGreaterThan(0);
    for (const v of a.synth?.voices ?? []) expect(v.volume).toBeGreaterThan(0);
  });
});
