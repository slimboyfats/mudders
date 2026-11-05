import { spawnSync } from 'node:child_process';

export class FfmpegMissingError extends Error {
  constructor(bin: string) {
    super(
      [
        `ffmpeg not found (looked for "${bin}" on PATH).`,
        'The capture CLI needs ffmpeg to encode GIF/MP4. Install it with one of:',
        '  sudo apt-get install -y ffmpeg',
        '  or download a static build from https://johnvansickle.com/ffmpeg/ and put it on PATH',
        'Set FFMPEG_PATH to use a binary that is not on PATH.',
      ].join('\n'),
    );
    this.name = 'FfmpegMissingError';
  }
}

export function ffmpegBin(): string {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

/** Returns the ffmpeg version line, or throws FfmpegMissingError with install instructions. */
export function checkFfmpeg(bin: string = ffmpegBin()): string {
  const res = spawnSync(bin, ['-hide_banner', '-version'], { encoding: 'utf8' });
  if (res.error || res.status !== 0) throw new FfmpegMissingError(bin);
  const firstLine = res.stdout.split('\n')[0]?.trim();
  return firstLine || 'ffmpeg (unknown version)';
}

/**
 * Arguments to encode a numbered PNG sequence into a small, palette-quantised GIF
 * (palettegen + paletteuse in one filter graph, REQUIREMENTS §2d).
 */
export function gifArgs(opts: { inputPattern: string; fps: number; output: string }): string[] {
  const { inputPattern, fps, output } = opts;
  return [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    String(fps),
    '-i',
    inputPattern,
    '-filter_complex',
    '[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
    '-loop',
    '0',
    output,
  ];
}

export function encodeGif(opts: { inputPattern: string; fps: number; output: string }): void {
  const res = spawnSync(ffmpegBin(), gifArgs(opts), { encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    throw new Error(`ffmpeg failed: ${res.stderr || res.error?.message}`);
  }
}
