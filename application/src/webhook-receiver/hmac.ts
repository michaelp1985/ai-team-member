import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySignature(secret: string, rawBody: Buffer | string, signatureHeader: string): boolean {
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const incoming = Buffer.from(signatureHeader);
  if (incoming.length !== expected.length) return false;
  return timingSafeEqual(incoming, expected);
}
