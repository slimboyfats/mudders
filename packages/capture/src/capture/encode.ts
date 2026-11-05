import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { ffmpegBin } from '../ffmpeg';

function ffmpeg(args: string[], input?: Buffer): Buffer {
  const res = spawnSync(ffmpegBin(), ['-y', '-loglevel', 'error', ...args], {
    input,
    maxBuffer: 1 << 30,
  });
  if (res.status !== 0) throw new Error(`ffmpeg failed: ${res.stderr.toString()}`);
  return res.stdout;
}

/** GIF from a numbered PNG sequence: ≤ maxWidth wide, palette-quantised (§2d). */
export function encodeGif(pattern: string, fps: number, out: string, maxWidth: number): void {
  const gifFps = Math.min(fps, 30);
  ffmpeg([
    '-framerate',
    String(fps),
    '-i',
    pattern,
    '-filter_complex',
    `[0:v]fps=${gifFps},scale='min(${maxWidth},iw)':-2:flags=lanczos,split[a][b];` +
      `[a]palettegen=stats_mode=diff:max_colors=192[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    '-loop',
    '0',
    out,
  ]);
}

/** H.264 MP4 from a numbered PNG sequence. */
export function encodeMp4(pattern: string, fps: number, out: string): void {
  ffmpeg([
    '-framerate',
    String(fps),
    '-i',
    pattern,
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=neighbor',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '18',
    '-preset',
    'veryfast',
    '-movflags',
    '+faststart',
    out,
  ]);
}

/** Stack PNG frames vertically into one contact sheet. */
export function encodeSheet(frames: string[], out: string): void {
  const inputs = frames.flatMap((f) => ['-i', f]);
  const n = frames.length;
  const pads = frames.map((_, i) => `[${i}:v]pad=iw:ih+${i < n - 1 ? 6 : 0}:0:0:0x101010[p${i}]`);
  const stack = frames.map((_, i) => `[p${i}]`).join('');
  ffmpeg([
    ...inputs,
    '-filter_complex',
    `${pads.join(';')};${stack}vstack=inputs=${n}`,
    '-frames:v',
    '1',
    out,
  ]);
}

/** Decode an image to raw RGB24 plus its size. */
export function decodeRgb(path: string): { width: number; height: number; data: Buffer } {
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=p=0',
      path,
    ],
    { encoding: 'utf8' },
  );
  const [w, h] = (probe.stdout || '').trim().split(',').map(Number);
  if (!w || !h) throw new Error(`cannot read image size of ${path}`);
  const data = ffmpeg(['-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return { width: w, height: h, data };
}

export function fileSize(path: string): number {
  return statSync(path).size;
}
