import { serve, type ServerType } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { PROTOCOL_VERSION } from '@mudders/shared';
import { Lobby, type LobbyOptions } from './lobby';

export interface SignalServer {
  server: ServerType;
  port: number;
  lobby: Lobby;
  close: () => Promise<void>;
}

export function createApp(opts: Partial<LobbyOptions> = {}) {
  const app = new Hono();
  const lobby = new Lobby(opts);
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  app.use('*', cors());
  app.get('/health', (c) => c.json({ ok: true, protocolVersion: PROTOCOL_VERSION }));
  // §6.4: which path links ended up on, so the TURN decision is data-driven
  app.get('/stats', (c) =>
    c.json({
      rooms: lobby.roomCount,
      publicRooms: lobby.publicRooms().length,
      paths: lobby.stats(),
      relay: lobby.relayStats(),
      uptimeS: Math.round(process.uptime()),
    }),
  );

  app.get(
    '/ws',
    upgradeWebSocket((c) => {
      // behind Render's proxy the client address is in x-forwarded-for
      const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      let addr = fwd ?? '?';
      if (!fwd) {
        try {
          addr = getConnInfo(c).remote.address ?? '?';
        } catch {
          // not available in every runtime
        }
      }
      let handle: ReturnType<Lobby['connect']> | null = null;
      return {
        onOpen(_event, ws) {
          handle = lobby.connect(
            (msg) => {
              if (ws.readyState === 1) ws.send(JSON.stringify(msg));
            },
            () => ws.close(),
            addr,
          );
        },
        onMessage(event) {
          handle?.message(String(event.data));
        },
        onClose() {
          handle?.close();
          handle = null;
        },
      };
    }),
  );

  return { app, injectWebSocket, lobby };
}

export function startServer(port: number, opts: Partial<LobbyOptions> = {}): Promise<SignalServer> {
  const { app, injectWebSocket, lobby } = createApp(opts);
  const sweep = setInterval(() => lobby.sweep(), 5_000);
  sweep.unref();
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port }, (info) => {
      resolve({
        server,
        port: info.port,
        lobby,
        close: () =>
          new Promise<void>((done, fail) => {
            clearInterval(sweep);
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
    injectWebSocket(server);
  });
}
