import { spawn, type ChildProcess } from 'node:child_process';
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
  desyncs?: () => number;
  paths?: () => (string | null)[];
  rebuilds?: () => number;
  lag?: () => number;
  status?: () => string;
  path?: () => string | null;
  dropLink?: () => void;
}
type DebugKey = Exclude<keyof NetDebug, 'me' | 'dropLink'>;

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

const LAPTOP = { viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 };

export async function runPlayNet(): Promise<PlayNetResult> {
  const server = await preview({
    root: resolve(REPO_ROOT, 'packages/client'),
    configFile: resolve(REPO_ROOT, 'packages/client/vite.config.ts'),
    logLevel: 'error',
    preview: { port: 0, strictPort: false, host: '127.0.0.1' },
  });
  const base = server.resolvedUrls?.local[0];
  if (!base) throw new Error('vite preview did not start (run pnpm build first)');
  const signal = await startSignal();
  const out = capturesDir();
  const shots: string[] = [];
  const lines: string[] = [];
  const browser = await chromium.launch({
    headless: true,
    args: [...SWIFTSHADER_ARGS, '--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  try {
    const only = process.env.PLAY_NET_RUNS?.split(',');
    for (const run of ['p2p', 'relay', 'direct'] as const) {
      if (only && !only.includes(run)) continue;
      lines.push(await runOne(browser, base, signal.url, run, out, shots));
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
  run: 'p2p' | 'relay' | 'direct',
  out: string,
  shots: string[],
): Promise<string> {
  const t0 = Date.now();
  const q = `?ice=none&signal=${encodeURIComponent(signalUrl)}${run === 'relay' ? '&relay=1' : ''}`;
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
      await guest.goto(`${base}${q}#join/${code}`);
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

    // play: each human fires on their turn until both have fired twice
    const fired = { host: 0, guest: 0 };
    const deadline = Date.now() + 90_000;
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
          if (await fire.isEnabled().catch(() => false)) {
            await fire.click();
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
      if (p) await shot(p, `fail-${i}`).catch(() => {});
    }
    throw e;
  } finally {
    for (const c of contexts) await c.close();
  }
}
