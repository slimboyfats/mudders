/** pnpm play:smoke — hot-seat match smoke test on emulated phones + laptop (see play-smoke.ts). */
import { runPlaySmoke } from '../play-smoke';

export async function main(): Promise<number> {
  try {
    const res = await runPlaySmoke();
    console.error(`play smoke ok: ${res.screenshots.length} screenshots`);
    for (const p of res.screenshots) console.log(p);
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
}
