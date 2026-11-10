import { describe, expect, it } from 'vitest';
import { PROCESS_KINDS } from '@mudders/shared';
import { layerSamples, PROCESS_REF, processLevels } from './soundscape';

describe('process soundscape', () => {
  it('maps counts to 0–1 levels, silent for nothing and for a stray cell', () => {
    const none = processLevels({});
    for (const k of PROCESS_KINDS) expect(none[k]).toBe(0);
    expect(processLevels({ burning: 1 }).burning).toBe(0);
    const some = processLevels({ burning: PROCESS_REF.burning / 4 }).burning;
    expect(some).toBeCloseTo(0.5);
    expect(processLevels({ burning: PROCESS_REF.burning * 10 }).burning).toBe(1);
  });

  it('a bigger fire is louder', () => {
    const small = processLevels({ burning: 30 }).burning;
    const big = processLevels({ burning: 200 }).burning;
    expect(big).toBeGreaterThan(small);
  });

  it('every layer makes sound, stays in range and repeats exactly', () => {
    for (const k of PROCESS_KINDS) {
      const d = layerSamples(k);
      let s = 0;
      let peak = 0;
      for (const v of d) {
        s += v * v;
        peak = Math.max(peak, Math.abs(v));
      }
      const rms = Math.sqrt(s / d.length);
      expect(rms, k).toBeGreaterThan(0.03);
      expect(peak, k).toBeLessThanOrEqual(1.2);
      expect(layerSamples(k)).toEqual(d);
    }
  });
});
