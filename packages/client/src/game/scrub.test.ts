import { describe, expect, it } from 'vitest';
import { ANGLE_SCRUB, POWER_SCRUB, nudgeStep, scrubMove, scrubRate, scrubValue } from './scrub';

describe('scrub', () => {
  it('moves at full speed near the control', () => {
    expect(scrubRate(POWER_SCRUB, 0)).toBe(1);
    expect(scrubRate(POWER_SCRUB, -40)).toBe(1);
    expect(scrubMove(POWER_SCRUB, 500, 40, 10)).toBe(600);
  });
  it('slows down when the finger moves away (fine mode)', () => {
    expect(scrubRate(POWER_SCRUB, 80)).toBeCloseTo(0.6);
    expect(scrubRate(POWER_SCRUB, -120)).toBeCloseTo(0.2);
    expect(scrubRate(POWER_SCRUB, -500)).toBeCloseTo(0.2);
    expect(scrubMove(ANGLE_SCRUB, 45, 10, 200)).toBeCloseTo(45.8);
  });
  it('clamps to the range and rounds what is sent', () => {
    expect(scrubMove(ANGLE_SCRUB, 170, 100, 0)).toBe(180);
    expect(scrubMove(POWER_SCRUB, 10, -100, 0)).toBe(0);
    expect(scrubValue(ANGLE_SCRUB, 44.6)).toBe(45);
    expect(scrubValue(POWER_SCRUB, 1200)).toBe(1000);
  });
  it('nudges small first, then big while held', () => {
    expect(nudgeStep(0, 1, 5)).toBe(1);
    expect(nudgeStep(7, 1, 5)).toBe(1);
    expect(nudgeStep(8, 1, 5)).toBe(5);
  });
});
