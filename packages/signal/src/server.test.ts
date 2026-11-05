import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, ServerMessageSchema } from '@mudders/shared';
import { startServer, type SignalServer } from './server';

let srv: SignalServer;

beforeAll(async () => {
  srv = await startServer(0);
});
afterAll(async () => {
  await srv.close();
});

function exchange(payload: unknown) {
  return new Promise<unknown>((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${srv.port}/ws`);
    ws.onopen = () => ws.send(JSON.stringify(payload));
    ws.onmessage = (e) => {
      resolve(ServerMessageSchema.parse(JSON.parse(String(e.data))));
      ws.close();
    };
    ws.onerror = () => reject(new Error('socket error'));
  });
}

describe('signal server', () => {
  it('reports health', async () => {
    const res = await fetch(`http://localhost:${srv.port}/health`);
    expect(await res.json()).toEqual({ ok: true, protocolVersion: PROTOCOL_VERSION });
  });

  it('welcomes a client with a matching protocol version', async () => {
    const reply = await exchange({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
    expect(reply).toMatchObject({ type: 'welcome', ok: true });
  });

  it('refuses a mismatched protocol version', async () => {
    const reply = await exchange({ type: 'hello', protocolVersion: PROTOCOL_VERSION + 1 });
    expect(reply).toMatchObject({ type: 'welcome', ok: false, reason: 'update your game' });
  });
});
