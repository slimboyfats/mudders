/**
 * `pnpm audio:preview` (§8b review): renders every `audio.*` item through the game's own audio code
 * in headless Chromium (OfflineAudioContext; modules through the real chiptune3/libopenmpt
 * AudioWorklet), checks each one makes sound, and writes review clips to `captures/audio/`:
 * one MP3 per tune and an SFX reel of every patch in id order with its name read in the log.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';
import { loadContent } from '@mudders/content';
import type { SynthVoice } from '@mudders/shared';
import { launchHeadless } from '../browser';
import { checkFfmpeg } from '../ffmpeg';
import { REPO_ROOT, capturesDir } from '../paths';

const RATE = 44100;
const MUSIC_SECONDS = Number(process.env.AUDIO_MUSIC_SECONDS ?? 30);

interface AudioApi {
  patch(voices: SynthVoice[], radius: number, radiusRef: number): Promise<number[][]>;
  module(bytes: number[], seconds: number): Promise<number[][]>;
  soundscape(seconds: number): Promise<number[][]>;
}

function wav(channels: number[][]): Buffer {
  const n = channels[0]!.length;
  const ch = channels.length;
  const buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * ch * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * ch * 2, 28);
  buf.writeUInt16LE(ch * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * ch * 2, 40);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c]![i]!));
      buf.writeInt16LE(Math.round(v * 32767), 44 + (i * ch + c) * 2);
    }
  }
  return buf;
}

function rms(channels: number[][]): number {
  let s = 0;
  let n = 0;
  for (const c of channels) {
    for (const v of c) s += v * v;
    n += c.length;
  }
  return Math.sqrt(s / Math.max(1, n));
}

function mp3(wavPath: string, out: string): void {
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    wavPath,
    '-b:a',
    '160k',
    out,
  ]);
}

export async function main(): Promise<number> {
  checkFfmpeg();
  const content = loadContent();
  const outDir = resolve(capturesDir(), 'audio');
  const tmp = resolve(outDir, '.build');
  mkdirSync(tmp, { recursive: true });
  const client = resolve(REPO_ROOT, 'packages/client');
  await build({
    configFile: false,
    root: client,
    logLevel: 'error',
    build: {
      outDir: tmp,
      emptyOutDir: true,
      minify: false,
      target: 'es2022',
      lib: {
        entry: resolve(client, 'src/audio/preview-entry.ts'),
        formats: ['iife'],
        name: 'MuddersAudio',
        fileName: () => 'audio.js',
      },
    },
  });
  const req = createRequire(resolve(client, 'package.json'));
  const workletDir = dirname(req.resolve('chiptune3/chiptune3.worklet.js'));
  const script = readFileSync(resolve(tmp, 'audio.js'), 'utf8');

  // a real local server: AudioWorklet needs a secure context (localhost), and worklet module
  // fetches bypass Playwright's request routing
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const m = /^\/audio\/([a-z0-9.]+\.js)$/.exec(path);
    if (m && ['chiptune3.worklet.js', 'libopenmpt.worklet.js'].includes(m[1]!)) {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(readFileSync(resolve(workletDir, m[1]!)));
    } else if (path === '/audio.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(script);
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><meta charset="utf-8"><script src="/audio.js"></script>');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;

  const browser = await launchHeadless();
  const problems: string[] = [];
  try {
    const page = await browser.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') console.error(`[page] ${m.text()}`);
    });
    await page.goto(`http://localhost:${port}/`);
    await page.waitForFunction(() => 'window' in globalThis && '__muddersAudio' in window);

    const reel: number[][] = [[], []];
    const gap = new Array<number>(Math.round(RATE * 0.35)).fill(0);
    const log: string[] = [];
    for (const a of content.list('audio')) {
      if (a.synth) {
        const radius = a.synth.radiusRef > 0 ? a.synth.radiusRef : 0;
        const ch = await page.evaluate(
          ([v, r, ref]) =>
            (window as unknown as { __muddersAudio: AudioApi }).__muddersAudio.patch(v, r, ref),
          [a.synth.voices, radius, a.synth.radiusRef] as const,
        );
        const level = rms(ch);
        if (level < 0.005) problems.push(`${a.id}: silent (rms ${level.toFixed(4)})`);
        const at = reel[0]!.length / RATE;
        log.push(
          `${at.toFixed(2).padStart(6)} s  ${a.id}  (${a.meta.name}), rms ${level.toFixed(3)}`,
        );
        // a loop, not push(...ch): a long patch overflows the call stack as spread arguments
        for (let c = 0; c < 2; c++) {
          const out = reel[c]!;
          for (const v of ch[c]!) out.push(v);
          for (const v of gap) out.push(v);
        }
      } else if (a.module) {
        const bytes = Array.from(
          readFileSync(
            resolve(REPO_ROOT, 'packages/content/core/audio', a.id.slice(6), a.module.file),
          ),
        );
        const ch = await page.evaluate(
          ([b, s]) =>
            (window as unknown as { __muddersAudio: AudioApi }).__muddersAudio.module(b, s),
          [bytes, MUSIC_SECONDS] as const,
        );
        const level = rms(ch);
        if (level < 0.01)
          problems.push(`${a.id}: module rendered silent (rms ${level.toFixed(4)})`);
        const w = resolve(tmp, `${a.id}.wav`);
        writeFileSync(w, wav(ch));
        const out = resolve(outDir, `${a.id}.mp3`);
        mp3(w, out);
        log.push(
          `${a.id}: ${MUSIC_SECONDS} s via chiptune3 worklet, rms ${level.toFixed(3)} → ${out}`,
        );
      }
    }
    // the process soundscape (fire, lava, liquid, gas, steam loops), each layer then all at once
    {
      const ch = await page.evaluate(
        (s) => (window as unknown as { __muddersAudio: AudioApi }).__muddersAudio.soundscape(s),
        4,
      );
      const level = rms(ch);
      if (level < 0.01) problems.push(`soundscape: silent (rms ${level.toFixed(4)})`);
      const w = resolve(tmp, 'soundscape.wav');
      writeFileSync(w, wav(ch));
      const out = resolve(outDir, 'soundscape.mp3');
      mp3(w, out);
      log.push(
        `soundscape: burning, boiling, flowing, gassing, quenching, all; rms ${level.toFixed(3)} → ${out}`,
      );
    }
    const reelWav = resolve(tmp, 'sfx-reel.wav');
    writeFileSync(reelWav, wav(reel));
    const reelOut = resolve(outDir, 'sfx-reel.mp3');
    mp3(reelWav, reelOut);
    writeFileSync(resolve(outDir, 'sfx-reel.txt'), `${log.join('\n')}\n`);
    console.log(log.join('\n'));
    console.log(reelOut);
  } finally {
    await browser.close();
    server.close();
  }
  if (problems.length > 0) {
    console.error(
      `audio:preview found ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`,
    );
    return 1;
  }
  console.log('audio ok');
  return 0;
}
