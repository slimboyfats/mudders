/**
 * pnpm capture <scenario | preset subject> [options]  (REQUIREMENTS §2d)
 *
 * Runs the scenario through the sim in Node, plays the snapshots through the real pixel renderer
 * in headless Chromium (SwiftShader), and writes GIF, MP4, a `-sheet.png` and a `.json` sidecar to
 * captures/. Output paths are printed last, one per line.
 */
import { USAGE, UsageError, parseArgs } from '../capture/options';
import { runCapture } from '../capture/run';

export async function main(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  try {
    const res = await runCapture(parseArgs(args));
    if (res.cached) console.error('(cached: inputs unchanged)');
    for (const p of res.outputs) console.log(p);
    return 0;
  } catch (e) {
    console.error(e instanceof UsageError ? `${e.message}\n\n${USAGE}` : (e as Error).message);
    return 1;
  }
}
