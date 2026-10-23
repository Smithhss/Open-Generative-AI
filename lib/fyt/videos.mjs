import { authenticatedScope } from './chat.mjs';
import { clearSession } from './session.mjs';

export const VIDEO_DURATIONS = [4, 5, 6, 8, 10];
export const VIDEO_SIZES = ['1280x720', '720x1280', '1024x1024'];

function validString(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function videoRequestBody({ model, group, prompt, seconds, size, imageUrl }) {
  if (!validString(model, 128) || !validString(group, 128)) throw new Error('INVALID_VIDEO_REQUEST');
  if (!validString(prompt, 2000)) throw new Error('INVALID_VIDEO_REQUEST');
  const body = {
    model: model.trim(),
    group,
    prompt: prompt.trim(),
    // OpenAI /v1/videos 规范里 seconds 是字符串，网关按字符串反序列化。
    seconds: String(Number(seconds) > 0 ? Number(seconds) : 4),
  };
  if (size) body.size = size;
  if (imageUrl) body.input_reference = imageUrl;
  return body;
}

export function normalizeVideoTask(body) {
  const id = body?.id || body?.task_id;
  if (typeof id !== 'string' || !id) throw new Error('INVALID_VIDEO_RESPONSE');
  return { id, status: typeof body.status === 'string' ? body.status : 'queued', model: body.model || '' };
}

export function isTerminalStatus(status) {
  return status === 'completed' || status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'canceled';
}

export function isSuccessStatus(status) {
  return status === 'completed' || status === 'succeeded';
}

export function fytVideoContentUrl(taskId) {
  return `/pg/videos/${encodeURIComponent(taskId)}/content`;
}

async function request(path, init, signal) {
  const scope = await authenticatedScope(signal);
  try {
    scope.check();
    const response = await fetch(path, { ...scope.init, ...init });
    const result = await response.json().catch(() => null);
    scope.check();
    if (response.status === 401) {
      clearSession({ status: 'anonymous', broadcast: true });
      throw new Error('AUTH_REQUIRED');
    }
    if (!response.ok || result?.error) throw new Error(`VIDEO_HTTP_${response.status}`);
    return result;
  } finally {
    scope.close();
  }
}

// 视频是异步收费任务：超时或断连可能已经扣费，调用方不得自动重发这个 POST。
export async function createFytVideo(parameters, { signal } = {}) {
  const body = videoRequestBody(parameters);
  return normalizeVideoTask(await request('/pg/videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, signal));
}

export async function fetchFytVideo(taskId, { signal } = {}) {
  if (!validString(taskId, 128)) throw new Error('INVALID_VIDEO_TASK');
  const body = await request(`/pg/videos/${encodeURIComponent(taskId)}`, { method: 'GET' }, signal);
  return { id: taskId, status: typeof body?.status === 'string' ? body.status : 'unknown', raw: body };
}

export async function getVideoModels({ group, signal } = {}) {
  if (!validString(group, 128)) throw new Error('INVALID_GROUP');
  const scope = await authenticatedScope(signal);
  try {
    const response = await fetch(`/api/user/models?group=${encodeURIComponent(group)}&type=video&with_meta=1`, scope.init);
    const body = await response.json().catch(() => null);
    scope.check();
    if (response.status === 401) {
      clearSession({ status: 'anonymous', broadcast: true });
      throw new Error('AUTH_REQUIRED');
    }
    if (!response.ok || body?.success !== true) throw new Error(`VIDEO_HTTP_${response.status}`);
    return Array.isArray(body.data) ? [...new Set(body.data.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))] : [];
  } finally {
    scope.close();
  }
}
