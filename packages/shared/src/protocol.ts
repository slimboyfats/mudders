import { z } from 'zod';
import { MAP_SIZES } from './constants';
import { ContentIdSchema, WindTypeSchema } from './content/manifests';
import { InputSchema, TimedInputSchema } from './input';

/**
 * Version of the lobby/signalling and peer protocol. Bump on any breaking change to a message
 * shape; peers and the signalling server refuse a mismatched version (§2c.4).
 */
export const PROTOCOL_VERSION = 12;

/** Private room codes (§6.5): 6 characters from an alphabet without look-alikes (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RoomCodeSchema = z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);

/** Ids the signalling server hands out; secrets let a dropped socket reclaim its id (§6.1). */
const IdSchema = z.string().min(4).max(40);
const SdpSchema = z.string().max(20_000);
/** Largest relayed payload; bigger peer messages are split by the link layer. */
export const RELAY_MAX = 32_000;

/** How a peer link ended up connected (§6.4: logged so the TURN decision is data-driven). */
export const LinkPathSchema = z.enum(['p2p', 'relay', 'local']);
export type LinkPath = z.infer<typeof LinkPathSchema>;

// ── signalling: client → server ─────────────────────────────────────────────────────────────

/** First message on a new socket. `id` + `secret` reclaim an identity after a dropped socket. */
export const HelloSchema = z.object({
  type: z.literal('hello'),
  protocolVersion: z.number().int().nonnegative(),
  id: IdSchema.optional(),
  secret: IdSchema.optional(),
});

export const CreateRoomSchema = z.object({
  type: z.literal('createRoom'),
  name: z.string().min(1).max(32),
  public: z.boolean(),
  maxPlayers: z.number().int().min(2).max(8),
  /** One-line settings summary for the public list ("Medium · 3 rounds · village"). */
  summary: z.string().max(80),
  /** Rough host region for the public list (§6.5), from the host's time zone ("Europe"). */
  region: z.string().max(24),
});
/**
 * Host only: change how the room shows in the public list (§6.5) after creating it: the host
 * toggled public/private, renamed, changed the rules, or seated bots (fewer seats for humans).
 */
export const RoomSettingsSchema = z.object({
  type: z.literal('roomSettings'),
  name: z.string().min(1).max(32),
  public: z.boolean(),
  maxPlayers: z.number().int().min(1).max(8),
  summary: z.string().max(80),
});
export const JoinRoomSchema = z.object({
  type: z.literal('joinRoom'),
  code: RoomCodeSchema,
  /**
   * The joiner already holds a seat in this room's match (a saved seat token) and is coming back
   * after the lobby server forgot it. A started room only lets these in; the host checks the token.
   */
  rejoin: z.boolean().optional(),
});
export const LeaveRoomSchema = z.object({ type: z.literal('leaveRoom') });
export const ListRoomsSchema = z.object({ type: z.literal('listRooms') });
/** Host only: the match started; the room leaves the public list and refuses new joins. */
export const StartMatchSchema = z.object({ type: z.literal('startMatch') });

const ToOffer = z.object({ type: z.literal('offer'), to: IdSchema, sdp: SdpSchema });
const ToAnswer = z.object({ type: z.literal('answer'), to: IdSchema, sdp: SdpSchema });
/** `candidate` is a JSON `RTCIceCandidateInit`, or null for end-of-candidates. */
const ToIce = z.object({
  type: z.literal('ice'),
  to: IdSchema,
  candidate: z.string().max(2_000).nullable(),
});
/** WebSocket relay fallback (§6.4): an opaque peer message to another member of the room. */
const ToRelay = z.object({
  type: z.literal('relay'),
  to: IdSchema,
  data: z.string().max(RELAY_MAX),
});
/** Report which path a peer link took (§6.4). */
export const PathReportSchema = z.object({
  type: z.literal('path'),
  path: LinkPathSchema,
  /** Milliseconds from link start to open. */
  ms: z.number().int().min(0).max(600_000),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  HelloSchema,
  CreateRoomSchema,
  RoomSettingsSchema,
  JoinRoomSchema,
  LeaveRoomSchema,
  ListRoomsSchema,
  StartMatchSchema,
  ToOffer,
  ToAnswer,
  ToIce,
  ToRelay,
  PathReportSchema,
]);

// ── signalling: server → client ─────────────────────────────────────────────────────────────

/** Reply to `hello`. On success it carries this socket's identity. */
export const WelcomeSchema = z.object({
  type: z.literal('welcome'),
  protocolVersion: z.number().int().nonnegative(),
  ok: z.boolean(),
  reason: z.string().optional(),
  id: IdSchema.optional(),
  secret: IdSchema.optional(),
  /** True when `hello` reclaimed an earlier identity (room membership kept). */
  resumed: z.boolean().optional(),
});

export const RoomMemberSchema = z.object({ id: IdSchema, connected: z.boolean() });
/** Sent to every member whenever membership changes, and as the reply to create/join (§6.5). */
export const RoomUpdateSchema = z.object({
  type: z.literal('roomUpdate'),
  code: RoomCodeSchema,
  name: z.string(),
  host: IdSchema,
  public: z.boolean(),
  maxPlayers: z.number().int(),
  started: z.boolean(),
  /** In join order; the host is first. */
  members: z.array(RoomMemberSchema),
});
export const RoomInfoSchema = z.object({
  code: RoomCodeSchema,
  name: z.string(),
  players: z.number().int(),
  maxPlayers: z.number().int(),
  summary: z.string(),
  region: z.string(),
});
export const RoomsSchema = z.object({ type: z.literal('rooms'), rooms: z.array(RoomInfoSchema) });
export const ServerErrorSchema = z.object({
  type: z.literal('error'),
  code: z.enum(['bad', 'notFound', 'full', 'started', 'rateLimited', 'notInRoom', 'notHost']),
  reason: z.string(),
});
const FromOffer = z.object({ type: z.literal('offer'), from: IdSchema, sdp: SdpSchema });
const FromAnswer = z.object({ type: z.literal('answer'), from: IdSchema, sdp: SdpSchema });
const FromIce = z.object({
  type: z.literal('ice'),
  from: IdSchema,
  candidate: z.string().nullable(),
});
const FromRelay = z.object({ type: z.literal('relay'), from: IdSchema, data: z.string() });

export const ServerMessageSchema = z.discriminatedUnion('type', [
  WelcomeSchema,
  RoomUpdateSchema,
  RoomsSchema,
  ServerErrorSchema,
  FromOffer,
  FromAnswer,
  FromIce,
  FromRelay,
]);

export type Hello = z.infer<typeof HelloSchema>;
export type Welcome = z.infer<typeof WelcomeSchema>;
export type RoomUpdate = z.infer<typeof RoomUpdateSchema>;
export type RoomInfo = z.infer<typeof RoomInfoSchema>;
export type ServerError = z.infer<typeof ServerErrorSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// ── peer protocol (host ⇄ guest over a data channel or the relay) ──────────────────────────

/**
 * Match settings that reach every peer. Every peer derives the same `WorldOptions` from this and
 * the seed, so this is all of the setup that can influence the sim.
 */
/** A seat's tank choice: a `tank.*` id, "random", or "auto". */
export const TankPickSchema = z.union([z.literal('auto'), z.literal('random'), ContentIdSchema]);
export type TankPick = z.infer<typeof TankPickSchema>;

export const NetSetupSchema = z.object({
  slots: z
    .array(z.union([z.literal('human'), z.literal('off'), ContentIdSchema]))
    .min(2)
    .max(8),
  size: z.enum(Object.keys(MAP_SIZES) as [keyof typeof MAP_SIZES, ...(keyof typeof MAP_SIZES)[]]),
  scenery: z.enum([
    'none',
    'village',
    'badlands',
    'marsh',
    'city',
    'islands',
    'caves',
    'glacier',
    'claypits',
  ]),
  rounds: z.number().int().min(1).max(20),
  turnTimer: z.number().int().min(0).max(120),
  wind: WindTypeSchema,
  /** Weather (§3.4); older hosts don't send it, which means clear. */
  weather: z.enum(['clear', 'rain', 'snow', 'random']).optional(),
  suddenDeath: z.boolean(),
  /** Each player's turn sudden death starts on (§3.1); unset = the mode's default. */
  suddenDeathFrom: z.number().int().min(1).max(30).optional(),
  startingCash: z.number().int().min(0).max(1_000_000),
  /** Team per seat (milestone 7), or null for a free-for-all. */
  teams: z.array(z.number().int().min(0).max(3)).max(8).nullable(),
  /** Tank type per seat (§3.2): a `tank.*` id, "random", or "auto" (a bot's favourite, else the default). */
  tanks: z.array(TankPickSchema).max(8),
});
export type NetSetup = z.infer<typeof NetSetupSchema>;

/** Guest → host, first message on a link: versions, content hash (§2c.4) and a resume token. */
export const PeerJoinSchema = z.object({
  type: z.literal('join'),
  protocolVersion: z.number().int(),
  kernelVersion: z.string().max(40),
  contentHash: z.string().max(80),
  name: z.string().min(1).max(16),
  /** Token from an earlier `accept`: reclaims the same seat after a drop or a reload. */
  token: z.string().max(40).optional(),
  /** Last tick this guest simulated in the running match, or -1 if it has no world. */
  haveTick: z.number().int().min(-1),
});
export const PeerAcceptSchema = z.object({
  type: z.literal('accept'),
  ok: z.boolean(),
  reason: z.string().optional(),
  token: z.string().max(40).optional(),
});
export const LobbySeatSchema = z.object({
  name: z.string(),
  kind: z.enum(['host', 'guest', 'bot', 'open']),
  /** `ai.*` personality for bots. */
  bot: z.string().optional(),
  connected: z.boolean(),
  path: LinkPathSchema.optional(),
  /** `ai.*` personality playing for this human while they are away (§6.1 takeover). */
  standIn: z.string().optional(),
  /** Round trip in ms, if measured. */
  rtt: z.number().int().optional(),
});
/** Host → guests: the lobby as the host sees it. `you` is the receiver's seat. */
export const PeerLobbySchema = z.object({
  type: z.literal('lobby'),
  seats: z.array(LobbySeatSchema),
  setup: NetSetupSchema,
  you: z.number().int(),
});
/**
 * Host → guest: start (or rebuild) the match. A fresh start has an empty log; a resync or a
 * rejoin carries the whole input log so the guest re-simulates to `upTo` (§6.3).
 */
export const PeerStartSchema = z.object({
  type: z.literal('start'),
  seed: z.number().int().min(0).max(0xffffffff),
  setup: NetSetupSchema,
  mode: ContentIdSchema,
  /** The player index this guest controls. */
  you: z.number().int().min(0),
  inputs: z.array(TimedInputSchema),
  upTo: z.number().int().min(0),
});
/** Guest → host: something the guest's player did. The host stamps the tick. */
export const PeerInputSchema = z.object({ type: z.literal('input'), action: InputSchema });
/**
 * Host → guests: inputs stamped by the host, and permission to simulate every tick before `upTo`.
 * Inputs arrive in tick order and are applied in message order.
 */
export const PeerTickSchema = z.object({
  type: z.literal('tick'),
  upTo: z.number().int().min(0),
  inputs: z.array(TimedInputSchema),
});
/** Guest → host: state hash after simulating `t` ticks (desync detection, §6.3). */
export const PeerHashSchema = z.object({
  type: z.literal('hash'),
  t: z.number().int().min(0),
  h: z.string().max(80),
});
/** Guest → host, in the lobby: the tank this guest wants (§3.2). */
export const PeerPickTankSchema = z.object({ type: z.literal('pickTank'), tank: TankPickSchema });
export const PeerPingSchema = z.object({ type: z.literal('ping'), n: z.number().int() });
export const PeerPongSchema = z.object({ type: z.literal('pong'), n: z.number().int() });
export const PeerByeSchema = z.object({ type: z.literal('bye'), reason: z.string().max(200) });

export const PeerMessageSchema = z.discriminatedUnion('type', [
  PeerJoinSchema,
  PeerAcceptSchema,
  PeerLobbySchema,
  PeerStartSchema,
  PeerInputSchema,
  PeerTickSchema,
  PeerHashSchema,
  PeerPickTankSchema,
  PeerPingSchema,
  PeerPongSchema,
  PeerByeSchema,
]);
export type PeerMessage = z.infer<typeof PeerMessageSchema>;
export type PeerJoin = z.infer<typeof PeerJoinSchema>;
export type PeerStart = z.infer<typeof PeerStartSchema>;
export type PeerLobby = z.infer<typeof PeerLobbySchema>;
export type LobbySeat = z.infer<typeof LobbySeatSchema>;
