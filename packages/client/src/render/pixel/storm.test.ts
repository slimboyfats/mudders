import { describe, expect, it } from 'vitest';
import { stormAir, stormFor } from './storm';

describe('storm air', () => {
  it('is off in mild air and on in scorching air', () => {
    expect(stormFor(15).k).toBe(0);
    const hot = stormFor(44);
    expect(hot.kind).toBe('sand');
    expect(stormAir(hot.kind, 0, 100, 0).haze[3]).toBe(0);
    expect(stormAir(hot.kind, hot.k, 100, 0).haze[3]).toBeGreaterThan(0);
  });

  it('rolls the gust sheets with the wind, in whole cells', () => {
    const right = stormAir('sand', 1, 400, 0.008).k[3];
    const left = stormAir('sand', 1, 400, -0.008).k[3];
    expect(right).toBeGreaterThan(0);
    expect(left).toBeLessThan(0);
    expect(Number.isInteger(right)).toBe(true);
  });
});
