import { describe, expect, it } from 'vitest';
import { FfmpegMissingError, checkFfmpeg, gifArgs } from './ffmpeg';

describe('checkFfmpeg', () => {
  it('throws a helpful error when the binary is missing', () => {
    expect(() => checkFfmpeg('definitely-not-ffmpeg-xyz')).toThrow(FfmpegMissingError);
    expect(() => checkFfmpeg('definitely-not-ffmpeg-xyz')).toThrow(/apt-get install -y ffmpeg/);
  });
});

describe('gifArgs', () => {
  it('builds a palettegen/paletteuse pipeline at the given fps', () => {
    const args = gifArgs({ inputPattern: 'f-%03d.png', fps: 24, output: 'out.gif' });
    expect(args).toContain('f-%03d.png');
    expect(args[args.indexOf('-framerate') + 1]).toBe('24');
    expect(args.join(' ')).toMatch(/palettegen.*paletteuse/);
    expect(args.at(-1)).toBe('out.gif');
  });
});
