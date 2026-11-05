import { FfmpegMissingError, checkFfmpeg } from '../ffmpeg';

try {
  console.log(checkFfmpeg());
} catch (err) {
  console.error(err instanceof FfmpegMissingError ? err.message : err);
  process.exit(1);
}
