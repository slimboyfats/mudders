import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, ServerMessageSchema, type ServerMessage } from '@mudders/shared';
import { startServer, type SignalServer } from './server';

let srv: SignalServer;

beforeAll(async () => {
  srv = await startServer(0);
});
afterAll(async () => {
  await srv.close();
});

/** A socket that collects parsed server messages. */
function open() {
  const ws = new WebSocket(`ws://localhost:${srv.port}/ws`);
  const inbox: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.onmessage = (e) => {
    inbox.push(ServerMessageSchema.parse(JSON.parse(String(e.data))));
    for (const w of waiters.splice(0)) w();
  };
  const ready = new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('socket error'));
  });
  const next = async <T extends ServerMessage['type']>(type: T) => {
    for (;;) {
      const i = inbox.findIndex((m) => m.type === type);
      if (i >= 0) return inbox.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
      await new Promise<void>((r) => waiters.push(r));
    }
  };
  return { ws, ready, next, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

describe('signal server', () => {
  it('reports health and stats', async () => {
    const res = await fetch(`http://localhost:${srv.port}/health`);
    expect(await res.json()).toEqual({ ok: true, protocolVersion: PROTOCOL_VERSION });
    const stats = await fetch(`http://localhost:${srv.port}/stats`);
    expect(await stats.json()).toMatchObject({ paths: { p2p: 0, relay: 0 } });
  });

  it('refuses a mismatched protocol version', async () => {
    const c = open();
    await c.ready;
    c.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION + 1 });
    expect(await c.next('welcome')).toMatchObject({ ok: false, reason: 'update your game' });
    c.ws.close();
  });

  it('runs a room over real sockets: create, join, relay', async () => {
    const host = open();
    const guest = open();
    await Promise.all([host.ready, guest.ready]);
    host.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
    guest.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
    const hw = await host.next('welcome');
    const gw = await guest.next('welcome');
    expect(hw.ok && gw.ok).toBe(true);
    host.send({ type: 'createRoom', name: 'Mud', public: false, maxPlayers: 2, summary: '' });
    const { code } = await host.next('roomUpdate');
    guest.send({ type: 'joinRoom', code });
    expect((await guest.next('roomUpdate')).members).toHaveLength(2);
    guest.send({ type: 'relay', to: hw.id, data: 'hi' });
    expect(await host.next('relay')).toEqual({ type: 'relay', from: gw.id, data: 'hi' });
    host.ws.close();
    guest.ws.close();
  });
});
