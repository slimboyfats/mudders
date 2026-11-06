import { spawn, type ChildProcess } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { preview } from 'vite';
import { SWIFTSHADER_ARGS } from './browser';
import { REPO_ROOT, capturesDir } from './paths';

/**
 * Online play end to end (§6, milestone 4), headless: the built client in separate browser
 * contexts, the real signalling server as a child process. Three runs:
 *
 * - `p2p`: host creates a room, guest opens the share link, WebRTC data channel, a few shots each,
 *   then the guest's link is cut (reconnect) and the guest page reloads (rejoin from the log).
 * - `relay`: the same with WebRTC disabled, so everything goes through the WebSocket relay.
 * - `direct`: server-less copy-paste of invite and reply codes.
 * - `public` (milestone 5): the host lists the room publicly, the guest finds it on the browse
 *   screen; then the host tab is hidden (the match must keep going), the guest leaves for longer
 *   than the takeover window (an AI must play its turns), and the guest comes back to its tank.
 * - `lan`: same-network play as on a home Wi-Fi. Both pages open the machine's network address
 *   (not loopback, so not a secure context) with no `?signal=` override: the client must find
 *   the signal server through the page's own `/signal` proxy, and the share link must carry the
 *   network address.
 *
 * Every run checks the guest never desynced (host-side hash checks) and screenshots both screens.
 * Real NATs, phones and cell handovers are `needs-device`.
 */
export interface PlayNetResult {
  screenshots: string[];
  lines: string[];
}

interface NetDebug {
  me: number;
  tick: () => number;
  hash: () => string;
  phase: () => string;
  active: () => number;
  bots: () => number[];
  alive: () => boolean[];
  desyncs?: () => number;
  paths?: () => (string | null)[];
  rebuilds?: () => number;
  lag?: () => number;
  status?: () => string;
  path?: () => string | null;
  dropLink?: () => void;
}
type DebugKey = Exclude<keyof NetDebug, 'me' | 'dropLink'>;
type Run = 'p2p' | 'relay' | 'direct' | 'public' | 'lan';

async function dbg<T>(page: Page, key: DebugKey): Promise<T> {
  return page.evaluate(
    (k) =>
      (window as unknown as { __muddersNet: Record<string, () => unknown> }).__muddersNet[k]!(),
    key,
  ) as Promise<T>;
}

function startSignal(): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((ok, fail) => {
    const proc = spawn(
      process.execPath,
      ['--import', 'tsx', resolve(REPO_ROOT, 'packages/signal/src/main.ts')],
      { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    const t = setTimeout(() => fail(new Error(`signal server did not start: ${out}`)), 15_000);
    proc.stdout!.on('data', (d: Buffer) => {
      out += d.toString();
      const m = /listening on (http:\/\/\S+)/.exec(out);
      if (m) {
        clearTimeout(t);
        ok({ proc, url: m[1]!.replace('localhost', '127.0.0.1') });
      }
    });
    proc.stderr!.on('data', (d: Buffer) => (out += d.toString()));
    proc.on('exit', (code) => fail(new Error(`signal server exited (${code}): ${out}`)));
  });
}

/** The takeover window the `public` run picks in the host lobby (one of its options). */
const TAKEOVER_TEST_MS = 10_000;

/**
 * Milestone 5 resilience, on a running match:
 * 1. Hide the host tab. Its animation frames stop (the page's own visibility handler cancels
 *    them), so only the background worker can keep the match going: ticks must still advance
 *    on both sides.
 * 2. The guest leaves for longer than the takeover window: an AI must stand in and take the
 *    guest's turn.
 * 3. The guest comes back on the same tab (same seat token): it gets its tank back.
 */
async function resilience(
  host: Page,
  guest: Page,
  joinUrl: string,
  shot: (p: Page, step: string) => Promise<void>,
): Promise<void> {
  const setHidden = (hidden: boolean) =>
    host.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => (h ? 'hidden' : 'visible'),
      });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  const h0 = await dbg<number>(host, 'tick');
  await host.waitForTimeout(3000);
  const h1 = await dbg<number>(host, 'tick');
  const g1 = await dbg<number>(guest, 'tick');
  await setHidden(false);
  // ~180 ticks in 3 s at 60 Hz; allow for a slow container
  if (h1 - h0 < 90) throw new Error(`public: hidden host advanced only ${h1 - h0} ticks in 3 s`);
  if (h1 - g1 > 90) throw new Error(`public: guest fell ${h1 - g1} ticks behind a hidden host`);

  // the guest walks away (same tab, so its seat token survives in sessionStorage)
  await guest.goto('about:blank');
  await host.getByText('is away · AI playing').waitFor({ timeout: TAKEOVER_TEST_MS + 8000 });
  // the banner can show a frame before the takeover input reaches the sim
  await host
    .waitForFunction(
      () =>
        ((window as unknown as { __muddersNet: { bots: () => number[] } }).__muddersNet.bots()[1] ??
          -1) >= 0,
      undefined,
      { timeout: 5000 },
    )
    .catch(async () => {
      const bots = await dbg<number[]>(host, 'bots');
      throw new Error(`public: no AI stood in for the guest (${bots})`);
    });
  // the stand-in plays the guest's turn: wait until player 1 has had the turn and fired (a tank
  // that is already dead has no turn until the next round, so there is nothing to wait for)
  const deadline = Date.now() + 40_000;
  let sawTurn = false;
  for (;;) {
    if (!(await dbg<boolean[]>(host, 'alive'))[1]) break;
    if (Date.now() > deadline) throw new Error('public: the stand-in AI never took its turn');
    const active = await dbg<number>(host, 'active');
    const phase = await dbg<string>(host, 'phase');
    if (active === 1 && phase === 'aim') sawTurn = true;
    if (sawTurn && (phase === 'resolve' || active !== 1)) break;
    await host.waitForTimeout(200);
  }
  await shot(host, '8-ai-stand-in');

  await guest.goto(joinUrl);
  await guest.locator('.game-canvas').waitFor({ timeout: 20_000 });
  await guest.waitForFunction(
    () =>
      (window as unknown as { __muddersNet: { status: () => string } }).__muddersNet.status() ===
      'playing',
    undefined,
    { timeout: 20_000 },
  );
  await host.waitForFunction(
    () =>
      (window as unknown as { __muddersNet: { bots: () => number[] } }).__muddersNet.bots()[1] ===
      -1,
    undefined,
    { timeout: 10_000 },
  );
  await shot(guest, '9-back');
}

const LAPTOP = { viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 };

/** First non-loopback IPv4 address of this machine: what a phone on the same Wi-Fi would open. */
function networkAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  throw new Error('lan: this machine has no non-loopback IPv4 address');
}

export async function runPlayNet(): Promise<PlayNetResult> {
  const signal = await startSignal();
  // the client's /signal proxy (vite.config.ts) forwards to this run's signal server
  process.env.SIGNAL_TARGET = signal.url;
  const server = await preview({
    root: resolve(REPO_ROOT, 'packages/client'),
    configFile: resolve(REPO_ROOT, 'packages/client/vite.config.ts'),
    logLevel: 'error',
    preview: { port: 0, strictPort: false, host: '0.0.0.0' },
  });
  const addr = server.httpServer.address();
  if (!addr || typeof addr === 'string') throw new Error('vite preview did not start');
  const base = `http://127.0.0.1:${addr.port}/`;
  const lanBase = `http://${networkAddress()}:${addr.port}/`;
  const out = capturesDir();
  const shots: string[] = [];
  const lines: string[] = [];
  const browser = await chromium.launch({
    headless: true,
    args: [
      ...SWIFTSHADER_ARGS,
      '--disable-features=WebRtcHideLocalIpsWithMdns',
      // the `lan` run talks to this machine's network address; a cloud session's outbound proxy
      // would otherwise take those requests (and refuse WebSocket upgrades)
      '--proxy-server=direct://',
    ],
  });
  try {
    const only = process.env.PLAY_NET_RUNS?.split(',');
    for (const run of ['p2p', 'relay', 'direct', 'public', 'lan'] as const) {
      if (only && !only.includes(run)) continue;
      lines.push(
        await runOne(browser, run === 'lan' ? lanBase : base, signal.url, run, out, shots),
      );
    }
  } finally {
    await browser.close();
    signal.proc.kill();
    await new Promise<void>((r) => server.httpServer.close(() => r()));
  }
  return { screenshots: shots, lines };
}

async function runOne(
  browser: Browser,
  base: string,
  signalUrl: string,
  run: Run,
  out: string,
  shots: string[],
): Promise<string> {
  const t0 = Date.now();
  const q =
    run === 'lan'
      ? '?ice=none'
      : `?ice=none&signal=${encodeURIComponent(signalUrl)}${run === 'relay' ? '&relay=1' : ''}`;
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  const page = async (name: string) => {
    const ctx = await browser.newContext(LAPTOP);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    contexts.push(ctx);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    p.on('console', (m) => {
      if (process.env.PLAY_NET_DEBUG) console.error(`[${run} ${name}] ${m.text()}`);
    });
    // first-run state: a small, quick map so the test is fast
    await p.addInitScript(() => {
      // about:blank (the `public` run's guest walking away) has no storage
      if (location.protocol === 'about:') return;
      if (!localStorage.getItem('mudders.setup.v1')) {
        localStorage.setItem(
          'mudders.setup.v1',
          JSON.stringify({ size: 'small', scenery: 'village', rounds: 2, turnTimer: 10 }),
        );
      }
    });
    return p;
  };
  const shot = async (p: Page, step: string) => {
    const file = resolve(out, `play-net-${run}-${step}.png`);
    await p.screenshot({ path: file });
    shots.push(file);
  };

  let joinUrl = '';
  try {
    const host = await page('host');
    const guest = await page('guest');
    if (run === 'direct') {
      await host.goto(`${base}${q}#direct-host`);
      await host.getByTestId('name').fill('Hosty');
      await host.getByTestId('make-invite').click();
      const invite = await host.getByTestId('invite-code').inputValue({ timeout: 15_000 });
      await guest.goto(`${base}${q}#direct-join`);
      await guest.getByTestId('name').fill('Guesty');
      await guest.getByTestId('invite-in').fill(invite);
      await guest.getByTestId('make-reply').click();
      const reply = await guest.getByTestId('reply-code').inputValue({ timeout: 15_000 });
      await shot(guest, '1-reply-code');
      await host.getByTestId('reply-in').fill(reply);
      await host.getByTestId('accept-reply').click();
    } else {
      await host.goto(`${base}${q}#host`);
      await host.getByTestId('name').fill('Hosty');
      const code = (await host.getByTestId('room-code').textContent({ timeout: 15_000 }))!.trim();
      const link = await host.getByTestId('share-link').inputValue();
      if (!link.endsWith(`#join/${code}`)) throw new Error(`bad share link ${link}`);
      joinUrl = `${base}${q}#join/${code}`;
      if (run === 'lan') {
        // what a phone gets: the link as shown, on the network address
        if (!link.startsWith(base)) throw new Error(`lan: share link ${link} is not on ${base}`);
        joinUrl = link;
      }
      if (run === 'public') {
        await guest.goto(`${base}${q}#browse`);
        await guest.getByTestId('no-rooms').waitFor({ timeout: 15_000 });
        await host.getByTestId('public').check();
        await host.getByTestId('takeover').selectOption(String(TAKEOVER_TEST_MS));
        // the list refreshes every few seconds; the room shows with the host's name and rules
        const room = guest.getByTestId('room').filter({ hasText: "Hosty's game" });
        await room.waitFor({ timeout: 15_000 });
        await shot(guest, '1-browse');
        await room.click();
      } else {
        await guest.goto(joinUrl);
      }
    }
    // the guest is seated and connected: Start enables
    await host.locator('[data-testid=start]:not([disabled])').waitFor({ timeout: 20_000 });
    await guest.getByTestId('guest-status').getByText('Waiting for the host').waitFor();
    // an AI in seat 3 makes it a three-player match
    await host.getByLabel('Seat 3').selectOption('ai.shooter');
    await guest.locator('.seat.bot').waitFor();
    await shot(host, '2-lobby-host');
    await shot(guest, '3-lobby-guest');
    await host.getByTestId('start').click();
    await host.locator('.game-canvas').waitFor();
    await guest.locator('.game-canvas').waitFor();
    const expected = run === 'relay' ? 'relay' : 'p2p';
    const path = await dbg<string | null>(guest, 'path');
    if (path !== expected) throw new Error(`${run}: guest link path is ${path}, want ${expected}`);

    // the opening shop (§3.6): both humans buy fuel and ready up (the AI seat shopped already);
    // round 1 starts on both peers once the ready inputs have gone through the lockstep
    for (const p of [host, guest]) await p.locator('.shop').waitFor({ timeout: 10_000 });
    await shot(guest, '3b-opening-shop');
    for (const p of [host, guest]) {
      await p.getByTestId('buy-fuel').click();
      await p.getByTestId('ready').click();
    }
    for (const p of [host, guest]) {
      await p
        .locator('.shop')
        .waitFor({ state: 'hidden', timeout: 10_000 })
        .catch(() => {
          throw new Error(`${run}: round 1 did not start after both humans were ready`);
        });
    }

    // play: each human fires on their turn until both have fired twice. The AI seat can knock a
    // human out early, and then that human's next shot only comes in the next round, after the
    // others have finished this one: allow for a whole round plus the shop.
    const fired = { host: 0, guest: 0 };
    const deadline = Date.now() + 240_000;
    let inflight = '';
    while (fired.host < 2 || fired.guest < 2) {
      if (Date.now() > deadline)
        throw new Error(`${run}: turns did not come round (${JSON.stringify(fired)})`);
      for (const [who, p, me] of [
        ['host', host, 0],
        ['guest', guest, 1],
      ] as const) {
        const phase = await dbg<string>(p, 'phase');
        const active = await dbg<number>(p, 'active');
        const tick = await dbg<number>(p, 'tick');
        const key = `${who}:${await p
          .locator('.player.active .pname')
          .textContent()
          .catch(() => '')}:${Math.floor(tick / 60)}`;
        if (phase === 'aim' && active === me && inflight !== key) {
          const fire = p.getByTestId('fire');
          // the turn can end between the check and the click (turn timer): then try again later
          const clicked =
            (await fire.isEnabled().catch(() => false)) &&
            (await fire.click({ timeout: 3000 }).then(
              () => true,
              () => false,
            ));
          if (clicked) {
            inflight = key;
            fired[who]++;
            if (fired[who] === 1) {
              await p.waitForTimeout(500);
              await shot(p, `4-${who}-shot`);
            }
            await p.waitForTimeout(1500);
          }
        }
      }
      await host.waitForTimeout(200);
    }

    if (run !== 'direct') {
      // mobile reconnect (§6.1): cut the guest's link; it must come back on the same seat
      await guest.evaluate(() =>
        (window as unknown as { __muddersNet: { dropLink: () => void } }).__muddersNet.dropLink(),
      );
      await guest.getByText('Connection lost, reconnecting').waitFor({ timeout: 5000 });
      await shot(guest, '5-reconnecting');
      await guest.waitForFunction(
        () =>
          (
            window as unknown as { __muddersNet: { status: () => string } }
          ).__muddersNet.status() === 'playing',
        undefined,
        { timeout: 20_000 },
      );
      // reload (app killed, tab restored): rejoin from the host's log
      await guest.reload();
      await guest.locator('.game-canvas').waitFor({ timeout: 20_000 });
      await guest.waitForFunction(
        () =>
          (
            window as unknown as { __muddersNet: { status: () => string } }
          ).__muddersNet.status() === 'playing',
        undefined,
        { timeout: 20_000 },
      );
    }

    if (run === 'public') await resilience(host, guest, joinUrl, shot);

    // let a hash check or two go by, then check nobody desynced
    await host.waitForTimeout(4500);
    const desyncs = await dbg<number>(host, 'desyncs');
    const lag = await dbg<number>(guest, 'lag');
    const hostTick = await dbg<number>(host, 'tick');
    const guestTick = await dbg<number>(guest, 'tick');
    await shot(host, '6-host');
    await shot(guest, '7-guest');
    if (desyncs !== 0) throw new Error(`${run}: ${desyncs} desync(s) detected`);
    if (hostTick - guestTick > 60 || lag > 60) {
      throw new Error(`${run}: guest is ${hostTick - guestTick} ticks behind (lag ${lag})`);
    }
    if (errors.length) throw new Error(`${run}: page errors: ${errors.join('; ')}`);
    return `${run}: ok in ${((Date.now() - t0) / 1000).toFixed(1)} s · host tick ${hostTick}, guest ${guestTick} · 0 desyncs`;
  } catch (e) {
    for (const [i, c] of contexts.entries()) {
      const p = c.pages()[0];
      if (!p) continue;
      await shot(p, `fail-${i}`).catch(() => {});
      // the state each side is in, for diagnosing stalls
      const state = await p
        .evaluate(() => {
          const n = (window as unknown as { __muddersNet?: Record<string, unknown> }).__muddersNet;
          if (!n) return 'no match';
          const call = (k: string) =>
            typeof n[k] === 'function' ? (n[k] as () => unknown)() : n[k];
          return JSON.stringify(
            Object.fromEntries(
              ['me', 'tick', 'phase', 'active', 'alive', 'bots', 'status', 'path', 'lag'].map(
                (k) => [k, call(k)],
              ),
            ),
          );
        })
        .catch((err: unknown) => `unreadable: ${String(err)}`);
      console.error(`${run} page ${i}: ${state}`);
    }
    throw e;
  } finally {
    for (const c of contexts) await c.close();
  }
}
