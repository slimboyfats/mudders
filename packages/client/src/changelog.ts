/**
 * What shipped, newest first: the start screen's Changelog panel and the field manual's "What's
 * new" section both read this list. Add a new entry on top when a wave of PRs merges.
 *
 * `newSince` marks which weapons get a NEW badge in the shop and the weapon picker: every weapon
 * whose manifest `meta.since` is at or after it. Set it on the newest entry; older entries keep it
 * only as a record.
 */
export interface ChangelogEntry {
  /** ISO date the changes merged. */
  date: string;
  title: string;
  /** Content pack range shipped that day, e.g. "core@0.40.0 – 0.60.0". */
  pack?: string;
  newSince?: string;
  items: readonly string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: '2026-11-20',
    title: 'Things on the map that react: fuel tanks, water towers, power pylons, powder stores and dams',
    pack: 'core@0.100.0',
    items: [
      'Fuel tanks: a steel tank full of fuel on two concrete saddles. A hit holes the shell where it lands and the fuel pours out and runs downhill. The vapour under its roof goes off the moment a hole lets air in: one huge fireball that tears the tank open, throws burning fuel high into the air and flings two drums that burst like fireworks. The fuel left behind lights and keeps popping as it burns, in a river of fire. In the City, on the hills and sometimes on the Badlands',
      'Fuel barrels: a stack of three steel drums of fuel under pressure. Break one open and it bursts in a fireball and shoots up into the sky like a rocket, then blows apart at the top in a firework of burning stars and fuel that rains down and sets the ground alight. The blast opens the next drum, so the stack goes up one after another. In the City, on the Badlands, in the Village and on the hills',
      'Water towers: a steel tank of water high up on four legs. Hole the tank and the water jets out of the hole; knock the legs out and the tower comes down and dumps its load in a wave. In the Village, by the lakes, in the City and on the hills',
      'Power pylons: two steel lattice pylons with lines slung between them and a transformer box low on one leg. Break the box open, or bring that pylon down, and it shorts out in a blue-white flash, sending a charge through every pylon, line and puddle joined to it: a tank leaning on the steel or standing in charged water is shocked. Lightning on the steel shocks it as before. On the hills, in the City, by the lakes and on the Glacier',
      'Powder stores: a squat brick bunker stacked with kegs of blasting powder. Any blast, fire or heat that reaches the kegs lights them and they go off together in a burst of blasts that tears the bunker apart. In the Village and on the Badlands',
      'Dams (a map event, with map events on): on the hills, in the Village and in the City, a concrete dam may stand across the deepest valley clear of the tanks, holding back a lake of real water. Crack the wall below the water line and the lake bursts out through the hole and floods downhill',
    ],
  },
  {
    date: '2026-11-20',
    title:
      'Points draft, co-op waves, volley mode, weapon mods, cover counts, shells that care what they hit, wind with shape, tanks that show their damage, last-shot ghost, your-turn buzz, rule sets, weapon favourites and a tutorial',
    pack: 'core@0.98.0 – 0.99.0',
    items: [
      'Points draft (pick it at the top of the rules, locally and in the online lobby): before the round everyone takes turns picking from one random pool of weapons, ten each with two players, in snake order (1 2 2 1 1 2…). Then you fire exactly what you picked, one shot per weapon. Nobody is knocked out: a destroyed tank comes back with full health at the end of the turn and loses 50 points. Damage dealt scores, 50 per kill, self-damage counts against you, and most points wins. No shop, no crates, no sudden death. Bots draft too, and the strongest weapon left is picked for you if your pick timer runs out',
      'Co-op waves: every human is on one team against the AI players, wave after wave, with the shop in between. The first wave is Easy bots at 60% health; every wave after that the bots play a step better (Normal, Hard, Ace), have more health and bring a bigger war chest to the shop. Lose a wave and the match is over; hold them all to win. Made for two friends online against the bots',
      'Weapon mods, new in the shop under gear: bolt-on parts that change your next shell. Fit one with its button while aiming (it lights up and does not use your turn), press again to take it off. It is used up by the next shell that takes mods: shells that fly a plain arc and go off on the ground, such as the Missile, the Nuke, and the dirt shells. Rollers, diggers, MIRVs, beams and the like keep it fitted for later',
      'Split Mod: the shell leaves the barrel as three, in a fan 6° apart. Bouncy Mod: it bounces off the ground three times before it goes off, or at once on a tank. Fuse Mod: it skips along and settles instead of going off on the ground, with a red light blinking faster and faster, and blows four seconds after firing wherever it is; a tank still sets it off at once',
      'Bots do not use mods yet',
      'Volley (a new rules setting, Turns: One at a time or Volley, locally and in the online lobby): every tank aims during the same turn timer, and FIRE locks your shot in. Once everyone has locked in, or the timer runs out, all shells leave on the same tick and land together, so a round takes about as long as one lap of turns used to. The HUD shows Volley 2/3 and a ✓ in each chip that has locked in; tanks still aiming keep their marker. Bots plan without seeing anyone else’s shot. Each shell still scores for its own tank, and a volley counts as one turn for everyone (frost, glue and stains wear off for all, the turn cap counts volleys). A mind-linked tank sits the volley out',
      'Cover counts: solid ground between a blast and a tank now soaks up part of the damage and the shove. The thicker and heavier the cover, the more it stops: rock counts twice as much as dirt, snow less than half, water nothing. Behind enough of it a tank takes as little as a third of the hit, and COVER pops up over it. A tank that shows over the top of a wall is still hit in full, and big blasts tear through thin walls',
      'Shells care what they hit. A fast shell that comes in flat glances off rock, steel, concrete and ice in a shower of sparks, once, and comes down further on; a square hit goes off as before',
      'A fast, flat shot skips across water like a flat stone, up to twice, throwing up drops. A steep one still goes off on the surface',
      'Soft ground swallows shells: a shell digs into snow, ash, sand and mud before it goes off (deepest in snow), so the crater is deeper and, with cover, the blast is muffled. Bots know all three and plan their bank shots',
      'Wind has a shape now. It blows half as hard along the ground and half as hard again high up, so a flat shot barely drifts and a high lob is carried a long way. In the lee of a ridge or a wall the air is almost still until the shell climbs out of the wind shadow. When your tank stands in the lee, the wind readout says Lee. Bots aim with the same wind',
      'Tanks show their damage. At half health the plates are scorched and thin grey smoke rises from the engine. At a quarter the tank is crippled: a track breaks, so it drives half as far a turn, and the fuel tank is holed, so oil runs out beside it and drips behind it as it drives. Oil burns, and an oiled tank takes more from fire, so a crippled tank should keep away from flames and off its own trail',
      'Earth thrown up by a blast drifts downwind on its way back down',
      'Shut-in blasts: a shell that goes off in a tunnel, a small cave or the bottom of a shaft has nowhere to spread, so it reaches half as far again along whatever opening it has',
      'How to play (on the start screen): a one-minute guided match against a still target. A card walks you through the shop, aiming with the Angle and Power pills, the wind, firing, driving and knocking the target out, and moves on as you do each one. New players see it first on the start screen',
      'Last-shot ghost (a new rules setting, on by default, locally and in the online lobby): while you aim, the path of your previous shell shows as faint dots over the map with a cross where it came down, and the Angle and Power pills carry a pale mark at the values you fired with. Each player only sees their own',
      'Your turn: the phone gives a short buzz when your turn starts, when you fire and when you are hit (Android; switch it off in Settings). If the game is in the background when your turn comes, the tab title flashes, and with "Notify me when it\'s my turn" on in Settings you also get a notification',
      'Rule sets: one tap above the rules sets them all. Classic, Chaos (twists, deals, free weapons, crates, a new map each round), Sniper duel, Mud bath and Quick phone match. "Share these rules" copies a link that opens the setup screen with the same rules on another device',
      'Weapon list: tap the ☆ on a weapon to make it a favourite; favourites sit first in the list. "Back to …" at the top swaps back to the weapon you had before, and holding a weapon (or right-clicking it) opens a card with what it does',
    ],
  },
  {
    date: '2026-11-18',
    title: 'Training mode with a shot coach, weapon previews and search in the shop',
    items: [
      'Training (on the start screen): endless target practice on fresh small maps, with a coach after every shot. It says how far short or long the shell came down, how much the wind moved it, whether a hill in front stopped it and how far 50 power moves the landing at your angle, then what to try next: keep the angle and add or take off power, go steeper or flatter, or split the difference once you have the target bracketed. "Set it for me" dials in an aim that hits. Pick Calm, Steady or Shifting wind; New range draws another map',
      'Training: distances are counted in tank lengths, the Tank grid button lays a grid one tank apart over the map (numbered every 5 tanks out from you), and the flight paths of your last three shots stay on screen as dotted lines so you can aim the next one against them',
      'Shop search: type in the box above the filters to find weapons and gear by name, kind or what they do ("roll", "fire", "nuke"). Every word has to match, and names come first',
      'Shop time (a new rules setting, locally and in the online lobby): 30, 60, 90 or 120 s in the shop before round 1 and between rounds, 30 s by default. Bots still buy at once, and the shop closes as soon as every player has pressed Ready',
      'Weapon previews: the ▶ next to Buy plays a real shot of that weapon at a tank on a small map, over and over, with its description, damage, blast size and Buy button beside it. ◀ ▶ step through the weapons the shop is showing, and ❚❚ pauses it',
    ],
  },
  {
    date: '2026-11-16',
    title:
      'Smarter bots, bounty on the leader, talking bots, tides, changing weather, material flasks, acid, lightning through steel and tank stains',
    pack: 'core@0.93.0 – 0.97.0',
    items: [
      'Performance recorder: with Settings → Show performance on, the overlay has a Record button. Stop saves a small text file (and offers Copy and Share) with frame times, sim and draw times and what was on screen for every second, to send along when the game runs slow on a device',
      'A restless world no longer holds up the turn: once the shot itself is over (shells, blasts, falling tanks), the turn waits at most 4 s for whatever still moves, such as spray off a flood, a hillside that keeps sliding, rock still coming down or a fire. It carries on into the next turn, as running water already did. Before, a quake or a flood could hold a turn for 10 s and more',
      'Faster rain, snow and floods: rounds with water in them (rain puddles, tides, Rising water, Flood wave, Cloudburst) cost about half as much to simulate, and the particle engine no longer works on particles that have already died, which was most of its load in snow. Same picture, same results',
      'Zoom out further: pinch out (or press −) past the whole-map view to see the land around it, down to half the old size. Once tanks are small, each one gets a chip with its player number, bot name and life bar. A tank that is off the screen gets the chip pinned to the screen edge with an arrow pointing at it',
      'Lakeland tides (with map events on): the lakes rise and fall over the round. For a few turns they swell until they stand well above their old shores, flooding the low ground and any tank parked on it, then they ebb until their beds lie bare, and back again. A lake a crater has drained fills again at high tide',
      'New round twist, Changing weather: every few turns a front moves in and the sky changes between clear, rain and snow, with the new weather’s rules (rain drags shells short and puddles the hollows, snow settles on the ground). The HUD calls each front out',
      'Every AI seat now has a difficulty next to its personality, locally and in the online lobby: Easy, Normal, Hard or Ace. Normal plays exactly as before',
      'Easy bots aim with a human wobble, buy little and carry almost no gear. Hard bots halve their aim error, read the wind for their opening shot, switch to a tank they can actually hit when their favourite target is behind cover, avoid shots that would land on themselves or a teammate, and finish weak tanks with a cheap shell',
      'Ace bots aim with no deliberate error, re-solve every shot, try more weapons and targets and drive for even a small gain. In the shop, Hard and Ace bots plan their ammo for the round and spend on heavy shells instead of stacks of Baby Missiles, and Ace carries more shields, batteries and parachutes',
      'The bots have new names of their own: Bumbler (random shots), Brawler (aims straight at you), Trickshot (bank shots off the terrain), Lobber (high lobs) and Deadeye (near-perfect aim). They play exactly as before',
      'Bots talk: a speech bubble pops up over a bot tank and types itself out. Taunts when its turn starts, a shrug when it misses, a yelp when hit, relief after a close call, last words on the way out, a gloat after a kill, and a jeer when your shot misses everyone. Each bot has its own voice: the Bumbler is confused, the Deadeye cold, the Trickshot smooth. Both players see the same lines online. Switch it off in Settings',
      'Match awards: the match-over card now hands out awards, among them Best shot (most damage in one shot), Most dirt moved, Most kills, Longest kill, Sharp eye (best hit rate), Nine lives (most close calls survived), Punching bag and Own worst enemy',
      'Bounty and comeback (a new rules switch, on by default): from round 2 the player in the lead carries a bounty, shown as a gold $ over their tank and in their score chip. Every hit on them pays double cash and destroying them pays a big bonus, and the round banner says what they are worth. At every round end each player behind the leader also gets a fifth of the points gap as cash, so a bad round is easier to come back from. The scoreboard shows the bounty and comeback cash each player earned',
      'Solo challenges, new chapter Wild world: the map fights back. Shaky ground (a quake every turn moves the targets), Live wire (one Lightning bolt into the lake shocks every tank in it), Mudslide (cloudbursts wash the slopes down), Flood wave (live through four turns while waves roll in), Fault lines (beat the Trickshot while the ground splits) and Thunder lake (survive a lightning storm on a tiny island)',
      'Material flasks: five cheap glass flasks, two to a pack, that smash with a tinkle and let out their payload and nothing else. Water Flask (a pool of water), Oil Flask (a small oil slick), Mud Flask (a heap of soft mud), Sand Flask (a little heap of sand) and Acid Flask. Each does little alone; the fun is the next shot: oil, then fire',
      'Acid: a new glowing green liquid that runs like water and slowly eats soft ground (dirt, sand, mud, clay, snow, wood and leaves) into a fizz of pale green fumes, using itself up as it goes. Rock, metal and glass shrug it off, heat boils it away, and a tank sitting in it loses a little health at the end of every turn',
      'Steel conducts electricity: office towers now have a steel frame up their corners to the roof beam and the mast, and steel girders lie about in the City, on the Badlands and by the lakes. A Lightning shot, a storm or Superstorm bolt, an Ion Cannon strike or a Shield Breaker pulse that lands on the metal charges all of the steel joined to it, and every tank touching it is shocked. Steel carries the charge three times as far as water (480 cells against 160), and single-cell sparks crawl along the charged metal and water',
      "Tanks get stained by what they touch, for a turn or two. Wet (water, mud): can't catch fire, water puts a burning tank out, and shocks hit half again as hard, so lightning into the lake you're parked in hurts. Oiled (oil, tar, napalm): fire hits half again as hard and a burn lasts a turn longer. Muddy (mud, runny mud): driving burns half again as much fuel. Burning (fire, flames, burning oil): the tank loses health at the end of each of its turns and sets fire around its tracks. Small badges on the player bar and a tint on the tank show each stain",
    ],
  },
  {
    date: '2026-11-15',
    title: 'A world that wears away, shocking water and more spectacle',
    pack: 'core@0.90.0 – 0.92.0',
    items: [
      'Faster turns: water that is only still running (rain, a pool filling, a lake draining) no longer holds up the turn, it just keeps flowing into the next one. The longest a turn waits on sliding ground is now 4 s instead of 8 s',
      'Lighter weather on phones: plain rain wets the ground with fewer puddles, and the Cloudburst, Earthquake and Flood wave twists each keep their busy area small instead of working over the whole map every frame',
      'Solo challenges: two more chapters, 25 challenges in all. Trick shots: a target across a big map, three around the lakes, Rollers on the glacier, flat shots under a cave roof and a strong tailwind. Survival: live through a set number of turns against a Trickshot and a Brawler, under a meteor shower, while the water rises, and against a Deadeye with only a Heavy Shield to hide behind. Bots in a challenge now all side against you',
      'New round twist, Earthquakes: every turn starts with a quake that shakes the ground for a few seconds around its epicentre, a different spot each time. Steep slopes shake loose and slide down into the valleys, and every quake opens a sinkhole somewhere that swallows the ground for good, so the land wears away over the round',
      'New round twist, Cloudburst: every turn starts with a storm over one stretch of the map. Its run-off gathers as real water in the lowest dip under it, and it shakes the steep slopes there loose so they slump into the valleys. The pool soaks away again after the storm',
      'New round twist, Flood wave: every other turn a wave of real water surges in from one edge of the map, rolls inland over the ground (pushing tanks along), climbs what slopes it can and pours into the valleys. The lakes it leaves soak away before the next wave',
      'New round twist, Fault lines: about every other turn the ground splits open somewhere: fissures crack out, the ground between them drops into a rift valley, the slabs beside it tilt and magma glows in the deepest cracks',
      'Mud flows with real momentum now, like water and lava: Quicksand and other runny mud pours down a slope with speed, runs out over the flat at the bottom and carries tanks down with it faster',
      'Water conducts electricity: a Lightning shot, a storm bolt or a Superstorm bolt that strikes in or beside a lake (or runny mud) charges all the water joined to it, and every tank standing in that water is shocked, however far from the strike',
      'Solo challenges, two new chapters. Tools of the trade: puzzles where the kit is the trick, such as Rollers into a valley, one Napalm for two targets, a Bunker Buster past the towers, Heat Seekers among floating islands and Skippers past the peaks. Gauntlet: two Lobbers at once, the Brawler in a gale, the Trickshot on a meteor night and a last stand against the Deadeye',
      'Solo challenges: a new ladder on the start screen with set pieces on fixed maps. Each gives you a set kit and a goal and scores one to three stars. Range: knock out still targets, lob over a mesa, beat a headwind and shoot under low gravity. Duels: beat a Bumbler bot, then a Brawler while you start hurt. Each challenge opens when you clear the one before it',
      'Blasts on the ground drive a low wall of dust out along the surface both ways. It follows the slopes, flicks up grit as it passes and stops at a cliff',
      'Steam: a blast in or beside water keeps boiling it into white steam for a second or two after the fireball clears, and burning shells (napalm, meteors, fire globs) hiss out a gout of steam where they plunge in',
      'Tanks flinch: a blast close to a tank rocks it away and bounces it off its tracks, shaking dust out from under them. The nearer and bigger the blast, the harder the tank is rocked',
      'Napalm floats: in a lake it spreads as a burning film on top of the water instead of sinking, boils steam off it and burns out sooner there. Water itself never burns',
      'Firing kick: every shot throws a tongue of fire out of the barrel and the barrel slams back and eases out again. Big guns vent jets out to the sides, rock the tank, jolt the screen and blow a sheet of dust and clods off the ground around the tank. A Missile gives a small pop, a nuke the full kick',
    ],
  },
  {
    date: '2026-11-14',
    title: 'New explosion designs and shells that look alive in the air',
    items: [
      'Clouds answer back: a shell that flies through a cloud punches a tunnel through it that slowly fills back in and throws puffs of cloud out either side, and a blast close to a cloud blows a ragged hole in it and flings the puffs away',
      'Shells fly with their own look by weapon type. Missiles point along their flight with a flickering exhaust flame and a short pixel smoke trail. Nukes, MIRV, Daisy Cutter and the other big bombs are fat finned casings with a hazard band and a blinking light, pouring dark smoke. Guided shells blink a green eye and their exhaust weaves from side to side. What a missile or bomb drops tumbles end over end, shedding embers',
      'Napalm and the other fire weapons fly as a sloshing flask that drips fire; lasers and beams as a crackling energy ball; diggers as a turning drill bit spitting sparks; dirt weapons as a tumbling clod shedding crumbs; rollers as a rolling steel ball; terrain weapons with two motes orbiting them in a twisted trail; weird weapons as an orb that changes colour; mines with a blinking red light and the Repair Drone with a green cross',
      'More explosion designs. Implosion (Concussion Shell, Tandem Charge, Gravity Well, Rogue Black Hole, Glue Bomb, Telepathy): fire and sparks are sucked in to the point, then it goes off hard',
      'Rolling fireball (Incendiary, Napalm, Hot Napalm, Meteor): a ball of fire rolls off along the ground the way the shell was going, leaving a burning trail, and stops at a wall',
      'Canopy (Airburst, V3 spent stage, Magma Bomb, Fuel-Air cloud): sparks thrown high and wide that droop over and rain down',
      'Shrapnel (Buzzsaw, Frag shards, Tectonic Charge, Cloud Whale slam): long white-hot streaks flung out every way from a dark puff of smoke',
      'Fire carpet (Riot charges, gas pocket bursts, Quicksand): flames run out along the ground both ways and burn down behind',
      'Diggers and dirt weapons now throw dirty blasts, storm weapons flash white, gas weapons burn green and frost weapons ice blue, so almost every weapon has its own look',
      'Explosions depend on how the shell lands: Missile, Baby Missile, Heat Seeker, Skipper, MIRV warheads, scatter bomblets and the rest of the plain shells throw a flat tongue of fire on a glancing hit, a tall pillar on a steep one, a fireball in between, a dirty blast when they go off buried and a white flash when they burst in the air',
      'Explosions no longer all look alike. Bunker Buster, Tandem Charge, Boomerang and Magma Lance blow a flat tongue of fire downrange the way the shell was going, with one big roll of fire at its tip',
      'Drill Torpedo, Tunnel Rat, Magnet Mine and the Orbital Lance punch a pillar of fire straight up out of the ground that rains sparks back down',
      "Rollers, Anvil, Earthquake, Fault Line, Dirt Bomb and Daisy Cutter make dirty blasts: little fire, a cloud of the ground's own dust and a column of clods",
      'Lasers, Railgun, Hornet and storm bolts go off in a white flash: a star of hard rays and strobing sparkles, no fire and almost no smoke',
      'Frag Shell, Scatter Bomb, Grim Crown and Tripwire Net blow up, then rattle with a long string of small pops all round the blast',
      'Chemical flames: acid weapons and Chain Reactor burn green, Ice Wall and Hailstone ice blue, Plasma Blast, Ricochet Ball and the Superstorm violet',
    ],
  },
  {
    date: '2026-11-13',
    title:
      'Map shuffle, round twists, wilder map shapes, shop deals, random arsenal and lightning storms',
    newSince: 'core@0.75.0',
    items: [
      'New scenery choice, Shuffle: every round is played on a different map (Village, Caves, Lakeland and the rest), each one once before any comes back, and the HUD says where each round is',
      'Random weather now rolls again every round, so a sunny round can be followed by rain or snow',
      'Wilder maps: about two maps in three now have one big landform on top of their hills, so the same map plays differently each time: twin peaks, a mesa, a deep valley, a flat open plain with nowhere to hide, or a cliff wall (Bare hills stays as it was)',
      'New round twist, Lightning storm: the round turns to rain and two or three bolts strike every turn, the first one on whichever tank sits highest, the rest on the tallest peaks, so high ground is no longer safe',
      'Random arsenal (a new rules switch): at the start of every round each tank gets the same four random weapons for free, so everyone has to play with something new, and the round banner says what they are',
      'Shop deals (a new rules switch): every shop puts four weapons at half price and sells two out, different each round, so you have to shop around',
      'Round twists (a new rules switch): about every other round one rule changes for that round only, and a badge by the round number shows it. Low gravity: shells fly twice as far and float. Gale: the wind blows two and a half times as hard. Double damage: every hit hurts twice as much. Gold rush: the round pays three times the cash. Meteor night: a few burning meteors streak down at the start of every turn, one of them close to a tank. Rising water: the valleys flood a few rows higher every turn, and a tank caught under the surface loses health',
    ],
  },
  {
    date: '2026-11-12',
    title:
      'DROP! weapons, a tidier shop, blasts that throw the ground, ground and rock that fall with weight, and water with momentum',
    pack: 'core@0.76.0 – 0.82.0',
    newSince: 'core@0.75.0',
    items: [
      'Falling ground hurts. A tank under a mass of dirt, sand or rubble that comes down from a height, or under a slab of rock or wall, takes damage by how heavy it is and how fast it lands. Snow is light, a short drop or a sprinkle of thrown earth only buries, and the player who brought it down gets the credit',
      'Maps have their own events: on Badlands a cinder cone full of lava stands on a hilltop, rumbles a turn before it blows, then erupts and rains real lava down the slopes. On Glacier the snow and ice on the steepest slope break loose every few turns and slide down as an avalanche that hurts tanks in its way. The HUD calls them out',
      'Rock and walls now come down in pieces. A stalactite shot loose, the tip of a rock ledge, the top of a tower or a rock shelf that hangs too far breaks off as solid slabs that fall, turn in the air and are thrown clear of the blast, and stay lying as blocks of rock or wall where they land; only the small bits crumble. A rock ledge shot thin at the neck snaps off under its own weight',
      'Bare rock, ice and concrete that lose their footing fall as boulders that tip over the point they land on, roll a little and lie where they come to rest, at an angle',
      'Lava, oil, napalm and plasma have weight too. Lava is thick: it creeps downhill as a front, coats the slope and stops as a mound instead of spreading flat like water. Oil pours heavy and smooth, napalm clings. Turns with lava end much sooner',
      'Water now has momentum. A lake that is blasted open pours out with its whole depth, the wave runs to the far bank, climbs it, sloshes back and dies down, and the lake ends up level',
      'Water that runs over an edge falls as a waterfall in an arc and feeds the pool below. Water running down a hill keeps its speed, shoots off ledges and runs a little way up the other side',
      'A lake holed below the waterline jets out under pressure, faster the deeper the hole',
      'A turn no longer waits for the last small ripples on a lake to die down',
      'Day and night: every round is played a little later in the day, from dawn to daylight, sunset and night, and back round again (Settings can switch it off; Pitch Black stays dark)',
      'Crows: a while after a tank dies, two or three crows flap in and perch on the wreck, pecking. A blast or a shell scares them off, and they come back later',
      'The world is alive: rabbits graze and hop on the hills and run from shells, blasts and tanks, diving into burrows and popping out later. Fish swim in the lakes and leap out with a splash, and float up belly-up after a blast in the water',
      'Falling ground keeps its speed. Dirt, sand, snow or rubble that drops from a height no longer lands as the stiff block it fell as: it hits hard, bursts outward into a heap, and grains spray up from the edges',
      'Slides gather speed on a steep slope and run out over level ground before friction stops them, and a grain that runs off a ledge flies on in an arc',
      'Cave-ins come to rest sooner: the roof over a Tunnel Rat blast drops in and settles in about three quarters of the time',
      'Hits now show: the damage floats up over the tank that took it (green for repairs), and big moments pop up over the tank in pixel letters: DIRECT HIT, CLOSE CALL, OWN GOAL, KILL, SNIPED for a long-range kill, and DOUBLE or TRIPLE KILL when one shot takes out more than one tank',
      'Smoother on phones: the picture quality now steps down by itself when frames run long, and tries to step back up once things are smooth (Settings has a switch for it). On low quality a phone also draws fewer, harder pixels',
      'Explosions now throw part of the dirt, sand, snow, rubble, clay and ash they dig out: it flies up and out in a curtain on each side of the crater, rains back down and stays',
      'Craters get a raised lip and a thin blanket of loose earth around them, which slumps like any loose ground. A tank beside a blast gets dusted',
      'Grains that land while moving sideways skid on the way they were heading before they stop',
      'New: some shells have a second press. After firing, the FIRE button turns into a flashing DROP! (or press Space/Enter) and the shell does its trick right where it is',
      'New weapon: Anvil, stops dead in the air and drops straight down like a stone',
      'New weapon: Split Now, a MIRV that splits into five warheads the moment you press',
      'New weapon: Afterburner, lights a rocket in mid-air and blasts off twice as fast',
      'New weapon: Boomerang, a spinning blade that turns round and flies back when you press',
      'New weapon: Storm Seed, bursts into a thundercloud right there that cracks lightning down for three turns',
      'New weapon: Blink, your own tank jumps to the ground under the shell when you press',
      'New weapon: Flock Call, six black birds burst out of the shell and dive-bomb the nearest enemies',
      'Cloud Whale now condenses out of a swirl of vapour and swells to full size before it drops',
      'Crystal Bloom spires are about twice as thick',
      'New weapon: Airburst, press DROP! and it bursts in mid-air in a wide ring of shrapnel, hitting tanks behind walls and in trenches from above',
      'New weapon: Anvil Rain, press DROP! and five anvils fall in a fan',
      'New weapon: Tunnel Rat, a digging charge that bores on until you press DROP!, then blows up right there under the ground',
      'New weapon: Magma Lance, a straight beam of molten rock that burns through a tank and leaves a pool of real lava',
      'New weapon: Hailstorm, a black hail cloud gathers where it lands and pounds the ground under it with fists of ice for three turns',
      'Shop clean-up: weapons that did almost nothing or doubled up on another one are gone from the shop: Tracer, Resonator, Oil Slick, Baby Digger, Dirt Clod, Dirt Charge, Cryo Shell, Burrower (Tunnel Rat does it better), Riot Blast, Terraformer (Ice Wall), Ton of Dirt (Dirt Bomb), Thunderstorm (Storm Seed), Teleport Shell (Blink), Plague (Toxic Gas), Smart Bomb (Heat Seeker), Concussion Shell (Airburst) and Skipper (Ricochet Ball)',
      'Real damage now: Incendiary about 50 on a direct hit (was 19), Tectonic Charge 65, Implosion 60, Quicksand 35, Glue Bomb 40',
      'You start each match with an Ice Wall instead of a Terraformer, and supply crates hold Blink instead of Teleport Shell',
    ],
  },
  {
    date: '2026-11-11',
    title:
      'Real damage for less money, weapons that really hurt, supply drops, big money matches and weird weapons',
    pack: 'core@0.72.0 – 0.75.0',
    newSince: 'core@0.73.0',
    items: [
      'New weapon: Upfall, gravity flips in a tall column. Ground, water, trees and tanks fall into the sky, hang there churning, then everything crashes back down at once',
      'New weapon: Crystal Bloom, a fan of huge violet crystal spires bursts out of the ground, skewers any tank in the way and lifts it on a tip. The spires stay: lasers bounce off them and blasts shatter them',
      'New weapon: Cloud Whale, fire it and press FIRE again (DROP!) while it flies: a whale made of storm cloud pops out of the shell, free-falls nose first, craters whatever is below and bursts into a flood that puts out fires',
      'New weapon: Frag Shell, a sharp bang that bursts into white-hot shrapnel, so a near miss still hurts',
      'New weapon: Hornet Swarm, pops at the top of its arc into five darts that each hunt the nearest enemy',
      'New weapon: Concussion Shell, a small crater but a wide pressure blast that hits tanks twenty or thirty cells away',
      'New weapon: Tandem Charge, a first charge knocks shields flat and cracks the ground, the main charge goes off in the hole',
      'New weapon: Buzzsaw, lands and saws along the ground the way it was fired, cutting through small hills, and bites into the tank it meets',
      'Harder hitting for their price: Smart Bomb, Laser, Roller, Heat Seeker (now cheaper too), Lightning, Drill Torpedo, Railgun and Heavy Laser all do clearly more than a plain Missile now',
      'Supply drops: every few turns a wooden crate parachutes in somewhere away from the tank whose turn it is, with a weapon, gear, health, fuel or cash inside. Its badge shows which kind',
      'Any tank that touches a crate takes it: drive to it, fall onto it, or use Teleport Shell, Swap Ray or Portal Pair to get there first',
      'Crates are real objects: they swing under the canopy and drift with the wind, tip over edges and tumble down slopes, float on water and burn in fire',
      'Blasts throw crates about and a close one smashes them to splinters; a shell through the canopy drops the crate like a stone, so you can deny one to your enemy',
      'Bots drive to a crate when one lies within reach',
      'New Rules option: Supply drops Off, Rare, Normal or Often (Normal by default, works online too)',
      'Rules: start with up to 100,000 cash',
      'Rules: new "Cash per round" picker gives every player +5,000 to +50,000 after each round, on top of what they won',
      'Shockwaves throw tanks much farther and higher, hurl more dirt and blow trees and buildings apart harder. A tank thrown into a hillside takes a slam hit, harder the faster it flew',
      'Falls hurt twice as much: a tank that drops or is thrown without a parachute takes 2 damage per cell it falls past the first four. Parachutes still land you unhurt',
      'Napalm and fire keep burning: a tank sitting in burning jelly or flames takes damage the whole time it burns, not just once at the end of the turn. Napalm now does about 60 on a direct hit instead of 15, Hot Napalm about 80',
      'Acid Cloud eats 12 health a turn (was 4), Toxic Gas 16 (was 8) and Plague 14 (was 7)',
    ],
  },
  {
    date: '2026-11-10',
    title: 'Living chemistry and glow in the dark',
    pack: 'core@0.61.0 – 0.71.0',
    newSince: 'core@0.62.0',
    items: [
      'Real gas in the world: steam, flames, marsh gas and gas flares rise, drift with the wind and bubble up through water',
      'Burning ground throws flames up that light anything that burns; water on fire or lava boils off as steam',
      'Burst gas pockets leave marsh gas hanging over the hole, and any flame sets the cloud off in a chain of flares',
      'New weapon: Bog Flask, a cloud of marsh gas waiting for a spark',
      'Materials now react by kind (anything hot, anything that burns), so new materials join in by themselves',
      'Falling sand, dirt and liquids keep their own grain colour as they tumble and pour',
      'Glowing things light the ground and air in their own colour: plasma violet, crystal lilac, reactor cores green, lava and fire orange',
      'New Pitch Black theme in Settings: no light but what burns, glows or explodes. Try it on the Caves map',
      'Water stays now: it pours, spreads and levels out into lakes instead of soaking away, and turns dirt to mud',
      'New map: Lakeland, rolling hills with lakes in the hollows. Boil them with lava or drain them with a crater',
      'Shells that hit water throw it up in a tall crown of real drops that rain back down, run off the banks and pour into craters, and send waves rolling out across the lake',
      'Blast pressure blows the leaves off trees well beyond the crater: trunk and branches stay standing while the leaves flutter away on the wind. Shockwaves reach furthest, and a hill shelters the trees behind it',
      'Trees come alive in the wind: trunks lean downwind, crowns rock as gusts roll across the map and leaves flicker, harder the stronger it blows',
      'Six new kinds of tree: pine, birch, poplar, willow, autumn maple and bush. The Village gets a mixed wood, Lakeland willows by the water, the Glacier pines',
      'Trees snap and fall: a hard hit breaks a tree at the trunk, and it tips over in one piece away from the blast, faster as it goes, crashing down as a log beside its stump in a burst of dust. A direct hit still blows it to splinters',
      'Blasts set trees on fire: the heat of an explosion lights the crowns nearest to it, pine needles and dry autumn leaves most readily, and the fire eats down the tree. Fire blasts light them twice as readily',
      "Swallows: little flocks wheel over every map and ride the wind. A shell that flies into one goes off right there in the sky, shots make them scatter, and a blast's pressure front bursts any it reaches into black pixels",
      'Explosions are no longer a disc: a white-hot fireball of single pixels bursts out, then the air rolls it up into a head that curls over and a swirl of fire sweeping out along the ground each side, bigger on the side the shell was heading. Smoke, sparks, embers, dust and leaves are carried round by the same air',
      'Gas clouds are made of single pixels: toxic gas bursts out, billows, then sinks and pours downhill cell by cell instead of sliding along as one solid blob',
      'Blasts throw real dirt: the ground dug out of a crater sprays from its edge as single grains in the colour of that ground, most landing close and a few flying far, more of it the way the shell was heading',
      'The edge walls are alive: the whole wall churns like a dark liquid with its face rolling in waves, and a shell flying into it is swallowed instead of going off. It splashes, throws a jet back out, sends rings across the whole wall and sinks in, cooling as it goes. The sudden-death wall swallows shells where it stands too',
      'Fire lights its surroundings: while a fireball burns, the smoke and flying dirt around it glow warm and the crater edge stays lit, dimming in steps as the fire dies',
      'Craters slump: a blast shakes the ground around and above its crater loose, and it slides down into an open bowl instead of standing as a sheer cut. Sliding sand drags dirt along and mixes with it, the turf travels with the ground it grew on, and tunnels, laser cuts and dirt pillars keep their walls',
      'Blast smoke clears sooner, thinning out pixel by pixel',
    ],
  },
  {
    date: '2026-11-09',
    title: 'The big weapon wave',
    pack: 'core@0.40.0 – 0.60.0',
    newSince: 'core@0.44.0',
    items: [
      '25 new weapons: Kaiju, Plasma Orb, Teleport Shell, V3 Rocket, Railgun, Swap Ray, Portal Pair, Chain Reactor, Shield Breaker EMP, Plasma Cannon, Gravity Well, Supernova, Rogue Black Hole, Fuel-Air Bomb, Telepathy, Daisy Cutter, Spotter Flare, Earth Bridge, Bunker Buster, Repair Drone, Decoy Tank, Caltrop Field, Tripwire Net and Acid Cloud',
      'Kaiju: summon a monster out of the ground that grabs and throws tanks and catches shells',
      'Shockwaves now throw tanks and blow buildings apart, with a wobbling plasma ring',
      'Rules: pick the turn sudden death starts from (off, 3, 5, 8 or 10)',
      'Weapon damage balanced to blast size and price',
      'Houses and trees tear or tip when undermined; rock and ice overhangs break by span',
      'Liquid surface with waves on water, lava and tar; smoke flows through the fluid everywhere',
      'Field manual: player docs for every weapon, object, material, tank and gear',
      'Online: rejoin a match after a long absence',
    ],
  },
  {
    date: '2026-11-08',
    title: 'Storms, particles and the death wall',
    pack: 'core@0.37.0 – 0.39.0',
    items: [
      'New weapons: Ion Cannon, Thunderstorm and Superstorm',
      'GPU particle engine: single-pixel particles, swirl and stepped colour fades',
      'GPU smoke and gas that flow around the terrain',
      'Alive pass: rain, snow, lightning, boiling clouds, gusting fire and blast sparks',
      'A creeping wall of darkness past the map edges, and a burning sudden-death zone',
      'A 50,000 starting cash option',
    ],
  },
  {
    date: '2026-11-07',
    title: 'Effects and a touch-first UI',
    items: [
      'New HUD: drag the angle and power pills, pop-up weapon picker, menu sheet',
      'Shop redesign, new title screen and menus; landscape phone layouts',
      'Full screen on phones, smooth pinch zoom and a free touch camera',
      'Nuke sky flash, debris chunks, heat haze, smoke columns and dynamic lighting',
      'Tank death sequence, screen shake, hit-stop and a slow-mo finisher',
      'Coloured shell trails, water splashes and ripples',
      'Temperature that affects fuel and fire, with snow and sand storms',
    ],
  },
  {
    date: '2026-11-06',
    title: 'Big weapons, maps and driving',
    pack: 'core@0.12.0 – 0.34.0',
    items: [
      'Spectacular nukes, MIRV, Napalm, Lightning, Heavy Shockwave, Singularity and Magma Bomb',
      'New weapons: Fault Line, Toxic Gas, Mud Geyser, Frost Bomb, Ricochet Ball, Dirt Bomb, Tornado, Orbital Lance, Dirt Tsunami, Sinkhole, Magnet Mine, Black Hole Mine, Bumper, Drill Torpedo, Cluster Fireworks, Volcano Seed, Glue Bomb and Ice Wall',
      'Six tank types, driving with fuel, shields, parachutes and batteries',
      'Maps: Marsh, City, Floating islands, Caves, Glacier and Clay pits',
      'Materials: mud, ice, clay, crystal, gas pockets, tar, moss, gunpowder seams and magma',
      'Rain, snow and gusty wind',
      'Up to 8 players, team play and longer matches',
      'Hosted on GitHub Pages, with online play through the lobby server',
    ],
  },
  {
    date: '2026-11-05',
    title: 'First playable',
    items: [
      'Fully destructible terrain on a deterministic simulation',
      'Hot-seat matches with a shop, scoring, sudden death and AI players',
      'Online play over WebRTC with a relay fallback, public games and AI takeover',
      '53 weapons, effects, themes and chiptune audio',
      'Installable app that works offline',
    ],
  },
];

const parse = (since: string): number[] =>
  (since.split('@')[1] ?? since).split('.').map((n) => Number(n) || 0);

/** Orders two `pack@x.y.z` versions; negative when `a` is older. */
export function compareSince(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The version weapons must be at or after to count as new: the newest entry's `newSince`. */
export const NEW_SINCE: string | undefined = CHANGELOG.find((e) => e.newSince)?.newSince;

export function isNew(since: string | undefined): boolean {
  return since !== undefined && NEW_SINCE !== undefined && compareSince(since, NEW_SINCE) >= 0;
}

const SEEN_KEY = 'mudders.changelogSeen';

/** True until the player opens the changelog after a new entry lands (per device). */
export function hasUnseen(): boolean {
  const latest = CHANGELOG[0]?.date;
  if (!latest) return false;
  try {
    return localStorage.getItem(SEEN_KEY) !== latest;
  } catch {
    return false;
  }
}

export function markSeen(): void {
  const latest = CHANGELOG[0]?.date;
  if (!latest) return;
  try {
    localStorage.setItem(SEEN_KEY, latest);
  } catch {
    // storage blocked: the dot just stays
  }
}
