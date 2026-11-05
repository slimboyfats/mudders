import { serve, type ServerType } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ClientMessageSchema, PROTOCOL_VERSION, type ServerMessage } from '@mudders/shared';

export interface SignalServer {
  server: ServerType;
  port: number;
  close: () => Promise<void>;
}

export function createApp() {
  const app = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  app.use('*', cors());
  app.get('/health', (c) => c.json({ ok: true, protocolVersion: PROTOCOL_VERSION }));

  app.get(
    '/ws',
    upgradeWebSocket(() => ({
      onMessage(event, ws) {
        const send = (msg: ServerMessage) => ws.send(JSON.stringify(msg));
        let raw: unknown;
        try {
          raw = JSON.parse(String(event.data));
        } catch {
          send({
            type: 'welcome',
            protocolVersion: PROTOCOL_VERSION,
            ok: false,
            reason: 'bad json',
          });
          return;
        }
        const parsed = ClientMessageSchema.safeParse(raw);
        if (!parsed.success) {
          send({
            type: 'welcome',
            protocolVersion: PROTOCOL_VERSION,
            ok: false,
            reason: 'bad message',
          });
          return;
        }
        const msg = parsed.data;
        if (msg.protocolVersion !== PROTOCOL_VERSION) {
          send({
            type: 'welcome',
            protocolVersion: PROTOCOL_VERSION,
            ok: false,
            reason: 'update your game',
          });
          return;
        }
        send({ type: 'welcome', protocolVersion: PROTOCOL_VERSION, ok: true });
      },
    })),
  );

  return { app, injectWebSocket };
}

export function startServer(port: number): Promise<SignalServer> {
  const { app, injectWebSocket } = createApp();
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port }, (info) => {
      resolve({
        server,
        port: info.port,
        close: () =>
          new Promise<void>((done, fail) => server.close((err) => (err ? fail(err) : done()))),
      });
    });
    injectWebSocket(server);
  });
}
