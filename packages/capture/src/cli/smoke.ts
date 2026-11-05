import { FfmpegMissingError, checkFfmpeg } from '../ffmpeg';
import { runWebgl2Smoke } from '../smoke';

try {
  console.log(checkFfmpeg());
  const res = await runWebgl2Smoke();
  console.log(`WebGL2 renderer: ${res.renderer}`);
  console.log(`frames: ${res.frames}`);
  // Output paths last, one per line, so an agent can attach them (REQUIREMENTS §2d).
  console.log(res.png);
  console.log(res.gif);
} catch (err) {
  console.error(err instanceof FfmpegMissingError ? err.message : err);
  process.exit(1);
}
