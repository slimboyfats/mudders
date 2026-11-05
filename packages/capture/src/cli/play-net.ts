/** pnpm play:net — online play end to end in headless Chromium: P2P, relay, copy-paste (see play-net.ts). */
import { runPlayNet } from '../play-net';

export async function main(): Promise<number> {
  try {
    const res = await runPlayNet();
    for (const l of res.lines) console.error(l);
    console.error(`play net ok: ${res.screenshots.length} screenshots`);
    for (const p of res.screenshots) console.log(p);
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
}
