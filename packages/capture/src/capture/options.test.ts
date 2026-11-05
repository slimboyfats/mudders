import { describe, expect, it } from 'vitest';
import { UsageError, parseArgs } from './options';

describe('capture options', () => {
  it('defaults to MP4 only at medium quality', () => {
    const o = parseArgs(['weapon.missile']);
    expect(o).toMatchObject({
      target: 'weapon.missile',
      gif: false,
      mp4: true,
      quality: 'medium',
      fps: 30,
    });
  });
  it('parses presets, formats and flags', () => {
    const o = parseArgs([
      'weapon-showcase',
      'weapon.shockwave',
      '--gif',
      '--quality',
      'high',
      '--device',
      'iphone14',
      '--zoom',
      '2',
      '--center',
      '400,200',
      '--seed',
      '9',
      '--no-cache',
      '--diff',
    ]);
    expect(o).toMatchObject({
      target: 'weapon-showcase',
      subject: 'weapon.shockwave',
      gif: true,
      mp4: false,
      quality: 'high',
      device: 'iphone14',
      zoom: 2,
      center: { x: 400, y: 200 },
      seed: 9,
      cache: false,
      diff: true,
    });
  });
  it('rejects bad input', () => {
    expect(() => parseArgs([])).toThrow(UsageError);
    expect(() => parseArgs(['x', '--fps', '7'])).toThrow(UsageError);
    expect(() => parseArgs(['x', '--device', 'pager'])).toThrow(UsageError);
    expect(() => parseArgs(['x', '--renderer', 'voxel'])).toThrow(UsageError);
    expect(() => parseArgs(['x', '--bogus'])).toThrow(UsageError);
  });
});
