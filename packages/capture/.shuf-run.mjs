import { chromium } from 'playwright';
import { preview } from 'vite';
const out = process.argv[2];
import { mkdirSync } from 'node:fs';
mkdirSync(out, { recursive: true });
const server = await preview({
  root: '/home/user/mudders/packages/client',
  preview: { port: 4179 },
  logLevel: 'error',
});
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({
  viewport: { width: 960, height: 444 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem(
    'mudders.setup.v1',
    JSON.stringify({
      slots: ['ai.shooter', 'ai.cyborg', 'off', 'off', 'off', 'off', 'off', 'off'],
      size: 'small',
      scenery: 'shuffle',
      rounds: 4,
      turnTimer: 10,
      wind: 'perTurn',
      weather: 'random',
      suddenDeath: true,
      suddenDeathFrom: 3,
      startingCash: 30000,
      drops: 'off',
      roundBonus: 0,
      teams: null,
      tanks: Array(8).fill('auto'),
    }),
  );
});
await page.goto(`${url}#play`);
const t0 = Date.now();
let n = 0;
const seen = new Set();
while (Date.now() - t0 < 40 * 60_000) {
  const txt = await page
    .locator('.event-toast')
    .textContent({ timeout: 500 })
    .catch(() => null);
  if (txt && txt.startsWith('Round') && !seen.has(txt)) {
    seen.add(txt);
    console.log(((Date.now() - t0) / 1000).toFixed(1), txt);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/round-${++n}.png`, timeout: 180000 });
  }
  const over = await page.locator('text=/wins the match|Match over|Play again/i').count();
  if (over > 0) {
    console.log('over', (Date.now() - t0) / 1000);
    await page.waitForTimeout(2000);
    break;
  }
  await page.waitForTimeout(400);
}
await ctx.close();
await browser.close();
await server.close();
