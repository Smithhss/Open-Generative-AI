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

// 上游可能返回 b64_json，也可能只给一个 https 产物地址。
// 两种都接受：b64 走本地解码，外链交给浏览器按 CSP 允许的 https 图片源加载。
export function normalizeGeneratedImage(body) {
  if (!Array.isArray(body?.data) || body.data.length !== 1) throw new Error('INVALID_IMAGE_RESPONSE');
  const item = body.data[0] || {};
  const data = item.b64_json;
  if (data === undefined || data === null || data === '') {
    const url = item.url;
    if (typeof url !== 'string' || !/^https:\/\/[^\s]+$/i.test(url) || url.length > 2048) throw new Error('INVALID_IMAGE_RESPONSE');
    return { url, mime: 'image/*', external: true };
  }
  if (typeof data !== 'string' || data.length > 28 * 1024 * 1024 || data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error('INVALID_IMAGE_RESPONSE');
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

// 上游产物是外链时，改成同源代理地址：上游换域名、加防盗链或短签名过期时，
// 只需网关侧改白名单，前端不用动。
export function imageArtifactUrl(url) {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return url;
  return `/pg/images/artifact?url=${encodeURIComponent(url)}`;
}

function withArtifactProxy(image) {
  if (!image?.external) return image;
  return { ...image, externalUrl: image.url, url: imageArtifactUrl(image.url) };
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
      return { ...withArtifactProxy(normalizeGeneratedImage(result)), requestId };
    } catch (error) { error.requestId = requestId; throw error; }
  } finally { scope.close(); }
}

// 图生图：源图随请求体一起上传，不经过第三方存储。
export const EDIT_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_EDIT_BYTES = 20 * 1024 * 1024;

export function validateEditFile(file) {
  const type = typeof file?.type === 'string' ? file.type.toLowerCase() : '';
  const size = typeof file?.size === 'number' ? file.size : 0;
  if (!EDIT_ACCEPTED_TYPES.includes(type)) throw new Error('INVALID_EDIT_FILE');
  if (!(size > 0) || size > MAX_EDIT_BYTES) throw new Error('INVALID_EDIT_FILE');
  return type;
}

export function imageEditFormData({ model, group, prompt, file }) {
  if (typeof model !== 'string' || !model.trim() || typeof group !== 'string' || !group || group.length > 128 ||
      typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) throw new Error('INVALID_IMAGE_REQUEST');
  validateEditFile(file);
  const form = new FormData();
  form.append('model', model.trim());
  form.append('group', group);
  form.append('prompt', prompt.trim());
  form.append('n', '1');
  form.append('image', file, typeof file.name === 'string' && file.name ? file.name : 'reference.png');
  return form;
}

export async function generateFytImageEdit(parameters, { signal } = {}) {
  const form = imageEditFormData(parameters);
  const scope = await authenticatedScope(signal);
  try {
    scope.check();
    // multipart 由浏览器自行设置 boundary，不能手写 Content-Type。
    const response = await fetch('/pg/images/edits', { ...scope.init, method: 'POST', body: form });
    const requestId = response.headers.get('X-Oneapi-Request-Id')?.slice(0, 128) || '';
    const result = await response.json().catch(() => null);
    scope.check();
    if (response.status === 401) { clearSession({ status: 'anonymous', broadcast: true }); throw new Error('AUTH_REQUIRED'); }
    try {
      if (!response.ok || result?.error) throw new Error(`IMAGE_HTTP_${response.status}`);
      return { ...withArtifactProxy(normalizeGeneratedImage(result)), requestId };
    } catch (error) { error.requestId = requestId; throw error; }
  } finally { scope.close(); }
}
