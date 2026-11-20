import { loadContent } from '@mudders/content';
import { SimHost } from './sim-host';
import { SimWarmup } from './sim-warmup';
import type { FromSim, ToSim } from './sim-wire';

/**
 * The sim worker: every match's World runs here, off the page's thread, so a long tick (a big
 * blast landing, a guest replaying a match after a reload) costs the picture, the camera and the
 * controls nothing. See `sim-wire.ts` for what crosses over and `sim-client.ts` for the page's
 * side.
 */
const scope = self as unknown as {
  postMessage(msg: FromSim, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToSim>) => void) | null;
};

const content = loadContent();
const host = new SimHost(content, (msg, transfer) => scope.postMessage(msg, transfer ?? []));
scope.onmessage = (e) => host.handle(e.data);
scope.postMessage({ t: 'ready' }, []);

// Practice blasts (see `sim-warmup.ts`): compiled code is per thread, so the worker warms its own
// copy of the sim. A few ms at a time, and never while a match resolves a shot.
const WARM_START_MS = 1500;
const WARM_EVERY_MS = 30;
const WARM_SLICE_MS = 4;
const WARM_HOLD_MS = 1000;
const warm = new SimWarmup(content);
let holdUntil = 0;
const slice = (): void => {
  const t0 = performance.now();
  if (host.resolving) holdUntil = t0 + WARM_HOLD_MS;
  if (t0 >= holdUntil) {
    do warm.step();
    while (!warm.done && performance.now() - t0 < WARM_SLICE_MS);
  }
  if (!warm.done) setTimeout(slice, WARM_EVERY_MS);
};
setTimeout(slice, WARM_START_MS);
