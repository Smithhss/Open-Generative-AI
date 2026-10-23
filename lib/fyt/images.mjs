import { authenticatedScope } from './chat.mjs';
import { clearSession } from './session.mjs';

// 服务端按 type=image 过滤，这里只做去重与合法性校验，不再维护前端白名单。
export function availableImageModels(models) {
  if (!Array.isArray(models)) throw new Error('INVALID_MODELS');
  const seen = new Set();
  for (const id of models) {
    if (typeof id !== 'string') continue;
    const name = id.trim();
    if (name) seen.add(name);
  }
  return [...seen];
}

export function imageGenerationBody({ model, group, prompt }) {
  if (typeof model !== 'string' || !model.trim() || typeof group !== 'string' || !group || group.length > 128 ||
      typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) throw new Error('INVALID_IMAGE_REQUEST');
  return { model: model.trim(), group, prompt: prompt.trim(), n: 1, response_format: 'b64_json', stream: false };
}

export function normalizeGeneratedImage(body) {
  if (!Array.isArray(body?.data) || body.data.length !== 1) throw new Error('INVALID_IMAGE_RESPONSE');
  const data = body.data[0]?.b64_json;
  if (typeof data !== 'string' || !data || data.length > 28 * 1024 * 1024 || data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    // Do not broaden CSP or fetch an arbitrary upstream image URL on the server.
    throw new Error(body?.data[0]?.url ? 'IMAGE_BASE64_REQUIRED' : 'INVALID_IMAGE_RESPONSE');
  }
  let header;
  try { header = atob(data.slice(0, 16)); } catch { throw new Error('INVALID_IMAGE_RESPONSE'); }
  const bytes = Array.from(header, c => c.charCodeAt(0));
  let mime;
  if ([137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)) mime = 'image/png';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
  else if (header.slice(0,4) === 'RIFF' && header.slice(8,12) === 'WEBP') mime = 'image/webp';
  else throw new Error('INVALID_IMAGE_RESPONSE');
  return { url: `data:${mime};base64,${data}`, mime };
}

export async function getImageModels({ group, signal } = {}) {
  if (typeof group !== 'string' || !group || group.length > 128) throw new Error('INVALID_GROUP');
  const scope = await authenticatedScope(signal);
  try {
    const response = await fetch(`/api/user/models?group=${encodeURIComponent(group)}&type=image&with_meta=1`, scope.init);
    const body = await response.json().catch(() => null);
    scope.check();
    if (response.status === 401) { clearSession({ status: 'anonymous', broadcast: true }); throw new Error('AUTH_REQUIRED'); }
    if (!response.ok || body?.success !== true) throw new Error(`IMAGE_HTTP_${response.status}`);
    return availableImageModels(body.data);
  } finally { scope.close(); }
}

export async function generateFytImage(parameters, { signal } = {}) {
  const body = imageGenerationBody(parameters);
  const scope = await authenticatedScope(signal);
  try {
    scope.check();
    // A timeout or lost response can still have been charged. Never retry this POST automatically.
    const response = await fetch('/pg/images/generations', {
      ...scope.init, method: 'POST', headers: { ...scope.init.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const requestId = response.headers.get('X-Oneapi-Request-Id')?.slice(0, 128) || '';
    const result = await response.json().catch(() => null);
    scope.check();
    if (response.status === 401) { clearSession({ status: 'anonymous', broadcast: true }); throw new Error('AUTH_REQUIRED'); }
    try {
      if (!response.ok || result?.error) throw new Error(`IMAGE_HTTP_${response.status}`);
      return { ...normalizeGeneratedImage(result), requestId };
    } catch (error) { error.requestId = requestId; throw error; }
  } finally { scope.close(); }
}
