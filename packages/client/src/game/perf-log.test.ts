import { describe, expect, it } from 'vitest';
import { GPU_PARTS } from '../render/types';
import { PerfRecorder, perfFileName, stallDetail, type PerfContext } from './perf-log';

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
    weapon: '',
    holding: '',
    net: '',
    heap: 0,
    parts: null,
    worstTick: '',
    ...over,
  });
};

/** Feed `seconds` of frames `ms` apart. */
function run(rec: PerfRecorder, from: number, seconds: number, ms: number, c = ctx()): number {
  let now = from;
  const end = from + seconds * 1000;
  while (now < end) {
    now += ms;
    rec.frame(now, ms, 1, 0.5, 0.2, 1.5, 0.3, ms, c);
  }
  return now;
}

describe('PerfRecorder', () => {
  it('writes one row per second with the frame rate of that second', () => {
    const rec = new PerfRecorder({ kernel: '1.2.3', players: 4 });
    rec.frame(0, 0, 0, 0, 0, 0, 0, 0, ctx());
    const at = run(rec, 0, 3, 20);
    run(rec, at, 2, 50);
    const text = rec.report();
    expect(text.startsWith('# mudders performance log v2\nkernel: 1.2.3\nplayers: 4\n')).toBe(true);
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
    rec.frame(0, 0, 0, 0, 0, 0, 0, 0, ctx());
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
    expect(text).toContain(
      'gpu ms/frame: not measured (no timer in this browser and no Slow now pressed)',
    );
  });

  it('lists long frames with what they cost, and never an untimed first frame', () => {
    const rec = new PerfRecorder({});
    rec.frame(1000, 0, 0, 0, 0, 0, 0, 0, ctx());
    rec.frame(1016, 16, 1, 1, 0, 1, 0, 16, ctx());
    rec.frame(1216, 200, 8, 120, 30, 40, 5, 200, ctx());
    // back from a hidden tab: not a frame
    rec.frame(61216, 60000, 0, 0, 0, 0, 0, 0, ctx());
    const text = rec.report();
    const long = text.split('## frames over 50 ms')[1]!.split('\n');
    expect(long[1]).toBe('0.2,200,120,30,40,5,8,-');
    expect(long[2]).toBe('');
  });

  it('averages GPU time by part where the browser gives it', () => {
    const rec = new PerfRecorder({});
    rec.frame(0, 0, 0, 0, 0, 0, 0, 0, ctx());
    const gpu = GPU_PARTS.map((_, i) => i + 1);
    run(rec, 0, 2, 20, ctx({ gpu }));
    const text = rec.report();
    const total = gpu.reduce((a, b) => a + b, 0);
    expect(text).toContain(`gpu ms/frame: total ${total} (step 1, prep 2, `);
    expect(text).toContain(`,${gpu.join(',')},high,`);
  });

  it('keeps commas in notes out of the columns', () => {
    const rec = new PerfRecorder({});
    rec.frame(0, 0, 0, 0, 0, 0, 0, 0, ctx());
    run(rec, 0, 1, 20, ctx({ note: 'a,b\nc' }));
    expect(rec.report()).toContain(',a b c\n');
  });
});

describe('PerfRecorder marks and game speed', () => {
  it('shows the game running slow and the seconds the player marked', () => {
    // 50 frames a second, one tick each: 50 of 60 ticks, though the loop asked for full speed
    const rec = new PerfRecorder({});
    rec.frame(0, 0, 0, 0, 0, 0, 0, 0, ctx());
    const at = run(rec, 0, 3, 20);
    rec.mark(at + 400);
    run(rec, at, 2, 20);
    const text = rec.report();
    expect(text).toMatch(
      /game speed: avg 83\.\d%, slowest second 83\.\d%, 5 of 5 seconds under 90%/,
    );
    expect(text).toContain('marked slow by the player at: 3.4\n');
    const rows = text.split('## every second\n')[1]!.trim().split('\n');
    const head = rows[0]!.split(',');
    expect(rows[1]!.split(',')[head.indexOf('speed %')]).toMatch(/^83/);
    expect(rows[1]!.split(',')[head.indexOf('asked %')]).toBe('100');
    expect(rows.filter((r) => r.includes('SLOW-NOW'))).toHaveLength(1);
    expect(rows[4]).toContain(',SLOW-NOW gen.lakeland');
    const marked = text.split('## marked seconds, and the two before each\n')[1]!.split('\n\n')[0]!;
    expect(marked.split('\n').map((r) => r.split(',')[0])).toEqual(['t', '2', '3', '4']);
  });
});

describe('PerfRecorder diagnostics', () => {
  it('sums up each turn: how long it aimed and resolved, and what it waited on last', () => {
    const rec = new PerfRecorder({});
    rec.frame(0, 0, 0, 0, 0, 0, 0, 0, ctx());
    let at = run(rec, 0, 2, 20, ctx({ phase: 'aim', turn: 0, holding: 'player aiming' }));
    at = run(rec, at, 3, 20, ctx({ turn: 0, weapon: 'weapon.nuke', holding: 'debris + fire' }));
    at = run(rec, at, 1, 20, ctx({ turn: 0, weapon: 'weapon.nuke', holding: 'fire' }));
    run(
      rec,
      at,
      1,
      20,
      ctx({ phase: 'aim', turn: 1, weapon: 'weapon.nuke', holding: 'bot thinking' }),
    );
    const text = rec.report();
    const turns = text.split('## turns')[1]!.split('\n\n')[0]!.split('\n').slice(1);
    expect(turns).toEqual(['1,0,2,4,weapon.nuke,fire', '1,1,1,0,weapon.nuke,bot thinking']);
    const rows = text.split('## every second\n')[1]!.split('\n');
    const head = rows[0]!.split(',');
    expect(rows[3]!.split(',')[head.indexOf('waiting on')]).toBe('debris + fire');
    expect(rows[3]!.split(',')[head.indexOf('note')]).toBe('gen.lakeland weather.rain weapon.nuke');
  });

  it('splits the sim time by part and names the rest', () => {
    const rec = new PerfRecorder({}, ['settling', 'reactions']);
    rec.frame(0, 0, 0, 0, 0, 0, 0, 0, ctx());
    // 50 ticks of 0.5 ms: 10 ms settling, 5 ms reactions, 10 ms unaccounted
    run(rec, 0, 1, 20, ctx({ parts: [10, 5], worstTick: '3.1 ms of which settling 2' }));
    const part = rec.report().split('## sim by part, ms per tick, every second\n')[1]!.split('\n');
    expect(part[0]).toBe('t,ticks,settling,reactions,rest,slowest tick');
    expect(part[1]).toBe('1,50,0.2,0.1,0.2,3.1 ms of which settling 2');
  });

  it('lists what the browser reported as blocked, and the memory', () => {
    const rec = new PerfRecorder({});
    rec.frame(0, 0, 0, 0, 0, 0, 0, 0, ctx());
    rec.stall(400, 'long-animation-frame', 180, 'script 150, gc');
    let at = run(rec, 0, 1, 20, ctx({ heap: 40 }));
    at = run(rec, at, 1, 20, ctx({ heap: 55 }));
    run(rec, at, 1, 20, ctx({ heap: 31, net: 'guest starved=12 behind=3 rebuilds=0' }));
    const text = rec.report();
    expect(text).toContain('browser stalls: 1, longest 180 ms');
    expect(text).toContain(
      '## browser stalls (t, kind, ms, detail)\n0.4,long-animation-frame,180,script 150  gc\n',
    );
    expect(text).toContain('js heap MB: 31 to 55, 1 drops (garbage collections seen)');
    expect(text).toContain(',31,,guest starved=12 behind=3 rebuilds=0,');
    expect(text).toContain('fastest frame: 20 ms (the screen runs at up to about 50 Hz)');
    expect(text).toContain('other js ms/frame: avg 0.3, worst 0.3');
  });

  it('reads the cause out of a long animation frame entry', () => {
    expect(stallDetail({ duration: 120, startTime: 0 })).toBe('');
    expect(
      stallDetail({
        duration: 120,
        startTime: 1000,
        blockingDuration: 70,
        styleAndLayoutStart: 1100,
        scripts: [
          { duration: 20, invoker: 'TimerHandler:setTimeout' },
          { duration: 60, invoker: 'FrameRequestCallback', sourceFunctionName: 'frame' },
        ],
      }),
    ).toBe('blocking 70 script 80 style+layout 20 longest frame 60');
  });
});

describe('perfFileName', () => {
  it('is sortable by date', () => {
    expect(perfFileName(new Date(2026, 10, 17, 6, 5))).toBe('mudders-perf-20261117-0605.txt');
  });
});
