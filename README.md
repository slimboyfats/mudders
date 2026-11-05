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
```

- [Requirements](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Conventions for coding agents](CLAUDE.md)
