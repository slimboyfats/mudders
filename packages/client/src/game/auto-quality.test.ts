import { describe, expect, it } from 'vitest';
import { AutoQuality, renderDpr } from './auto-quality';

/** Feed `seconds` of frames `ms` long; returns the qualities it switched to. */
function run(a: AutoQuality, ms: number, seconds: number): string[] {
  const out: string[] = [];
  for (let t = 0; t < seconds * 1000; t += ms) {
    const q = a.frame(ms);
    if (q) out.push(q);
  }
  return out;
}

describe('AutoQuality', () => {
  it('holds the chosen quality while frames are smooth', () => {
    const a = new AutoQuality('high');
    expect(run(a, 16.7, 120)).toEqual([]);
    expect(a.quality).toBe('high');
  });

  it('steps down a level at a time while frames run long, and stops at low', () => {
    const a = new AutoQuality('high');
    expect(run(a, 40, 60)).toEqual(['medium', 'low']);
    expect(a.quality).toBe('low');
  });

  it('never goes above the chosen quality', () => {
    const a = new AutoQuality('medium');
    expect(run(a, 8, 300)).toEqual([]);
    expect(a.quality).toBe('medium');
  });

  it('tries a level again once after a long smooth stretch, then gives it up for good', () => {
    const a = new AutoQuality('high');
    expect(run(a, 40, 7)).toEqual(['medium']);
    expect(run(a, 12, 60)).toEqual(['high']);
    expect(run(a, 40, 7)).toEqual(['medium']);
    expect(run(a, 12, 600)).toEqual([]);
    expect(a.quality).toBe('medium');
  });

  it('ignores hiccups and nonsense frame times', () => {
    const a = new AutoQuality('high');
    for (let i = 0; i < 500; i++) expect(a.frame(i % 2 === 0 ? 5000 : 0)).toBeNull();
    expect(a.quality).toBe('high');
  });
});

describe('renderDpr', () => {
  it('caps the pixel density on low quality only', () => {
    expect(renderDpr('high', 3)).toBe(3);
    expect(renderDpr('medium', 3)).toBe(3);
    expect(renderDpr('low', 3)).toBe(2);
    expect(renderDpr('low', 1)).toBe(1);
    expect(renderDpr('low', 0)).toBe(1);
  });
});
