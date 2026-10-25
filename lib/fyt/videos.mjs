import { authenticatedScope } from './chat.mjs';
import { pickCapabilities } from './images.mjs';
import { clearSession, refreshSession } from './session.mjs';

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

// 网关的查询接口把任务包在 {code,message,data} 里，创建接口则直接返回任务体。
export function unwrapTask(body) {
  if (body && typeof body === 'object' && body.data && typeof body.data === 'object') return body.data;
  return body;
}

// 上游状态词不统一：创建返回 queued，查询返回 QUEUED / IN_PROGRESS / SUCCESS / FAILED。
export function normalizeStatus(value) {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (status === 'completed' || status === 'succeeded' || status === 'success' || status === 'done') return 'completed';
  if (status === 'failed' || status === 'failure' || status === 'error') return 'failed';
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'in_progress' || status === 'running' || status === 'processing') return 'in_progress';
  if (status === 'queued' || status === 'pending' || status === 'submitted') return 'queued';
  return status || 'unknown';
}

export function normalizeVideoTask(body) {
  const task = unwrapTask(body);
  const id = task?.id || task?.task_id;
  if (typeof id !== 'string' || !id) throw new Error('INVALID_VIDEO_RESPONSE');
  return { id, status: normalizeStatus(task.status), model: task.model || '' };
}

export function isTerminalStatus(status) {
  const value = normalizeStatus(status);
  return value === 'completed' || value === 'failed' || value === 'cancelled';
}

export function isSuccessStatus(status) {
  return normalizeStatus(status) === 'completed';
}

// 刷新后按任务编号续查：只存任务标识与状态，不存提示词等敏感内容。
export function videoTaskStorageKey(userId) {
  return `fyt.video.task.${userId}`;
}

export function saveVideoTask(userId, task) {
  if (!userId || !task?.id) return;
  try {
    localStorage.setItem(videoTaskStorageKey(userId), JSON.stringify({
      id: task.id,
      model: task.model || '',
      status: normalizeStatus(task.status),
      savedAt: Date.now(),
    }));
  } catch { /* 隐私模式下写不进去，忽略即可 */ }
}

export function loadVideoTask(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(videoTaskStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== 'string' || !parsed.id) return null;
    return { id: parsed.id, model: typeof parsed.model === 'string' ? parsed.model : '', status: normalizeStatus(parsed.status) };
  } catch {
    return null;
  }
}

export function clearVideoTask(userId) {
  if (!userId) return;
  try { localStorage.removeItem(videoTaskStorageKey(userId)); } catch { /* 同上 */ }
}

export function fytVideoContentUrl(taskId) {
  return `/pg/videos/${encodeURIComponent(taskId)}/content`;
}

async function request(path, init, signal) {
  const scope = await authenticatedScope(signal);
  try {
    scope.check();
    // 合并 headers：调用方传了 Content-Type 时不能把 scope 的 Authorization 覆盖掉。
    const merged = { ...scope.init, ...init, headers: { ...(scope.init?.headers || {}), ...(init?.headers || {}) } };
    const response = await fetch(path, merged);
    const result = await response.json().catch(() => null);
    scope.check();
    if (response.status === 401) {
      // 令牌可能刚被轮换掉（刷新后旧令牌立刻失效）。先强制刷新再重试一次。
      // 只重试 GET：视频提交是计费动作，重发可能重复扣费，绝不能自动重试。
      const method = String(init?.method || 'GET').toUpperCase();
      if (method === 'GET') {
        await refreshSession().catch(() => null);
        const retryScope = await authenticatedScope(signal);
        try {
          const retryInit = { ...retryScope.init, ...init, headers: { ...(retryScope.init?.headers || {}), ...(init?.headers || {}) } };
          const retry = await fetch(path, retryInit);
          if (retry.ok) {
            const retryBody = await retry.json().catch(() => null);
            if (retryBody && !retryBody.error) return retryBody;
          }
        } finally {
          retryScope.close();
        }
      }
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
  const body = unwrapTask(await request(`/pg/videos/${encodeURIComponent(taskId)}`, { method: 'GET' }, signal));
  const status = normalizeStatus(body?.status);
  return { id: taskId, status, raw: body };
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
    const models = Array.isArray(body.data) ? [...new Set(body.data.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))] : [];
    return { models, capabilities: pickCapabilities(body.capabilities, models) };
  } finally {
    scope.close();
  }
}
