/**
 * Runs a TypeScript entry through Vite's module runner so Node tooling sees exactly what the
 * client sees, including `import.meta.glob` content discovery (§2c.1). The entry exports
 * `main(args)`; its return value is the exit code.
 *
 *   tsx scripts/vite-run.ts <entry.ts> [args…]
 */
import { resolve } from 'node:path';
import { runnerImport } from 'vite';

interface Entry {
  main(args: string[]): Promise<number | undefined> | number | undefined;
}

const [file, ...args] = process.argv.slice(2);
if (!file) {
  console.error('usage: vite-run <entry.ts> [args…]');
  process.exit(2);
}
const { module } = await runnerImport<Entry>(resolve(file), {
  configFile: false,
  logLevel: 'error',
  root: process.cwd(),
});
process.exitCode = (await module.main(args)) ?? 0;
