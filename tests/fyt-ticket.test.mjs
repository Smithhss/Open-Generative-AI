import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as tickets from '../lib/fyt/ticket.mjs';

const SECRET = 'test-only-private-ticket-key-32-bytes-long';
const NOW = 1_800_000_000_000;
let previousSecret;
beforeEach(() => { previousSecret = process.env.FYT_TICKET_SECRET; process.env.FYT_TICKET_SECRET = SECRET; });
afterEach(() => { if (previousSecret === undefined) delete process.env.FYT_TICKET_SECRET; else process.env.FYT_TICKET_SECRET = previousSecret; });
const jwt = (payload) => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.mock-signature`;

test('ticket secret is explicit, at least 32 bytes, and rejects the old public default', () => {
  for (const value of [undefined, '', 'weak', 'fyt-canvas-ticket-dev-secret', ' '.repeat(40)]) {
    if (value === undefined) delete process.env.FYT_TICKET_SECRET; else process.env.FYT_TICKET_SECRET = value;
    assert.throws(() => tickets.assertTicketSecret(), /FYT_TICKET_SECRET/);
    assert.throws(() => tickets.sealTicket('opaque-personal-access-token'));
  }
  process.env.FYT_TICKET_SECRET = SECRET;
  assert.doesNotThrow(() => tickets.assertTicketSecret());
});

test('opaque PAT tickets use 15 minute maximum/default and preserve the token', (t) => {
  t.mock.method(Date, 'now', () => NOW);
  const ticket = tickets.sealTicket('opaque-personal-access-token');
  assert.equal(tickets.ticketExpiry(ticket), NOW + 15 * 60_000);
  assert.equal(tickets.unsealTicket(ticket), 'opaque-personal-access-token');
  assert.equal(tickets.ticketExpiry(tickets.sealTicket('opaque-personal-access-token', 86_400_000)), NOW + 15 * 60_000);
  assert.equal(tickets.ticketExpiry(tickets.sealTicket('opaque-personal-access-token', 30_000)), NOW + 30_000);
});

test('JWT expiry caps ticket lifetime and expired or invalid JWTs are rejected', (t) => {
  t.mock.method(Date, 'now', () => NOW);
  const token = jwt({ exp: NOW / 1000 + 12 });
  assert.equal(tickets.ticketExpiry(tickets.sealTicket(token)), NOW + 12_000);
  for (const payload of [{ exp: NOW / 1000 }, { exp: NOW / 1000 - 1 }, { exp: 'tomorrow' }, {}]) {
    assert.throws(() => tickets.sealTicket(jwt(payload)), /token|expiry/i);
  }
  assert.throws(() => tickets.sealTicket('header.invalid-payload.signature'));
});

test('invalid TTLs and excessive or malformed token inputs are rejected', () => {
  for (const ttl of [0, -1, NaN, Infinity, '60000', null, 0.5]) assert.throws(() => tickets.sealTicket('opaque-token', ttl));
  for (const token of ['', ' ', null, {}, 'x'.repeat(100_000), 'token with whitespace']) assert.throws(() => tickets.sealTicket(token));
});

test('tampering, key rotation, malformed and expired tickets fail closed', (t) => {
  let now = NOW;
  t.mock.method(Date, 'now', () => now);
  const ticket = tickets.sealTicket('opaque-personal-access-token', 1000);
  const tampered = ticket.slice(0, 12) + (ticket[12] === 'A' ? 'B' : 'A') + ticket.slice(13);
  for (const bad of [undefined, null, 42, {}, '', 'fyt_t_', 'fyt_t_!!!!', 'fyt_t_' + 'a'.repeat(100_000), tampered]) {
    assert.equal(tickets.unsealTicket(bad), ''); assert.equal(tickets.ticketExpiry(bad), 0);
  }
  process.env.FYT_TICKET_SECRET = 'different-test-only-private-key-at-least-32-bytes';
  assert.equal(tickets.unsealTicket(ticket), ''); assert.equal(tickets.ticketExpiry(ticket), 0);
  process.env.FYT_TICKET_SECRET = SECRET;
  now += 1000;
  assert.equal(tickets.unsealTicket(ticket), ''); assert.equal(tickets.ticketExpiry(ticket), 0);
});

test('ticket APIs never log sensitive inputs or include them in errors', (t) => {
  const calls = [];
  for (const method of ['log', 'warn', 'error']) t.mock.method(console, method, (...args) => calls.push(args));
  const token = 'test-sensitive-token-with-space must-not-appear';
  assert.throws(() => tickets.sealTicket(token), (err) => !err.message.includes(token));
  tickets.unsealTicket('fyt_t_invalid-sensitive-value');
  assert.deepEqual(calls, []);
});


test('authenticated but malformed payloads cannot expose a token or expiry', (t) => {
  t.mock.method(Date, 'now', () => NOW);
  const malformed = [null, [], { t: 'opaque-token', e: NOW + 1000, extra: true },
    { t: '', e: NOW + 1000 }, { t: {}, e: NOW + 1000 }, { t: 'opaque-token', e: 'tomorrow' },
    { t: 'opaque-token', e: NOW + 15 * 60_000 + 1 }, { t: 'opaque-token', e: NOW },
    { t: jwt({ exp: NOW / 1000 + 1 }), e: NOW + 2000 }];
  for (const payload of malformed) {
    const iv = Buffer.alloc(12, 1);
    const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(SECRET).digest(), iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
    const ticket = 'fyt_t_' + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
    assert.equal(tickets.unsealTicket(ticket), '');
    assert.equal(tickets.ticketExpiry(ticket), 0);
  }
});

test('production launcher rejects missing and weak secrets before importing the server', () => {
  for (const secret of [undefined, 'weak-test-value', 'fyt-canvas-ticket-dev-secret']) {
    const env = { ...process.env };
    if (secret === undefined) delete env.FYT_TICKET_SECRET; else env.FYT_TICKET_SECRET = secret;
    const result = spawnSync(process.execPath, [new URL('../scripts/fyt-start.mjs', import.meta.url).pathname], {
      env, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FYT_TICKET_SECRET must be a private secret/);
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
    if (secret) assert.ok(!result.stderr.includes(secret));
  }
});
