/**
 * pnpm determinism:browsers [chromium] [firefox] [webkit]
 *
 * Cross-engine determinism check (§9): bundles the sim + content with Vite (as the client ships
 * them), runs every scenario in headless Chromium (V8), Firefox (SpiderMonkey) and WebKit
 * (JavaScriptCore), and requires each to reproduce `packages/content/golden.json` exactly.
 * Browsers come from Playwright's builds when installed, otherwise from `pnpm setup:browsers`
 * (see `scripts/setup-browsers.sh`). Exits non-zero on any mismatch or missing browser.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { build } from 'vite';
import { SWIFTSHADER_ARGS } from '../browser';
import type { BrowserRun, GoldenHashes } from '../determinism/protocol';
import { REPO_ROOT } from '../paths';

type Engine = 'chromium' | 'firefox' | 'webkit';
const ENGINES: readonly Engine[] = ['chromium', 'firefox', 'webkit'];
const TIMEOUT_MS = 120_000;

/** Fallback binaries installed by `scripts/setup-browsers.sh` (overridable by env). */
const BROWSERS_DIR = process.env.MUDDERS_BROWSERS_DIR ?? '/opt/mudders-browsers';
const FIREFOX_BIN =
  process.env.MUDDERS_FIREFOX ?? join(BROWSERS_DIR, 'firefox/usr/lib/firefox/firefox');
const FIREFOX_LIBS = join(BROWSERS_DIR, 'nss/usr/lib/x86_64-linux-gnu');
const WEBKIT_BIN =
  process.env.MUDDERS_WEBKIT ?? '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
};

class Missing extends Error {}

/** Static server for the built page; resolves `results` waiters on POST /result. */
function serve(
  root: string,
): Promise<{ server: Server; url: string; next(): Promise<BrowserRun> }> {
  let waiter: ((r: BrowserRun) => void) | undefined;
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/result') {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        res.end('ok');
        waiter?.(JSON.parse(body) as BrowserRun);
        waiter = undefined;
      });
      return;
    }
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      ok({
        server,
        url: `http://127.0.0.1:${port}/`,
        next: () => new Promise<BrowserRun>((r) => (waiter = r)),
      });
    }),
  );
}

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, bad) => {
      t = setTimeout(
        () => bad(new Error(`${what}: no result after ${TIMEOUT_MS / 1000}s`)),
        TIMEOUT_MS,
      );
    }),
  ]).finally(() => clearTimeout(t));
}

function playwrightHas(engine: Engine): boolean {
  const type = { chromium, firefox, webkit }[engine];
  try {
    return existsSync(type.executablePath());
  } catch {
    return false;
  }
}

/** Spawn a plain browser binary in its own process group so the whole tree can be killed. */
function spawnBrowser(cmd: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(cmd, args, { env, detached: true, stdio: 'ignore' });
  child.on('error', () => undefined);
  return child;
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

async function runEngine(
  engine: Engine,
  url: string,
  next: () => Promise<BrowserRun>,
): Promise<{ run: BrowserRun; via: string }> {
  const result = withTimeout(next(), engine);

  if (playwrightHas(engine)) {
    const type = { chromium, firefox, webkit }[engine];
    const browser = await type.launch(
      engine === 'chromium' ? { headless: true, args: SWIFTSHADER_ARGS } : { headless: true },
    );
    try {
      const page = await browser.newPage();
      await page.goto(url);
      return { run: await result, via: `playwright ${engine} ${browser.version()}` };
    } finally {
      await browser.close();
    }
  }

  let child: ChildProcess;
  let via: string;
  if (engine === 'firefox') {
    if (!existsSync(FIREFOX_BIN)) throw new Missing(`Firefox not found at ${FIREFOX_BIN}`);
    const profile = mkdtempSync(join(tmpdir(), 'mudders-ff-'));
    const libs = existsSync(FIREFOX_LIBS)
      ? [FIREFOX_LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':')
      : process.env.LD_LIBRARY_PATH;
    child = spawnBrowser(FIREFOX_BIN, ['--headless', '--no-remote', '--profile', profile, url], {
      ...process.env,
      ...(libs ? { LD_LIBRARY_PATH: libs } : {}),
      MOZ_CRASHREPORTER_DISABLE: '1',
    });
    child.on('exit', () => rmSync(profile, { recursive: true, force: true }));
    via = FIREFOX_BIN;
  } else if (engine === 'webkit') {
    if (!existsSync(WEBKIT_BIN))
      throw new Missing(`WebKitGTK MiniBrowser not found at ${WEBKIT_BIN}`);
    // WebKitGTK has no headless mode: run it on a virtual X display.
    child = spawnBrowser('xvfb-run', ['-a', WEBKIT_BIN, url], process.env);
    via = WEBKIT_BIN;
  } else {
    throw new Missing('Chromium not found (Playwright build missing)');
  }
  try {
    return { run: await result, via };
  } finally {
    killTree(child);
  }
}

function diff(golden: GoldenHashes, actual: GoldenHashes): string[] {
  const out: string[] = [];
  if (actual.contentHash !== golden.contentHash) {
    out.push(`contentHash ${actual.contentHash} ≠ golden ${golden.contentHash}`);
  }
  const ids = [...new Set([...Object.keys(golden.scenarios), ...Object.keys(actual.scenarios)])];
  for (const id of ids.sort()) {
    const g = golden.scenarios[id];
    const a = actual.scenarios[id];
    if (!g || !a) out.push(`${id}: ${g ? 'missing in browser' : 'not in golden.json'}`);
    else if (g.hash !== a.hash || g.ticks !== a.ticks) {
      out.push(`${id}: ${a.hash}@${a.ticks} ≠ golden ${g.hash}@${g.ticks}`);
    }
  }
  return out;
}

async function main(): Promise<number> {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const engines = wanted.length ? ENGINES.filter((e) => wanted.includes(e)) : ENGINES;
  const golden = JSON.parse(
    readFileSync(resolve(REPO_ROOT, 'packages/content/golden.json'), 'utf8'),
  ) as GoldenHashes;

  const outDir = mkdtempSync(join(tmpdir(), 'mudders-determinism-'));
  await build({
    configFile: false,
    logLevel: 'error',
    root: resolve(import.meta.dirname, '../determinism'),
    base: './',
    build: { outDir, emptyOutDir: true, target: 'es2023' },
  });
  const { server, url, next } = await serve(outDir);

  let failed = 0;
  try {
    for (const engine of engines) {
      const t0 = Date.now();
      try {
        const { run, via } = await runEngine(engine, url, next);
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        if ('error' in run) {
          failed++;
          console.error(`✗ ${engine}: page threw\n  ${run.error}`);
          continue;
        }
        const problems = diff(golden, run.result);
        if (!run.repeatMatches) problems.push('second run in the same page differed');
        const n = Object.keys(run.result.scenarios).length;
        if (problems.length) {
          failed++;
          console.error(`✗ ${engine}: ${problems.length} mismatch(es) [${run.userAgent}]`);
          for (const p of problems) console.error(`  ${p}`);
        } else {
          console.log(
            `✓ ${engine}: ${n} scenarios match golden.json (sim ${run.ms} ms, total ${secs} s)\n` +
              `  ${run.userAgent}\n  via ${via}`,
          );
        }
      } catch (err) {
        failed++;
        if (err instanceof Missing) {
          console.error(`✗ ${engine}: ${err.message}. Run \`pnpm setup:browsers\` first.`);
        } else console.error(`✗ ${engine}:`, err);
      }
    }
  } finally {
    server.close();
    rmSync(outDir, { recursive: true, force: true });
  }
  return failed ? 1 : 0;
}

process.exitCode = await main();
