import { resolve } from 'node:path';
import { devices, type Browser, type BrowserContext, type Page } from 'playwright';
import { preview } from 'vite';
import { launchHeadless } from './browser';
import { REPO_ROOT, capturesDir } from './paths';

/**
 * Hot-seat smoke test in emulated phones and a laptop (§2d (c), §8a): loads the built client,
 * starts a local match, passes the opening shop, aims with a slingshot drag (touch or mouse), checks the drag did NOT fire,
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

/**
 * Every match opens with the shop before round 1 (§3.6): check its countdown, then press each
 * hot-seat player's Ready so the first turn starts.
 */
async function passOpeningShop(
  page: Page,
  name: string,
  shot?: () => Promise<void>,
): Promise<void> {
  const shop = page.locator('.shop');
  await shop.waitFor({ timeout: 10_000 }).catch(() => {
    throw new Error(`${name}: no shop before round 1`);
  });
  const secs = Number((await page.getByTestId('shop-timer').textContent())?.replace('s', ''));
  if (!(secs > 20 && secs <= 30))
    throw new Error(`${name}: the opening shop countdown shows ${secs}s, expected about 30s`);
  if (shot) await shot();
  for (let i = 0; i < 8 && (await shop.isVisible()); i++) {
    const ready = page.getByTestId('ready');
    // the shop closes the moment the last player is ready, so a click can find it gone
    if (await ready.isEnabled().catch(() => false))
      await ready.click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(100);
  }
  await shop.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {
    throw new Error(`${name}: round 1 did not start once everyone was ready`);
  });
  await page.waitForTimeout(300);
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
      await passOpeningShop(page, t.name, () => shot('0-opening-shop'));
      await shot('1-start');
      let before = await turnLabel(page);
      if (!/^P[12]$/.test(before)) throw new Error(`${t.name}: no active player (got "${before}")`);

      // slingshot at the whole-map view: pull down-left from the middle → aims up-right
      const box = (await page.locator('[data-testid=playfield]').boundingBox())!;
      const x0 = box.x + box.width * 0.5;
      const y0 = box.y + box.height * 0.4;
      const angleBefore = await page
        .locator('[data-testid=aim-angle] .value')
        .first()
        .textContent();
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
        if (!(await page.getByTestId('aim-readout').isVisible()))
          throw new Error(`${t.name}: no angle · power readout while dragging`);
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
      if (await page.getByTestId('aim-readout').isVisible())
        throw new Error(`${t.name}: the aim readout stayed up after the drag`);
      if (t.device.hasTouch) await panAndPinch(page, ctx, t.name, box, shot);
      if (t.device.isMobile) {
        // landscape phones: the dock floats over the map, so the battlefield gets the full height
        const vh = t.device.viewport.height;
        if (box.height < vh * 0.95)
          throw new Error(`${t.name}: playfield is ${box.height}px of a ${vh}px screen`);
        // full screen toggle (Chromium has the Fullscreen API; iPhone Safari gets a hint instead)
        const fs = page.getByTestId('fullscreen');
        await fs.click();
        await page
          .waitForFunction(() => document.fullscreenElement !== null, null, {
            timeout: 2000,
          })
          .catch(() => {
            throw new Error(`${t.name}: the full screen button did not go full screen`);
          });
        await fs.click();
        await page.waitForFunction(() => document.fullscreenElement === null, null, {
          timeout: 2000,
        });
      }
      const angleAfter = await page.locator('[data-testid=aim-angle] .value').first().textContent();
      if (angleAfter === angleBefore)
        throw new Error(`${t.name}: slingshot drag did not change the angle`);
      if (await page.locator('[data-testid=fire]').isDisabled()) {
        throw new Error(`${t.name}: releasing the drag fired the shot (§8a forbids it)`);
      }
      // drag-to-change (§8a): press the power pill and slide right; a ruler pops up, power grows
      const pill = page.getByTestId('aim-power');
      const powerBefore = Number(await pill.getAttribute('aria-valuenow'));
      const pb = (await pill.boundingBox())!;
      const px = pb.x + pb.width / 2;
      const py = pb.y + pb.height / 2;
      const target = powerBefore > 500 ? -1 : 1;
      if (t.device.hasTouch) {
        const cdp = await ctx.newCDPSession(page);
        const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
          cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 2 }],
          });
        await touch('touchStart', px, py);
        for (let i = 1; i <= 8; i++) await touch('touchMove', px + target * i * 8, py);
        await page.locator('.scrub-pop').waitFor({ timeout: 2000 });
        await shot('2b-scrub-power');
        await touch('touchEnd', px + target * 64, py);
      } else {
        await page.mouse.move(px, py);
        await page.mouse.down();
        await page.mouse.move(px + target * 64, py, { steps: 8 });
        await page.locator('.scrub-pop').waitFor({ timeout: 2000 });
        await shot('2b-scrub-power');
        await page.mouse.up();
      }
      await page.waitForTimeout(150);
      const powerAfter = Number(await pill.getAttribute('aria-valuenow'));
      if (Math.sign(powerAfter - powerBefore) !== target)
        throw new Error(
          `${t.name}: dragging the power pill did not change power (${powerBefore} → ${powerAfter})`,
        );
      if (await page.locator('.scrub-pop').isVisible())
        throw new Error(`${t.name}: the scrub ruler stayed open after release`);
      // weapon button (§8a): tap opens the grid of tiles, tapping a tile selects it and closes
      const weaponBtn = page.getByTestId('weapon-button');
      const weaponBefore = await weaponBtn.locator('.wname').textContent();
      await weaponBtn.click();
      const tiles = page.locator('[data-testid=weapon-pop] [role=option]');
      await tiles.first().waitFor({ timeout: 2000 });
      await shot('2c-weapon-picker');
      const other = tiles.filter({ hasNot: page.locator('xpath=self::*[@aria-selected="true"]') });
      const pick = (await other.first().locator('.wname').textContent()) ?? '';
      await other.first().click();
      await page.getByTestId('weapon-pop').waitFor({ state: 'hidden', timeout: 2000 });
      // the pick goes through the match input queue, so the button updates a tick later
      await weaponBtn
        .locator('.wname', { hasText: pick })
        .waitFor({ timeout: 2000 })
        .catch(async () => {
          const now = await weaponBtn.locator('.wname').textContent();
          throw new Error(`${t.name}: picking ${pick} in the weapon grid left ${now} selected`);
        });
      if (pick === weaponBefore) throw new Error(`${t.name}: the grid offered no other weapon`);
      // the steps above can outlast a slow software-GL turn timer: fire for whoever is up now
      before = await turnLabel(page);
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
      // milestone 7: an 8-player hot-seat match fits the HUD (every player chip visible)
      await page.goto(`${url}#play/8/large`);
      await page.reload();
      await page.locator('.game-canvas').waitFor();
      await page.waitForTimeout(800);
      await passOpeningShop(page, t.name);
      const chips = page.locator('.hud-top .player');
      if ((await chips.count()) !== 8)
        throw new Error(`${t.name}: 8-player HUD shows ${await chips.count()} chips`);
      const vw = t.device.viewport.width;
      for (let i = 0; i < 8; i++) {
        const b = await chips.nth(i).boundingBox();
        if (!b || b.x < 0 || b.x + b.width > vw + 1)
          throw new Error(`${t.name}: player ${i + 1} chip is off screen`);
      }
      await shot('5-eight-players');
      // tank types (§3.2): pick a tank per seat on the setup screen, then the match starts with them
      await page.goto(`${url}#setup`);
      await page.reload();
      await page.getByLabel('Player 1 tank', { exact: true }).selectOption('tank.bruiser');
      const p2 = page.getByLabel('Player 2 tank', { exact: true });
      if (!(await p2.locator('option:checked').textContent())?.includes('Howitzer'))
        throw new Error(`${t.name}: the Shooter bot does not default to its favourite tank`);
      await shot('6-tank-setup');
      await page.getByTestId('start').click();
      await page.locator('.game-canvas').waitFor();
      await page.waitForTimeout(800);
      await passOpeningShop(page, t.name);
      await shot('7-tank-match');
      // the turn order is random: if the Shooter bot is up first, wait for it to pass to P1
      await page
        .waitForFunction(
          () =>
            document.querySelector('.player.active .pname')?.textContent === 'P1' &&
            !(document.querySelector('[data-testid=fire]') as HTMLButtonElement | null)?.disabled,
          undefined,
          { timeout: 20_000 },
        )
        .catch(() => {
          throw new Error(`${t.name}: P1 never got the turn in the tank match`);
        });
      // driving (§3.2): holding ▶ spends the turn's drive
      const gauge = page.locator('.drive-left .drive-n');
      const driveBefore = Number(await gauge.textContent());
      const right = page.getByTestId('drive-right');
      await right.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true });
      await page.waitForTimeout(700);
      await right.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true });
      await page.waitForTimeout(200);
      const driveAfter = Number(await gauge.textContent());
      if (!(driveAfter < driveBefore))
        throw new Error(
          `${t.name}: holding drive did not move the tank (${driveBefore} → ${driveAfter})`,
        );
      await shot('8-driving');
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

/**
 * Touch camera: two fingers spread → smooth zoom in; one finger away from the tank drags the map
 * (no slingshot, no aim change); Fit map fits it again.
 */
async function panAndPinch(
  page: Page,
  ctx: BrowserContext,
  name: string,
  box: { x: number; y: number; width: number; height: number },
  shot: (step: string) => Promise<void>,
): Promise<void> {
  const cdp = await ctx.newCDPSession(page);
  const zoom = async () => Number(await page.getByTestId('playfield').getAttribute('data-zoom'));
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })),
    });
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const z0 = await zoom();
  await send('touchStart', [
    { x: cx - 30, y: cy },
    { x: cx + 30, y: cy },
  ]);
  const zs: number[] = [];
  for (let i = 1; i <= 8; i++) {
    await send('touchMove', [
      { x: cx - 30 - i * 10, y: cy },
      { x: cx + 30 + i * 10, y: cy },
    ]);
    await page.waitForTimeout(30);
    zs.push(await zoom());
  }
  await send('touchEnd', []);
  await page.waitForTimeout(300);
  const z1 = await zoom();
  // smooth: the scale grows a bit with every finger move, not in one jump at the end
  const steps = new Set(zs).size;
  if (!(z1 > z0 * 2)) throw new Error(`${name}: pinch did not zoom in (${z0} → ${z1})`);
  if (steps < 5) throw new Error(`${name}: pinch zoom moved in ${steps} jumps, not smoothly`);
  await shot('2b-pinched');
  const turn = await turnLabel(page);
  const angle = await page.locator('[data-testid=aim-angle] .value').first().textContent();
  const centre = async () =>
    Number((await page.getByTestId('playfield').getAttribute('data-centre'))!.split(',')[0]);
  const c0 = await centre();
  // start the drag well away from the tank (which sits near a map edge) so it pans
  const sx = box.x + box.width * 0.5;
  const sy = box.y + box.height * 0.45;
  const dx = 60;
  await send('touchStart', [{ x: sx, y: sy }]);
  for (let i = 1; i <= 6; i++) await send('touchMove', [{ x: sx + (dx * i) / 6, y: sy }]);
  await page.waitForTimeout(150);
  if (await page.getByTestId('aim-readout').isVisible())
    throw new Error(`${name}: a drag away from the tank aimed instead of panning`);
  // hold still before lifting, so there is no fling
  await page.waitForTimeout(200);
  await send('touchEnd', []);
  await page.waitForTimeout(150);
  const c1 = await centre();
  if (Math.abs(c1 - c0) < 5)
    throw new Error(`${name}: one-finger drag did not pan the map (centre x ${c0} → ${c1})`);
  await shot('2c-panned');
  // (the slow software renderer can run the turn clock out mid-test; only compare the same turn)
  const same = (await turnLabel(page)) === turn;
  if (
    same &&
    (await page.locator('[data-testid=aim-angle] .value').first().textContent()) !== angle
  )
    throw new Error(`${name}: panning changed the aim`);
  await page.getByRole('button', { name: 'Fit map' }).click();
  await page
    .waitForFunction(
      (z) => document.querySelector('[data-testid=playfield]')?.getAttribute('data-zoom') === z,
      z0.toFixed(2),
      { timeout: 3000 },
    )
    .catch(() => {
      throw new Error(`${name}: Fit map did not fit the map again`);
    });
}
