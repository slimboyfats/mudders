import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { ffmpegBin } from '../ffmpeg';
import type { Frame } from './frame';

/** Streams raw RGB frames into one ffmpeg process. */
export class RawEncoder {
  private readonly proc: ChildProcess;
  private stderr = '';

  constructor(width: number, height: number, fps: number, outArgs: string[]) {
    this.proc = spawn(
      ffmpegBin(),
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-s',
        `${width}x${height}`,
        '-framerate',
        String(fps),
        '-i',
        '-',
        ...outArgs,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    this.proc.stderr?.on('data', (b: Buffer) => (this.stderr += b.toString()));
  }

  async write(f: Frame): Promise<void> {
    const stdin = this.proc.stdin!;
    if (!stdin.write(f.data)) await once(stdin, 'drain');
  }

  async close(): Promise<void> {
    this.proc.stdin!.end();
    const [code] = (await once(this.proc, 'close')) as [number | null];
    if (code !== 0) throw new Error(`ffmpeg failed (${code}): ${this.stderr}`);
  }
}

export function gifOutArgs(output: string, scaleWidth: number): string[] {
  return [
    '-filter_complex',
    `[0:v]scale=${scaleWidth}:-2:flags=neighbor,split[a][b];[a]palettegen=stats_mode=diff:max_colors=128[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
    '-loop',
    '0',
    output,
  ];
}

export function mp4OutArgs(output: string, scale: number): string[] {
  return [
    '-vf',
    `scale=trunc(iw*${scale}/2)*2:trunc(ih*${scale}/2)*2:flags=neighbor`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '20',
    '-preset',
    'veryfast',
    '-movflags',
    '+faststart',
    output,
  ];
}

/** Stack frames vertically (with a 4 px gap) into one PNG. */
export function writeSheet(frames: Frame[], output: string): void {
  const f0 = frames[0]!;
  const gap = 4;
  const h = frames.length * f0.height + (frames.length - 1) * gap;
  const buf = new Uint8Array(f0.width * h * 3).fill(16);
  frames.forEach((f, i) => buf.set(f.data, i * (f0.height + gap) * f0.width * 3));
  const res = spawnSync(
    ffmpegBin(),
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-s',
      `${f0.width}x${h}`,
      '-i',
      '-',
      '-frames:v',
      '1',
      output,
    ],
    { input: buf },
  );
  if (res.status !== 0) throw new Error(`ffmpeg sheet failed: ${res.stderr.toString()}`);
}
