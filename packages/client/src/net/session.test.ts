import { beforeAll, describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import { MAX_PLAYERS, PROTOCOL_VERSION } from '@mudders/shared';
import type { ResolvedContent } from '@mudders/sim';
import { linkPair } from './link';
import {
  GuestSession,
  HostSession,
  SILENCE_MS,
  STAND_IN,
  TAKEOVER_MS,
  type LobbyRules,
  type SessionEnv,
} from './session';

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
  teams: null,
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
    const rest = MAX_PLAYERS - 4;
    expect(b.lobby?.seats.map((s) => s.kind)).toEqual([
      'host',
      'guest',
      'guest',
      'bot',
      ...Array<string>(rest).fill('open'),
    ]);
    expect(a.lobby?.setup.slots).toEqual([
      'human',
      'human',
      'human',
      'ai.shooter',
      ...Array<string>(rest).fill('off'),
    ]);

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

  it('plays in teams: the host picks teams per seat and every peer gets the same teams', () => {
    const e = env();
    const host = new HostSession(content, 'Host', { ...rules, teams: [0, 0] }, e);
    const g = new GuestSession(content, 'G', undefined, e);
    connect(host, g);
    host.setSeat(2, 'ai.shooter');
    host.setSeat(3, 'ai.shooter');
    host.setTeam(1, 1);
    host.setTeam(3, 1);
    expect(g.lobby?.setup.teams?.slice(0, 4)).toEqual([0, 1, 0, 1]);
    const match = host.start(3);
    expect(match.world.options.mode).toBe('mode.teams');
    expect(match.world.tanks.map((t) => t.team)).toEqual([0, 1, 0, 1]);
    expect(g.match!.world.tanks.map((t) => t.team)).toEqual([0, 1, 0, 1]);
  });

  it('tank picks: guests choose their own, the host the rest, and every peer builds the same tanks', () => {
    const e = env();
    const host = new HostSession(content, 'Host', rules, e);
    const g = new GuestSession(content, 'G', undefined, e);
    connect(host, g);
    host.setSeat(2, 'ai.shooter');
    host.setSeat(3, 'ai.cyborg');
    host.setTank(0, 'tank.bruiser');
    host.setTank(1, 'tank.howitzer'); // the guest's seat: ignored
    host.setTank(3, 'random');
    g.pickTank('tank.scout');
    host.setTank(2, 'tank.nope'); // unknown: ignored
    expect(g.lobby?.setup.tanks.slice(0, 4)).toEqual([
      'tank.bruiser',
      'tank.scout',
      'auto',
      'random',
    ]);
    const match = host.start(5);
    const ids = match.world.tanks.map((t) => t.type.id);
    expect(ids.slice(0, 3)).toEqual(['tank.bruiser', 'tank.scout', 'tank.howitzer']);
    expect(ids[3]).toMatch(/^tank\./);
    expect(g.match!.world.tanks.map((t) => t.type.id)).toEqual(ids);
    g.pickTank('tank.bulwark'); // too late: the match has started
    expect(match.world.tanks[1]!.type.id).toBe('tank.scout');
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

    for (let i = 1; i < MAX_PLAYERS; i++) host.setSeat(i, 'ai.shooter');
    const late = new GuestSession(content, 'Late', undefined, e);
    connect(host, late);
    expect(late.status).toBe('refused');
    expect(late.reason).toMatch(/full/);

    host.setSeat(MAX_PLAYERS - 1, 'open');
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

  it('an AI stands in for a dropped guest after the window and hands back on rejoin', () => {
    const e = env();
    const host = new HostSession(content, 'Host', { ...rules, turnTimer: 0 }, e);
    const a = new GuestSession(content, 'Ann', undefined, e);
    const first = connect(host, a);
    const match = host.start(5);
    const tank = () => match.world.tanks[1]!;
    match.stepOnce();
    first.h.close();
    e.advance(TAKEOVER_MS - 1);
    host.heartbeat();
    match.stepOnce();
    expect(tank().bot).toBe(-1);
    e.advance(1);
    host.heartbeat();
    match.stepOnce();
    expect(match.world.botId(tank().bot)).toBe(STAND_IN);
    expect(host.lobbyFor(0).seats[1]!.standIn).toBe(STAND_IN);
    // the takeover is a logged input, so a rejoining guest replays it too
    expect(match.log.some((i) => i.action.type === 'takeover')).toBe(true);
    for (let i = 0; i < 300; i++) match.stepOnce();
    connect(host, a);
    match.stepOnce();
    expect(tank().bot).toBe(-1);
    expect(host.lobbyFor(0).seats[1]!.standIn).toBeUndefined();
    match.flush();
    while (a.match!.stepOnce());
    expect(a.match!.world.hash()).toBe(match.world.hash());
  });

  it('never takes over when the host turned it off; guests cannot issue takeovers', () => {
    const e = env();
    const host = new HostSession(content, 'Host', rules, e);
    host.takeoverMs = 0;
    const a = new GuestSession(content, 'Ann', undefined, e);
    const l = connect(host, a);
    const match = host.start(5);
    a.match!.send({ type: 'input', action: { type: 'takeover', bot: 'ai.shooter' } });
    match.stepOnce();
    expect(match.world.tanks.map((t) => t.bot)).toEqual([-1, -1]);
    l.h.close();
    e.advance(TAKEOVER_MS * 10);
    host.heartbeat();
    match.stepOnce();
    expect(match.world.tanks[1]!.bot).toBe(-1);
  });

  it('a host whose tab stays hidden gets a stand-in until it is back', () => {
    const e = env();
    const host = new HostSession(content, 'Host', rules, e);
    connect(host, new GuestSession(content, 'Ann', undefined, e));
    const match = host.start(5);
    host.setHostAway(true);
    e.advance(TAKEOVER_MS);
    host.heartbeat();
    match.stepOnce();
    expect(match.world.tanks[0]!.bot).toBeGreaterThanOrEqual(0);
    host.setHostAway(false);
    match.stepOnce();
    expect(match.world.tanks[0]!.bot).toBe(-1);
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
