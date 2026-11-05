/**
 * A timer that keeps running in a hidden tab. Browsers throttle a hidden page's `setInterval` to
 * once a second, and after a few minutes to once a minute, and stop `requestAnimationFrame`
 * entirely. A dedicated worker's timers are not throttled that way, so the worker ticks and the
 * page does the work on each message. The host uses it so a hidden host tab keeps the match, the
 * pings and the guests' permits going (§6.1); a phone that suspends the whole page still stops,
 * which the guests see as a dropped host (`needs-device`).
 *
 * Falls back to `setInterval` where a worker can't start (a strict CSP, or tests).
 */
export function startTicker(fn: () => void, ms: number): () => void {
  let url = '';
  try {
    url = URL.createObjectURL(
      new Blob([`setInterval(() => postMessage(0), ${Math.max(4, ms | 0)});`], {
        type: 'text/javascript',
      }),
    );
    const worker = new Worker(url);
    worker.onmessage = fn;
    return () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    if (url) URL.revokeObjectURL(url);
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }
}

/** The most simulated time one background tick may catch up (a stalled worker, a busy CPU). */
export const BACKGROUND_CATCHUP_MS = 1000;
