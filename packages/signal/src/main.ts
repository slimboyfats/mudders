import { startServer } from './server';

const port = Number(process.env.PORT ?? 8787);
const { port: actual } = await startServer(port);
console.log(
  `signal server listening on http://localhost:${actual} (all interfaces; the client reaches it via /signal)`,
);
