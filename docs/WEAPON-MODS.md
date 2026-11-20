# Weapon mods

Idea §4.1 of `IMPROVEMENT-IDEAS.md`: a few add-ons that work on most shells, so a small number of
items multiplies the arsenal. Shipped in core@0.98.0, kernel 0.62.0.

## How they play

- A mod is `gear` with `deploy: "mod"`, bought in the shop like a shield (category "gear · weapon
  mod"). In a match its button sits with the other gear.
- Pressing it while aiming **fits** it (button lit, turn not used); pressing again takes it off, and
  another mod replaces it. Input is the existing `useGear`, so no protocol change.
- The next shell that **takes mods** uses one up. A weapon takes mods when its flight says
  `modable` (today only `flight.ballistic`), it goes off on the ground (`onSolid`), it has no
  `onApex`, `onCommand` or `onTimer` trigger, and its manifest does not say `"mods": false`.
  Firing a weapon that does not take mods leaves the mod fitted for later.
- Bots ignore mods for now: their aim cannot foresee a split or a bounce.

## The three mods

- `gear.mod-split` (Split): `split: 3, spread: 6`, three shells in a fan 6° apart.
- `gear.mod-bouncy` (Bouncy): `flight: { use: flight.ricochet, bounces: 3 }`; the ricochet flight's
  `contact` takes over the shell's hits, so it bounces off the ground three times and goes off on
  the next contact or at once on a tank.
- `gear.mod-fuse` (Fuse): a soft ricochet (`bounces: 8`, low restitution) plus `fuse: 240`. The
  ground never sets it off: once out of bounces or speed it rests where it is. It blows 4 s after
  firing, wherever it is; a tank sets it off at once. The renderer blinks a red pixel on it, faster
  in the last two seconds (`ProjectileView.fuse` = ticks left).

## Kernel

- `Tank.mod`: the fitted mod (index into `World.gear`) or -1; hashed only while fitted.
- `Projectile.mod`: set on shells fired with a mod (not on their children); hashed only when set.
- `World.fire`: uses the mod up, then fires `split` shells. `stepProjectiles` sends hits to the mod
  flight's `contact` (`modContact`), turns a `pulse` there into a plain bounce (`modBounce` event),
  and sets the shell off when `age` reaches `fuse`.
- Effects: `modFit` (fitted or taken off), `modFire`, `modBounce` (`hard` = speed, 0 to 9).

## Not done yet

- Heavy (ignores wind, digs deeper) and Carrier (releases your next weapon where it lands), §4.1.
- Bots fitting mods; the aim preview does not show a split or a bounce.
- 20 weapons say `"mods": false`: the summons and one-of-a-kind shells (Kaiju, Portal Pair,
  Telepathy, Decoy Tank, Repair Drone, black holes, Tornado, Volcano Seed, Earthquake, Flood, Dirt
  Tsunami) and the heaviest blasts (Supernova, Heavy Nuke, Ion Cannon, Orbital Lance, Singularity,
  Superstorm, Meteor Shower, Chain Reactor), which would be too much for a phone three at a time.
