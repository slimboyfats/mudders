import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, type ServerMessage } from '@mudders/shared';
import { Lobby, type LobbyOptions } from './lobby';

function setup(opts: Partial<LobbyOptions> = {}) {
  let now = 1_000;
  let seed = 1;
  const lobby = new Lobby({
    now: () => now,
    // deterministic ids for the tests
    random: () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    },
    ...opts,
  });
  const client = (addr = 'a') => {
    const inbox: ServerMessage[] = [];
    let closed = false;
    const h = lobby.connect(
      (m) => inbox.push(m),
      () => {
        closed = true;
      },
      addr,
    );
    const c = {
      inbox,
      get closed() {
        return closed;
      },
      send: (m: unknown) => h.message(JSON.stringify(m)),
      drop: () => h.close(),
      last: () => inbox[inbox.length - 1],
      of: <T extends ServerMessage['type']>(t: T) =>
        inbox.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === t),
      id: '',
      secret: '',
    };
    return c;
  };
  const hello = (addr = 'a') => {
    const c = client(addr);
    c.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
    const w = c.last();
    if (w?.type !== 'welcome' || !w.ok) throw new Error('no welcome');
    c.id = w.id!;
    c.secret = w.secret!;
    return c;
  };
  return {
    lobby,
    client,
    hello,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const room = { type: 'createRoom', name: 'Mud', public: true, maxPlayers: 3, summary: 'Small' };

describe('lobby', () => {
  it('refuses a mismatched protocol and messages before hello', () => {
    const { client } = setup();
    const c = client();
    c.send({ type: 'listRooms' });
    expect(c.last()).toMatchObject({ type: 'welcome', ok: false });
    c.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION + 1 });
    expect(c.last()).toMatchObject({ ok: false, reason: 'update your game' });
    c.send('not json');
    c.send({ type: 'nope' });
    expect(c.last()).toMatchObject({ ok: false, reason: 'bad message' });
  });

  it('creates a room with a 6-character code and lets others join it', () => {
    const { hello } = setup();
    const host = hello();
    host.send(room);
    const up = host.of('roomUpdate')[0]!;
    expect(up.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(up.host).toBe(host.id);
    const guest = hello();
    guest.send({ type: 'joinRoom', code: up.code });
    const seen = host.of('roomUpdate').at(-1)!;
    expect(seen.members.map((m) => m.id)).toEqual([host.id, guest.id]);
    expect(guest.of('roomUpdate').at(-1)!.members).toHaveLength(2);
  });

  it('refuses unknown, full and started rooms', () => {
    const { hello } = setup();
    const host = hello();
    host.send({ ...room, maxPlayers: 2 });
    const code = host.of('roomUpdate')[0]!.code;
    const a = hello();
    a.send({ type: 'joinRoom', code: 'ZZZZZZ' });
    expect(a.last()).toMatchObject({ type: 'error', code: 'notFound' });
    a.send({ type: 'joinRoom', code });
    const b = hello();
    b.send({ type: 'joinRoom', code });
    expect(b.last()).toMatchObject({ type: 'error', code: 'full' });
    a.send({ type: 'startMatch' });
    expect(a.last()).toMatchObject({ code: 'notHost' });
    host.send({ type: 'startMatch' });
    expect(host.last()).toMatchObject({ type: 'roomUpdate', started: true });
    a.send({ type: 'leaveRoom' });
    b.send({ type: 'joinRoom', code });
    expect(b.last()).toMatchObject({ code: 'started' });
  });

  it('lists only public rooms that can be joined', () => {
    const { hello } = setup();
    const h1 = hello();
    h1.send(room);
    const h2 = hello();
    h2.send({ ...room, public: false, name: 'Secret' });
    const c = hello();
    c.send({ type: 'listRooms' });
    expect(c.of('rooms')[0]!.rooms.map((r) => r.name)).toEqual(['Mud']);
  });

  it('relays offer, answer, ice and data only within a room', () => {
    const { hello } = setup();
    const host = hello();
    host.send(room);
    const code = host.of('roomUpdate')[0]!.code;
    const guest = hello();
    guest.send({ type: 'joinRoom', code });
    const outsider = hello();
    host.send({ type: 'offer', to: guest.id, sdp: 'v=0 offer' });
    expect(guest.last()).toEqual({ type: 'offer', from: host.id, sdp: 'v=0 offer' });
    guest.send({ type: 'answer', to: host.id, sdp: 'v=0 answer' });
    expect(host.last()).toEqual({ type: 'answer', from: guest.id, sdp: 'v=0 answer' });
    guest.send({ type: 'ice', to: host.id, candidate: null });
    expect(host.last()).toEqual({ type: 'ice', from: guest.id, candidate: null });
    host.send({ type: 'relay', to: guest.id, data: '{"type":"ping","n":1}' });
    expect(guest.last()).toEqual({ type: 'relay', from: host.id, data: '{"type":"ping","n":1}' });
    outsider.send({ type: 'relay', to: host.id, data: 'x' });
    expect(outsider.last()).toMatchObject({ type: 'error', code: 'notInRoom' });
  });

  it('keeps a dropped member seated for the grace period and lets it reclaim its id', () => {
    const { hello, client, lobby, advance } = setup({ graceMs: 20_000 });
    const host = hello();
    host.send(room);
    const code = host.of('roomUpdate')[0]!.code;
    const guest = hello();
    guest.send({ type: 'joinRoom', code });
    guest.drop();
    expect(host.of('roomUpdate').at(-1)!.members[1]).toEqual({ id: guest.id, connected: false });
    advance(10_000);
    lobby.sweep();
    const again = client();
    again.send({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      id: guest.id,
      secret: guest.secret,
    });
    expect(again.inbox[0]).toMatchObject({ ok: true, id: guest.id, resumed: true });
    expect(host.of('roomUpdate').at(-1)!.members[1]).toEqual({ id: guest.id, connected: true });
    // a wrong secret gets a fresh identity instead
    const thief = client();
    thief.send({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      id: guest.id,
      secret: 'x'.repeat(8),
    });
    expect(thief.inbox[0]).toMatchObject({ ok: true, resumed: false });
    expect((thief.inbox[0] as { id: string }).id).not.toBe(guest.id);
  });

  it('removes a member after the grace period and closes the room when the host goes', () => {
    const { hello, lobby, advance } = setup({ graceMs: 20_000 });
    const host = hello();
    host.send(room);
    const code = host.of('roomUpdate')[0]!.code;
    const guest = hello();
    guest.send({ type: 'joinRoom', code });
    host.drop();
    advance(25_000);
    lobby.sweep();
    expect(guest.last()).toMatchObject({
      type: 'error',
      code: 'notFound',
      reason: 'the host left',
    });
    expect(lobby.roomCount).toBe(0);
  });

  it('expires idle rooms', () => {
    const { hello, lobby, advance } = setup({ idleMs: 60_000 });
    hello().send(room);
    advance(61_000);
    lobby.sweep();
    expect(lobby.roomCount).toBe(0);
  });

  it('rate-limits room creation per address and messages per connection', () => {
    const { hello, advance } = setup({ createsPerMinute: 2, messagesPerSecond: 5 });
    const a = hello('1.2.3.4');
    a.send(room);
    a.send(room);
    a.send(room);
    expect(a.last()).toMatchObject({ type: 'error', code: 'rateLimited' });
    advance(61_000);
    a.send(room);
    expect(a.last()).toMatchObject({ type: 'roomUpdate' });
    const b = hello('5.6.7.8');
    for (let i = 0; i < 8; i++) b.send({ type: 'listRooms' });
    expect(b.of('rooms')).toHaveLength(4); // hello counted as the first message
    expect(b.of('error')).toHaveLength(1);
  });

  it('counts link paths for the TURN decision', () => {
    const { hello, lobby } = setup();
    const a = hello();
    a.send({ type: 'path', path: 'p2p', ms: 400 });
    a.send({ type: 'path', path: 'relay', ms: 5200 });
    a.send({ type: 'path', path: 'p2p', ms: 600 });
    expect(lobby.stats()).toMatchObject({ p2p: 2, relay: 1, meanMs: { p2p: 500, relay: 5200 } });
  });
});
