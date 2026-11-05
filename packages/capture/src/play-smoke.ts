import { resolve } from 'node:path';
import { devices, type Browser, type Page } from 'playwright';
import { preview } from 'vite';
import { launchHeadless } from './browser';
import { REPO_ROOT, capturesDir } from './paths';

/**
 * Hot-seat smoke test in emulated phones and a laptop (§2d (c), §8a): loads the built client,
 * starts a local match, aims with a slingshot drag (touch or mouse), checks the drag did NOT fire,
 * taps FIRE, waits for the turn to pass, and screenshots each step with the HUD visible.
 * Not a substitute for real devices (`needs-device`): it proves layout and the input wiring.
 *
 * Then the PWA (milestone 5): the manifest parses with the icons install needs, the service worker
 * takes control, and with the network cut the page reloads and a local match starts.
 */
export interface PlaySmokeResult {
  screenshots: string[];
}

const TARGETS = [
  { name: 'iphone14', device: devices['iPhone 14 landscape']! },
  {
    name: 's23plus',
    device: {
      ...devices['Galaxy S9+ landscape']!,
      viewport: { width: 832, height: 384 },
      deviceScaleFactor: 2.8125,
    },
  },
  {
    name: 'laptop',
    device: {
      viewport: { width: 1366, height: 768 },
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
    },
  },
];

async function turnLabel(page: Page): Promise<string> {
  return (
    (await page
      .locator('.player.active .pname')
      .textContent({ timeout: 2000 })
      .catch(() => '')) ?? ''
  );
}

export async function runPlaySmoke(): Promise<PlaySmokeResult> {
  const server = await preview({
    root: resolve(REPO_ROOT, 'packages/client'),
    configFile: resolve(REPO_ROOT, 'packages/client/vite.config.ts'),
    logLevel: 'error',
    preview: { port: 0, strictPort: false, host: '127.0.0.1' },
  });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('vite preview did not start (run pnpm build first)');
  const out = capturesDir();
  const shots: string[] = [];
  const browser = await launchHeadless();
  try {
    for (const t of TARGETS) {
      const ctx = await browser.newContext({ ...t.device });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${url}#play/2/small`);
      await page.locator('.game-canvas').waitFor();
      await page.waitForTimeout(800);
      const shot = async (step: string) => {
        const p = resolve(out, `play-smoke-${t.name}-${step}.png`);
        await page.screenshot({ path: p });
        shots.push(p);
      };
      await shot('1-start');
      const before = await turnLabel(page);
      if (!/^P[12]$/.test(before)) throw new Error(`${t.name}: no active player (got "${before}")`);

      // slingshot: pull down-left from the middle of the playfield → aims up-right
      const box = (await page.locator('[data-testid=playfield]').boundingBox())!;
      const x0 = box.x + box.width * 0.5;
      const y0 = box.y + box.height * 0.4;
      const angleBefore = await page.locator('.stepper .value').first().textContent();
      if (t.device.hasTouch) {
        const cdp = await ctx.newCDPSession(page);
        const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
          cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
          });
        await touch('touchStart', x0, y0);
        for (let i = 1; i <= 10; i++) await touch('touchMove', x0 - i * 9, y0 + i * 7);
        await page.waitForTimeout(100);
        await shot('2-aiming');
        await touch('touchEnd', x0 - 90, y0 + 70);
      } else {
        await page.mouse.move(x0, y0);
        await page.mouse.down();
        await page.mouse.move(x0 - 90, y0 + 70, { steps: 10 });
        await page.waitForTimeout(100);
        await shot('2-aiming');
        await page.mouse.up();
      }
      await page.waitForTimeout(150);
      const angleAfter = await page.locator('.stepper .value').first().textContent();
      if (angleAfter === angleBefore)
        throw new Error(`${t.name}: slingshot drag did not change the angle`);
      if (await page.locator('[data-testid=fire]').isDisabled()) {
        throw new Error(`${t.name}: releasing the drag fired the shot (§8a forbids it)`);
      }
      await page.locator('[data-testid=fire]').click();
      await page.waitForTimeout(700);
      await shot('3-in-flight');
      await page.locator('.player.active').waitFor({ timeout: 15000 });
      // the turn passes to the other player once the shot resolves
      await page.waitForFunction(
        (prev) => {
          const now = document.querySelector('.player.active .pname')?.textContent;
          return now !== undefined && now !== null && now !== prev;
        },
        before,
        { timeout: 15000 },
      );
      await shot('4-next-turn');
      // §8b: the first gesture unlocked audio and the battle tune is playing through the worklet
      await page
        .locator('html[data-music="audio.music-battle"]')
        .waitFor({ state: 'attached', timeout: 10000 })
        .catch(() => {
          throw new Error(`${t.name}: battle music did not start after the first tap`);
        });
      if (errors.length > 0) throw new Error(`${t.name}: page errors: ${errors.join('; ')}`);
      await ctx.close();
    }
    shots.push(await pwaOffline(browser, url, out));
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.httpServer.close(() => r()));
  }
  return { screenshots: shots };
}

async function pwaOffline(browser: Browser, url: string, out: string): Promise<string> {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  try {
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    const manifest = await page.evaluate(async () => {
      const href = document.querySelector<HTMLLinkElement>('link[rel=manifest]')?.href;
      if (!href) return null;
      return (await (await fetch(href)).json()) as {
        name?: string;
        start_url?: string;
        display?: string;
        icons?: { sizes: string; purpose?: string }[];
      };
    });
    const sizes = manifest?.icons?.map((i) => i.sizes) ?? [];
    if (!manifest?.name || !manifest.start_url || !manifest.display) {
      throw new Error(`pwa: manifest missing name/start_url/display: ${JSON.stringify(manifest)}`);
    }
    if (!sizes.includes('192x192') || !sizes.includes('512x512')) {
      throw new Error(`pwa: manifest needs 192 and 512 px icons (has ${sizes.join(', ')})`);
    }
    // the worker installs (precaching every build file) and claims the page
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 15_000,
    });
    await ctx.setOffline(true);
    await page.reload();
    await page.locator('h1', { hasText: 'Mudders' }).waitFor({ timeout: 10_000 });
    // a local match loads its lazy chunks from the cache
    await page.goto(`${url}#play/2/small`);
    await page.locator('.game-canvas').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(800);
    const file = resolve(out, 'play-smoke-pwa-offline.png');
    await page.screenshot({ path: file });
    if (errors.length > 0) throw new Error(`pwa: page errors: ${errors.join('; ')}`);
    return file;
  } finally {
    await ctx.close();
  }
}
