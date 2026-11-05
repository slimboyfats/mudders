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

```sh

```

- [Requirements](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Conventions for coding agents](CLAUDE.md)
