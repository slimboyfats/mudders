import { describe, expect, it } from 'vitest';
import { GPU_PARTS } from '../render/types';
import { PerfRecorder, perfFileName, type PerfContext } from './perf-log';

const ctx = (over: Partial<PerfContext> = {}): (() => PerfContext) => {
  return () => ({
    phase: 'resolve',
    round: 1,
    turn: 3,
    quality: 'high',
    particles: 1200,
    projectiles: 2,
    debris: 40,
    settle: 900,
    react: 0,
    gpu: null,
    note: 'gen.lakeland weather.rain',
    ...over,
  });
};

/** Feed `seconds` of frames `ms` apart. */
function run(rec: PerfRecorder, from: number, seconds: number, ms: number, c = ctx()): number {
  let now = from;
  const end = from + seconds * 1000;
  while (now < end) {
    now += ms;
    rec.frame(now, ms, 1, 0.5, 0.2, 1.5, c);
  }
  return now;
}

describe('PerfRecorder', () => {
  it('writes one row per second with the frame rate of that second', () => {
    const rec = new PerfRecorder({ kernel: '1.2.3', players: 4 });
    rec.frame(0, 0, 0, 0, 0, 0, ctx());
    const at = run(rec, 0, 3, 20);
    run(rec, at, 2, 50);
    const text = rec.report();
    expect(text.startsWith('# mudders performance log v1\nkernel: 1.2.3\nplayers: 4\n')).toBe(true);
    expect(text).toContain('seconds: 5\n');
    const rows = text.split('## every second\n')[1]!.trim().split('\n');
    const head = rows[0]!.split(',');
    expect(rows).toHaveLength(6);
    const col = (row: number, name: string): string =>
      rows[row]!.split(',')[head.indexOf(name)] ?? '';
    expect(col(1, 'fps')).toBe('50');
    expect(col(1, 'frame max')).toBe('20');
    expect(col(5, 'fps')).toBe('20');
    expect(col(5, 'sim avg')).toBe('0.5');
    expect(col(5, 'step avg')).toBe('0.2');
    expect(col(5, 'render avg')).toBe('1.5');
    expect(col(5, 'phase')).toBe('resolve');
    expect(col(5, 'particles')).toBe('1200');
    expect(col(5, 'note')).toBe('gen.lakeland weather.rain');
    // every row has every column
    for (const r of rows) expect(r.split(',')).toHaveLength(head.length);
    expect(rec.seconds).toBe(5);
  });

  it('puts the slowest seconds first and says how the frames were spread', () => {
    const rec = new PerfRecorder({});
    rec.frame(0, 0, 0, 0, 0, 0, ctx());
    let at = run(rec, 0, 2, 16);
    at = run(rec, at, 1, 100, ctx({ note: 'weapon.nuke' }));
    run(rec, at, 2, 16);
    const text = rec.report();
    const slow = text.split('## slowest seconds\n')[1]!.split('\n');
    // seconds end on a frame, so the slow stretch spills into a neighbour
    expect(slow.slice(1, 3).join('\n')).toContain('weapon.nuke');
    expect(Number(slow[1]!.split(',')[1])).toBeLessThan(20);
    expect(text).toMatch(/fps: avg [\d.]+, median 6\d(\.\d)?, worst second 1\d(\.\d)?\n/);
    expect(text).toMatch(/frame ms: ≤17: 9\d(\.\d)?%/);
    expect(text).toContain('gpu ms/frame: not available in this browser');
  });

  it('lists long frames with what they cost, and never an untimed first frame', () => {
    const rec = new PerfRecorder({});
    rec.frame(1000, 0, 0, 0, 0, 0, ctx());
    rec.frame(1016, 16, 1, 1, 0, 1, ctx());
    rec.frame(1216, 200, 8, 120, 30, 40, ctx());
    // back from a hidden tab: not a frame
    rec.frame(61216, 60000, 0, 0, 0, 0, ctx());
    const text = rec.report();
    const long = text.split('## frames over 50 ms')[1]!.split('\n');
    expect(long[1]).toBe('0.2,200,120,30,40,8,-');
    expect(long[2]).toBe('');
  });

  it('averages GPU time by part where the browser gives it', () => {
    const rec = new PerfRecorder({});
    rec.frame(0, 0, 0, 0, 0, 0, ctx());
    const gpu = GPU_PARTS.map((_, i) => i + 1);
    run(rec, 0, 2, 20, ctx({ gpu }));
    const text = rec.report();
    const total = gpu.reduce((a, b) => a + b, 0);
    expect(text).toContain(`gpu ms/frame: total ${total} (step 1, prep 2, `);
    expect(text).toContain(`,${gpu.join(',')},high,`);
  });

  it('keeps commas in notes out of the columns', () => {
    const rec = new PerfRecorder({});
    rec.frame(0, 0, 0, 0, 0, 0, ctx());
    run(rec, 0, 1, 20, ctx({ note: 'a,b\nc' }));
    expect(rec.report()).toContain(',a b c\n');
  });
});

describe('perfFileName', () => {
  it('is sortable by date', () => {
    expect(perfFileName(new Date(2026, 10, 17, 6, 5))).toBe('mudders-perf-20261117-0605.txt');
  });
});
