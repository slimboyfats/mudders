import { beforeAll, describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import type { NetSetup, PeerMessage, RenderSnapshot } from '@mudders/shared';
import type { ResolvedContent, WorldOptions } from '@mudders/sim';
import { linkPair } from '../net/link';
import { HASH_EVERY, HostMatch, type StartInfo } from '../net/lockstep';
import { LocalMatch, STEP_MS, type WorldView } from './match';
import {
  RemoteGuestMatch,
  RemoteHostMatch,
  RemoteLocalMatch,
  SimClient,
  mergeNet,
  type SimPort,
} from './sim-client';
import { SimHost } from './sim-host';
import { BufferPool, SnapshotMirror, encodeTick, type RemoteView } from './sim-wire';

let content: ResolvedContent;
beforeAll(() => {
  content = loadContent();
});

/**
 * A sim thread without a worker: the real host and client, joined by queues that clone every
 * message and hand its buffers over the way `postMessage` does. Nothing moves until `flush`.
 */
function thread() {
  const jobs: (() => void)[] = [];
  const port: SimPort = {
    post: (m, transfer) => {
      const c = structuredClone(m, { transfer: transfer ?? [] });
      jobs.push(() => host.handle(c));
    },
    onMessage: null,
  };
  const host = new SimHost(content, (m, transfer) => {
    const c = structuredClone(m, { transfer: transfer ?? [] });
    jobs.push(() => port.onMessage?.(c));
  });
  const client = new SimClient(port);
  client.ready = true;
  return {
    client,
    flush: () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) job();
    },
  };
}

function sum(a: Uint8Array | Int32Array, n = a.length): number {
  let h = 2166136261;
  for (let i = 0; i < n; i++) h = Math.imul(h ^ a[i]!, 16777619);
  return h >>> 0;
}

/** Everything a renderer could read off a snapshot, small enough to compare tick by tick. */
function digest(s: RenderSnapshot): string {
  const n = s.debris.count;
  return JSON.stringify([
    s.tick,
    s.turn,
    sum(s.terrain),
    sum(s.coating),
    sum(s.gas),
    s.shade ? sum(s.shade) : -1,
    s.dirtyRects,
    s.gasRect,
    s.entities,
    s.effectEvents,
    n,
    s.debris.rigid ?? -1,
    sum(s.debris.x, n),
    sum(s.debris.y, n),
    sum(s.debris.vx, n),
    sum(s.debris.material, n),
    s.debris.shade ? sum(s.debris.shade, n) : -1,
    s.wind,
    s.temperature,
    s.deathZone,
    s.preview ?? null,
    s.birds ?? null,
    s.weather ?? null,
  ]);
}

/** The world a snapshot listener can read beside its snapshot (the last-shot ghost does). */
function seen(w: WorldView): string {
  return JSON.stringify([
    w.tick,
    w.phase,
    w.round,
    w.turn,
    w.activePlayer,
    w.volley,
    w.tanks.map((t) => [
      t.player,
      t.ready,
      t.x,
      t.y,
      t.w,
      t.alive,
      t.health,
      t.maxHealth,
      t.team,
      t.bot,
      t.angle,
      t.power,
      w.weaponId(t.weapon),
    ]),
    w.projectiles.map((p) => [p.id, p.alive, p.owner, p.x, p.y]),
    w.grid.width,
    w.grid.height,
  ]);
}

const botMatch: WorldOptions = {
  seed: 11,
  mode: 'mode.classic',
  players: 2,
  map: { generator: 'gen.village', width: 320, height: 160 },
  weather: 'weather.rain',
  tankSetup: [
    { inventory: { 'weapon.nuke': 2, 'weapon.napalm': 2 } },
    { inventory: { 'weapon.ion-cannon': 2, 'weapon.missile': 5 } },
  ],
  turnOrder: [0, 1],
  bots: ['ai.shooter', 'ai.shooter'],
  rules: { birds: true, mapEvents: true },
};

describe('a match in the sim worker', () => {
  it(
    'shows the renderer the same snapshots, tick for tick, as a match on the page',
    {
      timeout: 60_000,
    },
    () => {
      const TICKS = 1500;
      const here = new LocalMatch(content, botMatch);
      const want: string[] = [];
      here.subscribe((s) => want.push(digest(s) + seen(here.world)));
      for (let i = 0; i < TICKS; i++) here.stepOnce();

      const t = thread();
      const there = new RemoteLocalMatch(t.client, content, botMatch);
      expect(there.ready).toBe(false);
      t.flush();
      expect(there.ready).toBe(true);
      const got: string[] = [];
      there.subscribe((s) => got.push(digest(s) + seen(there.world)));
      for (let i = 0; i < TICKS; i++) {
        there.advance(STEP_MS);
        t.flush();
      }
      there.advance(0);
      expect(got.length).toBe(want.length);
      for (let i = 0; i < want.length; i++) {
        if (got[i] !== want[i]) expect(`tick ${i}: ${got[i]}`).toBe(`tick ${i}: ${want[i]}`);
      }
      // the bots fired: this was not a comparison of two still maps
      expect(want.some((d) => d.includes('"explosion"') || d.includes('"muzzle"'))).toBe(true);
      expect(there.world.tick).toBe(TICKS);
      expect(there.hud()).toEqual(here.hud());
      expect(there.simMs()).toBeGreaterThan(0);
    },
  );

  it('gives a renderer that mounts late the whole map', () => {
    const t = thread();
    const m = new RemoteLocalMatch(t.client, content, botMatch);
    t.flush();
    let first: RenderSnapshot | null = null;
    m.subscribe((s) => (first ??= s));
    expect(first!.dirtyRects).toEqual([{ x: 0, y: 0, w: 320, h: 160 }]);
    expect(sum(first!.terrain)).toBe(sum(new LocalMatch(content, botMatch).world.grid.material));
  });

  it('keeps one advance in the air and hands saved-up time over when the worker answers', () => {
    const t = thread();
    const m = new RemoteLocalMatch(t.client, content, botMatch);
    t.flush();
    m.advance(STEP_MS);
    // the worker has not answered: these frames save their time up
    m.advance(STEP_MS);
    m.advance(STEP_MS);
    t.flush();
    m.advance(0);
    t.flush();
    expect(m.world.tick).toBe(3);
  });

  it('frees the match in the worker when the view lets go', async () => {
    const t = thread();
    const m = new RemoteLocalMatch(t.client, content, botMatch);
    t.flush();
    m.dispose();
    t.flush();
    m.advance(STEP_MS);
    t.flush();
    expect(m.world.tick).toBe(0);
  });
});

const NO_VIEW: RemoteView = {
  tick: 0,
  phase: 'shop',
  round: 0,
  turn: 0,
  activePlayer: -1,
  volley: false,
  tanks: [],
  projectiles: [],
  grid: { width: 0, height: 0 },
};

describe('snapshot patches', () => {
  it('use a returned buffer again', () => {
    const pool = new BufferPool();
    const m = new LocalMatch(content, botMatch);
    const mirror = new SnapshotMirror();
    let bufs = 0;
    let last: ArrayBuffer | null = null;
    m.subscribe((s) => {
      const p = encodeTick(s, pool, NO_VIEW);
      if (p.buf !== last) bufs++;
      last = p.buf;
      mirror.apply(p);
      pool.give(p.buf);
    });
    for (let i = 0; i < 200; i++) m.stepOnce();
    // the whole map once, then small patches out of very few buffers
    expect(bufs).toBeLessThan(8);
    expect(sum(mirror.last!.terrain)).toBe(sum(m.world.grid.material));
  });
});

const setup: NetSetup = {
  slots: ['human', 'human', 'ai.shooter'],
  size: 'small',
  scenery: 'none',
  rounds: 2,
  turnTimer: 3,
  wind: 'perTurn',
  suddenDeath: true,
  startingCash: 3000,
  teams: null,
  tanks: [],
};
const start: StartInfo = { seed: 1235, setup, mode: 'mode.classic' };

describe('online lockstep with both sims in workers', () => {
  it(
    'stays in step with a host on the page, through a dropped link',
    {
      timeout: 60_000,
    },
    async () => {
      // the reference: the same match with its host on the page, given the same inputs
      const ref = new HostMatch(content, start, 0);
      const hashes = new Map<number, string>();

      const ht = thread();
      const gt = thread();
      const host = new RemoteHostMatch(ht.client, content, start, 0);
      ht.flush();
      let [h, g] = linkPair('local', true);
      let guest: RemoteGuestMatch | null = null;
      const wire = () => {
        h.onMessage = (m) => host.handle(1, m);
        g.onMessage = (m: PeerMessage) => {
          if (!guest && m.type === 'start') {
            guest = new RemoteGuestMatch(gt.client, content, m, (x) => g.send(x));
          } else guest?.handle(m);
        };
      };
      wire();
      host.attach(1, h, -1);
      ht.flush();
      gt.flush();
      expect(guest).not.toBeNull();
      const gm = guest!;
      expect(gm.ready).toBe(true);
      expect(gm.you).toBe(1);

      let shopped = -1;
      let shot = -1;
      const both = (player: number, input: Parameters<HostMatch['input']>[1]) => {
        ref.submit(player, input);
        if (player === 0) host.input(0, input);
        else gm.input(1, input);
      };
      const STEPS = 600;
      // only the last ticks' hashes are compared (hashing every tick is most of this test's time)
      const keep = (): void => {
        if (ref.world.tick > STEPS - HASH_EVERY) hashes.set(ref.world.tick, ref.world.hash());
      };
      for (let i = 0; i < STEPS; i++) {
        const w = ref.world;
        if (w.phase === 'shop' && shopped !== w.round) {
          both(0, { type: 'ready' });
          both(1, { type: 'ready' });
          shopped = w.round;
        } else if (w.phase === 'aim' && w.activePlayer < 2 && shot !== w.turn + w.round * 1000) {
          both(w.activePlayer, { type: 'aim', angle: w.activePlayer === 0 ? 50 : 130, power: 420 });
          both(w.activePlayer, { type: 'fire' });
          shot = w.turn + w.round * 1000;
        }
        // the guest's inputs reach the host (worker → wire → host's worker) before the tick
        gt.flush();
        ht.flush();
        ref.stepOnce();
        keep();
        host.advance(STEP_MS);
        ht.flush();
        gm.advance(STEP_MS);
        gt.flush();
        ht.flush();
        if (i === 300) {
          // the host runs on while the guest's page sees nothing of it...
          for (let k = 0; k < 3; k++) {
            // an input in each of those ticks: the host will send them twice
            ref.submit(0, { type: 'aim', angle: 40 + k, power: 300 });
            host.input(0, { type: 'aim', angle: 40 + k, power: 300 });
            ref.stepOnce();
            keep();
            host.advance(STEP_MS);
            ht.flush();
          }
          // ...and the link drops while the guest's worker is ahead of what its page knows
          gm.advance(STEP_MS * 3);
          const known = gm.world.tick;
          host.detach(1);
          h.close();
          [h, g] = linkPair('local', true);
          wire();
          gm.send = (x) => g.send(x);
          host.attach(1, h, gm.resumeFrom());
          gt.flush();
          ht.flush();
          gt.flush();
          expect(gm.world.tick).toBeGreaterThan(known);
        }
      }
      const END = ref.world.tick;
      expect(END).toBe(STEPS + 3);
      expect(shot).toBeGreaterThan(-1);
      const hostHash = await flushed(host.hash(), ht.flush);
      expect(hostHash.tick).toBe(END);
      expect(hostHash.hash).toBe(hashes.get(END));
      // the guest trails the host's last permit by a tick or two
      for (let i = 0; i < 4; i++) {
        gm.advance(STEP_MS);
        gt.flush();
      }
      const guestHash = await flushed(gm.hash(), gt.flush);
      expect(guestHash.tick).toBeGreaterThan(END - HASH_EVERY);
      expect(guestHash.hash).toBe(hashes.get(guestHash.tick));
      ht.flush();
      expect(host.desyncs).toBe(0);
      expect(gm.rebuilds).toBe(0);
      expect(gm.lag).toBe(0);
    },
  );
});

function flushed<T>(p: Promise<T>, flush: () => void): Promise<T> {
  flush();
  return p;
}

describe('mergeNet', () => {
  it('adds up a guest and keeps the newer host line', () => {
    expect(
      mergeNet('guest starved=2 behind=3 rebuilds=0', 'guest starved=1 behind=1 rebuilds=1'),
    ).toBe('guest starved=3 behind=3 rebuilds=1');
    expect(mergeNet('host guests=1 resyncs=0', 'host guests=2 resyncs=0')).toBe(
      'host guests=2 resyncs=0',
    );
    expect(mergeNet('', 'guest starved=0 behind=0 rebuilds=0')).toBe(
      'guest starved=0 behind=0 rebuilds=0',
    );
  });
});
