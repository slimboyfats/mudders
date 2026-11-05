import { beforeAll, describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import { PROTOCOL_VERSION } from '@mudders/shared';
import type { ResolvedContent } from '@mudders/sim';
import { linkPair } from './link';
import { GuestSession, HostSession, SILENCE_MS, type LobbyRules, type SessionEnv } from './session';

let content: ResolvedContent;
beforeAll(() => {
  content = loadContent();
});

const rules: LobbyRules = {
  size: 'small',
  scenery: 'none',
  rounds: 1,
  turnTimer: 2,
  wind: 'none',
  suddenDeath: false,
  startingCash: 0,
};

function env() {
  let now = 0;
  let n = 0;
  const e: SessionEnv & { advance: (ms: number) => void } = {
    now: () => now,
    token: () => `tok${++n}`,
    advance: (ms) => {
      now += ms;
    },
  };
  return e;
}

function connect(host: HostSession, guest: GuestSession) {
  const [h, g] = linkPair('local', true);
  host.addLink(h);
  guest.attach(g);
  return { h, g };
}

describe('host and guest sessions', () => {
  it('seats guests, shares the lobby and starts the same match everywhere', () => {
    const e = env();
    const host = new HostSession(content, 'Host', rules, e);
    const a = new GuestSession(content, 'Ann', undefined, e);
    const b = new GuestSession(content, 'Bob', undefined, e);
    connect(host, a);
    connect(host, b);
    host.setSeat(3, 'ai.shooter');
    expect(a.status).toBe('lobby');
    expect(a.token).toBe('tok1');
    expect(b.lobby?.you).toBe(2);
    expect(b.lobby?.seats.map((s) => s.kind)).toEqual(['host', 'guest', 'guest', 'bot']);
    expect(a.lobby?.setup.slots).toEqual(['human', 'human', 'human', 'ai.shooter']);

    const match = host.start(99);
    expect(a.status).toBe('playing');
    expect(a.match?.you).toBe(1);
    expect(b.match?.you).toBe(2);
    for (let i = 0; i < 600; i++) {
      const w = match.world;
      if (w.phase === 'aim' && w.activePlayer === 2 && b.match!.world.activePlayer === 2) {
        b.match!.input(2, { type: 'fire' });
      }
      match.stepOnce();
      while (a.match!.stepOnce());
      while (b.match!.stepOnce());
    }
    match.flush();
    while (a.match!.stepOnce());
    while (b.match!.stepOnce());
    expect(a.match!.world.hash()).toBe(match.world.hash());
    expect(b.match!.world.hash()).toBe(match.world.hash());
  });

  it('refuses a guest with different content or protocol, a full game and a started match', () => {
    const e = env();
    const host = new HostSession(content, 'Host', rules, e);
    const [h, g] = linkPair('local', true);
    host.addLink(h);
    const got: unknown[] = [];
    g.onMessage = (m) => got.push(m);
    g.send({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      kernelVersion: '0.0.0-other',
      contentHash: 'nope',
      name: 'Old',
      haveTick: -1,
    });
    expect(got[0]).toMatchObject({ type: 'accept', ok: false });
    expect(String((got[0] as { reason: string }).reason)).toMatch(/content/);
    expect(g.open).toBe(false);

    for (let i = 1; i < 4; i++) host.setSeat(i, 'ai.shooter');
    const late = new GuestSession(content, 'Late', undefined, e);
    connect(host, late);
    expect(late.status).toBe('refused');
    expect(late.reason).toMatch(/full/);

    host.setSeat(3, 'open');
    host.start(1);
    const later = new GuestSession(content, 'Later', undefined, e);
    connect(host, later);
    expect(later.reason).toMatch(/started/);
  });

  it('a guest that drops comes back to the same seat and catches up', () => {
    const e = env();
    const host = new HostSession(content, 'Host', rules, e);
    const a = new GuestSession(content, 'Ann', undefined, e);
    let lost = 0;
    a.onLost = () => lost++;
    const first = connect(host, a);
    const match = host.start(5);
    for (let i = 0; i < 100; i++) {
      match.stepOnce();
      while (a.match!.stepOnce());
    }
    first.h.close();
    expect(a.status).toBe('reconnecting');
    expect(lost).toBe(1);
    expect(host.lobbyFor(0).seats[1]!.connected).toBe(false);
    for (let i = 0; i < 400; i++) match.stepOnce();
    connect(host, a);
    expect(a.status).toBe('playing');
    expect(a.match!.rebuilds).toBe(0);
    while (a.match!.stepOnce());
    expect(a.match!.world.tick).toBe(match.world.tick);
    expect(a.match!.world.hash()).toBe(match.world.hash());
    expect(host.lobbyFor(0).seats[1]!.connected).toBe(true);
  });

  it('a guest that reloads rebuilds from the log with its saved token', () => {
    const e = env();
    const host = new HostSession(content, 'Host', rules, e);
    const a = new GuestSession(content, 'Ann', undefined, e);
    const l = connect(host, a);
    const match = host.start(5);
    for (let i = 0; i < 300; i++) match.stepOnce();
    l.h.close();
    const reloaded = new GuestSession(content, 'Ann', a.token, e);
    connect(host, reloaded);
    expect(reloaded.match?.world.tick).toBe(match.world.tick);
    expect(reloaded.match?.world.hash()).toBe(match.world.hash());
    expect(reloaded.match?.you).toBe(1);
  });

  it('heartbeats measure round trips and close silent links', () => {
    const e = env();
    const host = new HostSession(content, 'Host', rules, e);
    const a = new GuestSession(content, 'Ann', undefined, e);
    connect(host, a);
    e.advance(30);
    host.heartbeat();
    a.heartbeat();
    expect(host.seats[1]!.rtt).toBe(0);
    expect(a.rtt).toBe(0);
    // the guest goes quiet (screen locked): the host drops the link
    a.link!.onMessage = null;
    const quiet = a.link!;
    quiet.send = () => {};
    e.advance(SILENCE_MS + 1);
    host.heartbeat();
    expect(host.seats[1]!.link).toBeNull();
  });

  it('a bye from the host closes the guest', () => {
    const e = env();
    const host = new HostSession(content, 'Host', rules, e);
    const a = new GuestSession(content, 'Ann', undefined, e);
    connect(host, a);
    host.close();
    expect(a.status).toBe('closed');
    expect(a.reason).toMatch(/closed/);
  });
});
