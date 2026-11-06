import { beforeAll, describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import type { NetSetup, PeerMessage } from '@mudders/shared';
import type { ResolvedContent } from '@mudders/sim';
import { linkPair, TextLink, CHUNK } from './link';
import { AIM_INTERVAL_MS, GuestMatch, HASH_EVERY, HostMatch, type StartInfo } from './lockstep';

let content: ResolvedContent;
beforeAll(() => {
  content = loadContent();
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
};
const start: StartInfo = { seed: 1234, setup, mode: 'mode.classic' };

/** Host (player 0) and one guest (player 1) over a synchronous in-memory link. */
function pair() {
  const host = new HostMatch(content, start, 0);
  let [h, g] = linkPair('local', true);
  const ref: { guest: GuestMatch | null } = { guest: null };
  const sent: PeerMessage[] = [];
  const wire = () => {
    h.onMessage = (m) => host.handle(1, m);
    g.onMessage = (m) => {
      sent.push(m);
      if (!ref.guest && m.type === 'start')
        ref.guest = new GuestMatch(content, m, (x) => g.send(x));
      else ref.guest?.handle(m);
    };
  };
  wire();
  host.attach(1, h, -1);
  const guest = () => ref.guest!;
  return {
    host,
    guest,
    sent,
    /** Drop the link and connect a fresh one, resuming from the guest's tick. */
    reconnect: () => {
      host.detach(1);
      h.close();
      [h, g] = linkPair('local', true);
      wire();
      guest().send = (x) => g.send(x);
      host.attach(1, h, guest().resumeFrom());
    },
    drop: () => {
      host.detach(1);
      h.close();
    },
  };
}

/** Both humans aim and fire whenever it is their turn; one step of the host, then the guest. */
function play(p: ReturnType<typeof pair>, ticks: number, guestFollows = true) {
  let shot = -1;
  for (let i = 0; i < ticks; i++) {
    const w = p.host.world;
    if (w.phase === 'aim' && w.turn !== shot) {
      if (w.activePlayer === 0) {
        p.host.input(0, { type: 'aim', angle: 60 + (w.turn % 5) * 5, power: 520 });
        p.host.input(0, { type: 'fire' });
        shot = w.turn;
      } else if (w.activePlayer === 1 && guestFollows && p.guest().world.activePlayer === 1) {
        const gw = p.guest().world;
        if (gw.phase === 'aim') {
          p.guest().input(1, { type: 'aim', angle: 120 - (gw.turn % 4) * 5, power: 480 });
          p.guest().input(1, { type: 'fire' });
          p.guest().advance(AIM_INTERVAL_MS); // flush the throttled aim
          shot = w.turn;
        }
      }
    }
    p.host.stepOnce();
    if (guestFollows) while (p.guest().stepOnce());
  }
}

/** Flush the host's permit and let the guest catch up, so both sit on the same tick. */
function settle(p: ReturnType<typeof pair>) {
  p.host.flush();
  while (p.guest().stepOnce());
  expect(p.guest().world.tick).toBe(p.host.world.tick);
}

describe('lockstep', () => {
  it('keeps a guest in step with the host through shots, bots and turns', () => {
    const p = pair();
    play(p, 2400);
    settle(p);
    const g = p.guest();
    expect(g.world.tick).toBe(p.host.world.tick);
    expect(g.world.hash()).toBe(p.host.world.hash());
    expect(p.host.log.filter((i) => i.action.type === 'fire').length).toBeGreaterThan(3);
    expect(p.host.log.some((i) => i.player === 1 && i.action.type === 'fire')).toBe(true);
    expect(p.host.desyncs).toBe(0);
  });

  it('never lets a guest run past the permit', () => {
    const p = pair();
    play(p, 30);
    const g = p.guest();
    expect(g.lag).toBe(0);
    expect(g.stepOnce()).toBe(false);
    expect(g.advance(1000)).toBe(g.world.tick);
  });

  it('detects a desync by hash and rebuilds the guest from the log', () => {
    const p = pair();
    play(p, 200);
    p.guest().world.tanks[0]!.health -= 7; // corrupt the guest
    play(p, HASH_EVERY * 2);
    expect(p.host.desyncs).toBe(1);
    expect(p.guest().rebuilds).toBe(1);
    play(p, 300);
    settle(p);
    expect(p.guest().world.hash()).toBe(p.host.world.hash());
  });

  it('resumes a guest that dropped (screen lock) from the tick it reached', () => {
    const p = pair();
    play(p, 400);
    const before = p.guest().world.tick;
    p.drop();
    play(p, 700, false); // host plays on without the guest (bot + host shots)
    expect(p.guest().world.tick).toBe(before);
    p.reconnect();
    expect(p.guest().rebuilds).toBe(0);
    // catch-up runs faster than real time
    let frames = 0;
    while (p.guest().lag > 0) {
      p.guest().advance(16);
      frames++;
    }
    expect(frames).toBeLessThan(20);
    settle(p);
    expect(p.guest().world.hash()).toBe(p.host.world.hash());
  });

  it('rebuilds a guest that reloaded from the whole log', () => {
    const p = pair();
    play(p, 900);
    const fresh = new GuestMatch(content, p.host.startMessage(1), () => {});
    expect(fresh.world.tick).toBe(p.host.world.tick);
    expect(fresh.world.hash()).toBe(p.host.world.hash());
  });

  it('asks for a resync when an input arrives stamped in its past', () => {
    const p = pair();
    play(p, 10);
    const asked: PeerMessage[] = [];
    const g = p.guest();
    g.send = (m) => asked.push(m);
    g.handle({
      type: 'tick',
      upTo: g.world.tick + 2,
      inputs: [{ t: 1, player: 0, action: { type: 'fire' } }],
    });
    g.stepOnce();
    expect(asked).toEqual([{ type: 'hash', t: g.world.tick - 1, h: 'resync' }]);
  });

  it('collapses aim spam: guests throttle, the host keeps the last aim per tick', () => {
    const p = pair();
    play(p, 2);
    const out: PeerMessage[] = [];
    const g = p.guest();
    const send = g.send;
    g.send = (m) => out.push(m);
    for (let a = 10; a < 20; a++) g.input(1, { type: 'aim', angle: a, power: 500 });
    g.input(0, { type: 'fire' }); // not my player: ignored
    expect(out).toHaveLength(1);
    g.input(1, { type: 'selectWeapon', weapon: 'weapon.missile' }); // flushes the stashed aim first
    expect(out.map((m) => (m.type === 'input' ? m.action.type : m.type))).toEqual([
      'aim',
      'aim',
      'selectWeapon',
    ]);
    g.send = send;
    const host = p.host;
    const before = host.log.length;
    for (let a = 30; a < 40; a++) host.input(0, { type: 'aim', angle: a, power: 400 });
    host.input(1, { type: 'fire' }); // the host UI can only drive the host's player
    host.stepOnce();
    expect(host.log.slice(before)).toEqual([
      { t: host.world.tick - 1, player: 0, action: { type: 'aim', angle: 39, power: 400 } },
    ]);
  });
});

describe('text link', () => {
  it('splits and reassembles messages larger than a frame', () => {
    const [a, b] = linkPair('local', true);
    const got: PeerMessage[] = [];
    b.onMessage = (m) => got.push(m);
    const inputs = Array.from({ length: 2000 }, (_, t) => ({
      t,
      player: 0,
      action: { type: 'aim' as const, angle: t % 180, power: 500 },
    }));
    const frames: string[] = [];
    const spy = new TextLink('local', (t) => frames.push(t));
    spy.send({ type: 'tick', upTo: 2000, inputs });
    expect(frames.length).toBeGreaterThan(3);
    expect(frames.every((f) => f.length <= CHUNK + 20)).toBe(true);
    for (const f of frames) b.receive(f);
    a.send({ type: 'ping', n: 7 });
    expect(got).toEqual([
      { type: 'tick', upTo: 2000, inputs },
      { type: 'ping', n: 7 },
    ]);
  });

  it('drops malformed frames and fires onClose once', () => {
    const [a, b] = linkPair('local', true);
    const got: PeerMessage[] = [];
    let closes = 0;
    b.onMessage = (m) => got.push(m);
    b.onClose = () => closes++;
    b.receive('{"type":"nope"}');
    b.receive('not json');
    b.receive('\u0001x|1|2|out of order');
    a.close();
    a.close();
    expect(got).toEqual([]);
    expect(closes).toBe(1);
    expect(b.open).toBe(false);
  });
});
