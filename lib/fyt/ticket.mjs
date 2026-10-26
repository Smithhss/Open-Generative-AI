import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'fyt_t_';
const MAX_TTL_MS = 15 * 60 * 1000;
const MAX_TOKEN_BYTES = 16 * 1024;
const MAX_PAYLOAD_BYTES = MAX_TOKEN_BYTES + 256;
const MAX_TICKET_LENGTH = PREFIX.length + Math.ceil((MAX_PAYLOAD_BYTES + 28) * 4 / 3);

// Called by the production launcher at runtime, never during the Next build.
export function assertTicketSecret() {
  const secret = process.env.FYT_TICKET_SECRET;
  if (typeof secret !== 'string' || !secret.trim() || Buffer.byteLength(secret, 'utf8') < 32 ||
      secret === 'fyt-canvas-ticket-dev-secret') {
    throw new Error('FYT_TICKET_SECRET must be a private secret of at least 32 bytes');
  }
}

function key() {
  assertTicketSecret();
  return createHash('sha256').update(process.env.FYT_TICKET_SECRET).digest();
}

// The caller must verify identity with Go before sealing. Reading exp here only
// narrows the lifetime; it does not authenticate the JWT or its signature.
function tokenExpiry(accessToken) {
  if (typeof accessToken !== 'string' || !accessToken || /\s/.test(accessToken) ||
      Buffer.byteLength(accessToken, 'utf8') > MAX_TOKEN_BYTES) throw new Error('Invalid access token');
  const parts = accessToken.split('.');
  if (parts.length !== 3) return Infinity; // Opaque personal access tokens.
  try {
    if (parts.some((part) => !part || !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!claims || typeof claims !== 'object' || Array.isArray(claims) ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= 0 ||
        !Number.isSafeInteger(claims.exp * 1000)) throw new Error();
    return claims.exp * 1000;
  } catch {
    throw new Error('Invalid access token expiry');
  }
}

export function sealTicket(accessToken, ttlMs = MAX_TTL_MS) {
  const secretKey = key();
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error('Invalid ticket TTL');
  const now = Date.now();
  const expiry = Math.min(now + Math.min(ttlMs, MAX_TTL_MS), tokenExpiry(accessToken));
  if (expiry <= now) throw new Error('Access token has expired');
  const payload = JSON.stringify({ t: accessToken, e: expiry });
  if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) throw new Error('Invalid access token');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey, iv);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  return `${PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')}`;
}

export function isTicket(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function readTicket(ticket) {
  if (!isTicket(ticket) || ticket.length > MAX_TICKET_LENGTH) return null;
  const encoded = ticket.slice(PREFIX.length);
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const raw = Buffer.from(encoded, 'base64url');
    if (raw.length <= 28 || raw.length > MAX_PAYLOAD_BYTES + 28 || raw.toString('base64url') !== encoded) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const payload = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    if (payload.length > MAX_PAYLOAD_BYTES) return null;
    const json = JSON.parse(payload.toString('utf8'));
    const now = Date.now();
    if (!json || typeof json !== 'object' || Array.isArray(json) || Object.keys(json).length !== 2 ||
        !Number.isSafeInteger(json.e) || json.e <= now || json.e > now + MAX_TTL_MS ||
        tokenExpiry(json.t) < json.e) return null;
    return json;
  } catch {
    return null;
  }
}

// Invalid, tampered, rotated or expired tickets always fail without exposing credentials.
export function unsealTicket(ticket) {
  return readTicket(ticket)?.t ?? '';
}

export function ticketExpiry(ticket) {
  return readTicket(ticket)?.e ?? 0;
}
