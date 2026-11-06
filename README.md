# Mudders

_Set the mud on fire._

A browser-based, turn-based artillery game on fully destructible terrain, playable on a phone. An
original spiritual successor to the classic DOS artillery games.

```sh
pnpm install
pnpm dev      # client on http://localhost:5173, lobby server on :8787
pnpm check    # lint, format, typecheck, tests
pnpm verify   # check + build + smoke; run before every push (no CI on GitHub)
pnpm smoke    # headless WebGL2 + ffmpeg proof, writes captures/smoke-webgl2.{png,gif}
pnpm capture weapon-showcase weapon.shockwave   # render a weapon to MP4 + sheet, headless
```

Open `http://localhost:5173` for a local hot-seat match (drag on the map to aim, FIRE to shoot;
arrows/space on desktop, wheel or pinch to zoom). `#sandbox` opens the content sandbox: fire any
weapon at a test map and edit manifests live.

## Play on the same Wi-Fi

1. On the computer: `pnpm install`, then `pnpm dev`. Leave it running. Vite prints a `Network:`
   line such as `http://192.168.1.20:5173/`.
2. On the computer, open `http://localhost:5173` and choose **Host online game**. The invite link it
   shows already uses the computer's network address.
3. On the phone (same Wi-Fi), open that invite link, or the `Network:` address, choose **Join online game** and type the room
   code. Add AI players in any open seat from the host's lobby, then press **Start**.

If the phone can't load the page, allow Node through the computer's firewall for private networks
(Windows and macOS ask the first time). Guest Wi-Fi with "client isolation" blocks devices from
seeing each other; use the main network. The lobby server is reached through the page's own address
at `/signal`, so only port 5173 has to be reachable. `pnpm build` then
`pnpm --filter @mudders/client preview` (port 4173) does the same with the built game; keep
`pnpm --filter @mudders/signal dev` running beside it.

```sh

```

## Publish to GitHub Pages

`pnpm deploy:pages` builds the client for `https://slimboyfats.github.io/mudders/` and pushes the
files to the `gh-pages` branch. Nothing builds on GitHub: Pages only copies the files (the repo is
public, so this is free). One-time setup: repo **Settings → Pages → Build and deployment → Deploy
from a branch → `gh-pages` / `(root)`**.

Without a lobby server the site still plays local hot-seat games, bots, the sandbox and **Direct
game (no server)**, and works offline once loaded. For lobbies, public games and room codes, connect
the Render blueprint (`render.yaml`) and deploy with
`VITE_SIGNAL_URL=https://<service>.onrender.com pnpm deploy:pages`.

- [Requirements](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Conventions for coding agents](CLAUDE.md)
