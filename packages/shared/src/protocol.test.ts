import { describe, expect, it } from 'vitest';
import { ClientMessageSchema, PROTOCOL_VERSION } from './protocol';

describe('protocol', () => {
  it('accepts a well-formed hello', () => {
    const msg = ClientMessageSchema.parse({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
    expect(msg.type).toBe('hello');
  });

  it('rejects an unknown message type', () => {
    expect(ClientMessageSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });
});
