import { z } from 'zod';

/**
 * Version of the lobby/signalling and peer protocol. Bump on any breaking change to a message
 * shape; peers and the signalling server refuse a mismatched version (§2c.4).
 */
export const PROTOCOL_VERSION = 1;

/** Client → server: first message on a new socket. */
export const HelloSchema = z.object({
  type: z.literal('hello'),
  protocolVersion: z.number().int().nonnegative(),
});

/** Server → client: reply to `hello`. */
export const WelcomeSchema = z.object({
  type: z.literal('welcome'),
  protocolVersion: z.number().int().nonnegative(),
  ok: z.boolean(),
  reason: z.string().optional(),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [HelloSchema]);
export const ServerMessageSchema = z.discriminatedUnion('type', [WelcomeSchema]);

export type Hello = z.infer<typeof HelloSchema>;
export type Welcome = z.infer<typeof WelcomeSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
