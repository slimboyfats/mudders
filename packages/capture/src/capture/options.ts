import { QUALITIES, type Quality } from '@mudders/client/render-types';
import { DEVICES } from './devices';

export interface CaptureOptions {
  /** Scenario id (file in scenarios/) or preset name. */
  target: string;
  /** Subject for a preset (e.g. the weapon id). */
  subject: string | undefined;
  gif: boolean;
  mp4: boolean;
  quality: Quality;
  renderer: 'pixel';
  seed: number | undefined;
  fps: number;
  scale: number;
  device: string | undefined;
  zoom: number;
  center: { x: number; y: number } | undefined;
  diff: boolean;
  updateReference: boolean;
  cache: boolean;
  shake: boolean;
  /** Play the round's deciding blow in slow motion, as the game does. */
  slowmo: boolean;
  /** Theme id overriding the scenario's (`theme.*`). */
  theme: string | undefined;
}

export const USAGE = `usage: pnpm capture <scenario | preset [subject]> [options]

  presets: weapon-showcase <weapon-id>
  --gif | --mp4         formats to write (default: MP4 only; it is ~5x smaller than a GIF)
  --quality low|medium|high   (default medium)
  --renderer pixel      (the only renderer in v1)
  --seed N              override the scenario seed
  --fps N               20–60 (default 30)
  --scale N             device px per map cell when no --device (default 2)
  --device s23plus|iphone14   render at that phone's landscape viewport and DPR
  --zoom K --center x,y close-up: K zoom steps from fit, centred on map point x,y
  --diff                compare the sheet with captures/reference/ and fail on visible change
  --update-reference    write the sheet to captures/reference/ (commit it)
  --no-cache            render even if an identical capture exists
  --no-shake            disable screen shake
  --slowmo              play the blow that decides the round in slow motion, as the game does
  --theme <theme-id>    render with this theme (default: the scenario's, else theme.default)`;

export class UsageError extends Error {}

export function parseArgs(argv: string[]): CaptureOptions {
  const pos: string[] = [];
  const o: CaptureOptions = {
    target: '',
    subject: undefined,
    gif: false,
    mp4: true,
    quality: 'medium',
    renderer: 'pixel',
    seed: undefined,
    fps: 30,
    scale: 2,
    device: undefined,
    zoom: 0,
    center: undefined,
    diff: false,
    updateReference: false,
    cache: true,
    shake: true,
    slowmo: false,
    theme: undefined,
  };
  let onlyGif = false;
  let onlyMp4 = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const val = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      return v;
    };
    const int = (lo: number, hi: number): number => {
      const v = Number(val());
      if (!Number.isInteger(v) || v < lo || v > hi) {
        throw new UsageError(`${a} must be an integer in ${lo}..${hi}`);
      }
      return v;
    };
    switch (a) {
      case '--gif':
        onlyGif = true;
        break;
      case '--mp4':
        onlyMp4 = true;
        break;
      case '--quality': {
        const q = val();
        if (!(QUALITIES as readonly string[]).includes(q))
          throw new UsageError(`bad --quality ${q}`);
        o.quality = q as Quality;
        break;
      }
      case '--renderer': {
        const r = val();
        if (r !== 'pixel') throw new UsageError(`unknown renderer ${r} (only "pixel" exists)`);
        break;
      }
      case '--seed':
        o.seed = int(0, 0xffffffff);
        break;
      case '--fps':
        o.fps = int(10, 60);
        if (60 % o.fps !== 0) throw new UsageError('--fps must divide 60 (10, 12, 15, 20, 30, 60)');
        break;
      case '--scale':
        o.scale = int(1, 8);
        break;
      case '--device': {
        const d = val();
        if (!Object.hasOwn(DEVICES, d)) throw new UsageError(`unknown device ${d}`);
        o.device = d;
        break;
      }
      case '--zoom':
        o.zoom = int(0, 12);
        break;
      case '--center': {
        const m = /^(\d+),(\d+)$/.exec(val());
        if (!m) throw new UsageError('--center wants x,y');
        o.center = { x: Number(m[1]), y: Number(m[2]) };
        break;
      }
      case '--diff':
        o.diff = true;
        break;
      case '--update-reference':
        o.updateReference = true;
        break;
      case '--no-cache':
        o.cache = false;
        break;
      case '--no-shake':
        o.shake = false;
        break;
      case '--slowmo':
        o.slowmo = true;
        break;
      case '--theme': {
        const t = val();
        if (!/^theme\.[a-z0-9-]+$/.test(t)) throw new UsageError(`bad --theme ${t}`);
        o.theme = t;
        break;
      }
      default:
        if (a.startsWith('--')) throw new UsageError(`unknown option ${a}`);
        pos.push(a);
    }
  }
  if (pos.length === 0) throw new UsageError('missing scenario');
  o.target = pos[0]!;
  o.subject = pos[1];
  // default MP4 only (Joel, 2026-11-05: GIF only when asked); flags pick formats explicitly
  if (onlyGif || onlyMp4) {
    o.gif = onlyGif;
    o.mp4 = onlyMp4;
  }
  return o;
}
