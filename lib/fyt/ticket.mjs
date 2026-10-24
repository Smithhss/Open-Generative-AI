import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// 画布票据：把用户的访问令牌封在密文里，画布只拿票据，不碰真令牌。
// 好处是画布不用管令牌刷新，过期后重新换一张即可；票据本身也带过期时间。

const PREFIX = 'fyt_t_';
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

function key() {
  const secret = process.env.FYT_TICKET_SECRET || 'fyt-canvas-ticket-dev-secret';
  return createHash('sha256').update(secret).digest();
}

export function sealTicket(accessToken, ttlMs = DEFAULT_TTL_MS) {
  const payload = JSON.stringify({ t: accessToken, e: Date.now() + ttlMs });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64url')}`;
}

export function isTicket(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

// 返回内层访问令牌；票据无效或过期返回空字符串。
export function unsealTicket(ticket) {
  if (!isTicket(ticket)) return '';
  try {
    const raw = Buffer.from(ticket.slice(PREFIX.length), 'base64url');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const body = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    const json = JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'));
    if (!json?.t || typeof json.t !== 'string') return '';
    if (typeof json.e !== 'number' || json.e < Date.now()) return '';
    return json.t;
  } catch {
    return '';
  }
}

export function ticketExpiry(ticket) {
  try {
    const raw = Buffer.from(ticket.slice(PREFIX.length), 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    return typeof json?.e === 'number' ? json.e : 0;
  } catch {
    return 0;
  }
}
