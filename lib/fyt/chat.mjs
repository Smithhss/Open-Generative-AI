import { getAccessToken, getSessionState, getSessionRevision, subscribeSession, clearSession } from './session.mjs';

export async function authenticatedScope(signal) {
  const initial = getSessionState();
  const userId = initial.user?.id;
  const token = await getAccessToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const current = getSessionState();
  // A same-user sign-in can replace the session while token acquisition yields.
  // Normal refresh keeps the sid; never bind an old credential to a new session.
  if (!userId || current.user?.id !== userId || current.session?.sid !== initial.session?.sid ||
      token !== current.accessToken) throw new Error('SESSION_CHANGED');
  const revision = getSessionRevision();
  const controller = new AbortController();
  let changed = false;
  const unsubscribe = subscribeSession(() => {
    if (getSessionRevision() !== revision) { changed = true; controller.abort(); }
  });
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  return {
    init: { signal: controller.signal, credentials: 'same-origin', cache: 'no-store', headers: { Authorization: `Bearer ${token}` } },
    check() {
      if (changed || getSessionRevision() !== revision) throw new Error('SESSION_CHANGED');
      controller.signal.throwIfAborted();
    },
    close() { unsubscribe(); signal?.removeEventListener('abort', abort); },
  };
}

async function readJson(response, scope) {
  scope.check();
  if (response.status === 401) {
    clearSession({ status: 'anonymous', broadcast: true });
    throw new Error('AUTH_REQUIRED');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) {
    // Do not echo upstream bodies or credentials into the UI.
    throw new Error(response.status === 401 ? 'AUTH_REQUIRED' : `API_ERROR_${response.status}`);
  }
  return body;
}

export async function getChatGroups({ signal } = {}) {
  const scope = await authenticatedScope(signal);
  try {
    const body = await readJson(await fetch('/api/user/self/groups', scope.init), scope);
    scope.check();
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw new Error('INVALID_GROUPS');
    return Object.entries(body.data).filter(([name]) => name && name.length <= 128)
      .map(([name, value]) => ({ name, desc: typeof value?.desc === 'string' ? value.desc : '' }));
  } finally { scope.close(); }
}

export async function getChatModels({ group, signal } = {}) {
  if (typeof group !== 'string' || !group || group.length > 128) throw new Error('INVALID_GROUP');
  const scope = await authenticatedScope(signal);
  try {
    const [models, pricing] = await Promise.all([
      fetch(`/api/user/models?group=${encodeURIComponent(group)}`, scope.init).then(response => readJson(response, scope)),
      fetch('/api/pricing', scope.init).then(response => readJson(response, scope)),
    ]);
    scope.check();
    if (!Array.isArray(models.data) || !Array.isArray(pricing.data)) throw new Error('CAPABILITY_UNAVAILABLE');
    const chat = new Set(pricing.data.filter(row => Array.isArray(row.supported_endpoint_types) &&
      row.supported_endpoint_types.some(type => pricing.supported_endpoint?.[type]?.path === '/v1/chat/completions' &&
        pricing.supported_endpoint[type].method?.toUpperCase() === 'POST')).map(row => row.model_name));
    return [...new Set(models.data.filter(name => typeof name === 'string' && name.length <= 256 && chat.has(name)))].sort();
  } finally { scope.close(); }
}

export function selectChatModel(models, conversation, group) {
  if (conversation?.group === group && models.includes(conversation.model)) return conversation.model;
  if (conversation && (conversation.model || conversation.messages.length)) return '';
  return models[0] || '';
}

export async function streamChat({ model, group, system = '', messages, signal, onDelta }) {
  if (typeof model !== 'string' || !model || model.length > 256 || typeof group !== 'string' || !group || group.length > 128) throw new Error('INVALID_MODEL');
  if (typeof system !== 'string' || system.length > 4000 || !Array.isArray(messages) || !messages.length || messages.length > 41 ||
      messages.some(m => !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content) ||
      messages.reduce((n, m) => n + m.content.length, system.length) > 30000) throw new Error('CONTEXT_TOO_LONG');
  const scope = await authenticatedScope(signal);
  let reader;
  try {
    scope.check();
    const response = await fetch('/pg/chat/completions', {
      ...scope.init, method: 'POST', headers: { ...scope.init.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, group, stream: true, max_tokens: 2048,
        messages: [...(system.trim() ? [{ role: 'system', content: system.trim() }] : []), ...messages.map(({ role, content }) => ({ role, content }))] }),
    });
    scope.check();
    if (response.status === 401) {
      clearSession({ status: 'anonymous', broadcast: true });
      throw new Error('AUTH_REQUIRED');
    }
    if (!response.ok) throw new Error(`CHAT_HTTP_${response.status}`);
    const requestId = response.headers.get('X-Oneapi-Request-Id');
    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
      const body = await response.json().catch(() => null);
      scope.check();
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content) throw new Error('INVALID_CHAT_RESPONSE');
      onDelta({ content, reasoning: '' });
      return { requestId, completed: true };
    }
    if (!response.body) throw new Error('INVALID_CHAT_RESPONSE');
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed = false;
    let doneMarker = false;
    function consume(event) {
      const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data.trim()) return;
      scope.check();
      if (data.trim() === '[DONE]') { completed = true; doneMarker = true; return; }
      let parsed;
      try { parsed = JSON.parse(data); } catch { throw new Error('INVALID_STREAM_DATA'); }
      if (parsed.error) throw new Error('UPSTREAM_ERROR');
      const choice = parsed.choices?.[0];
      if (choice?.finish_reason) completed = true;
      const delta = choice?.delta;
      if (!delta) return;
      const content = typeof delta.content === 'string' ? delta.content : '';
      const reasoning = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : typeof delta.reasoning === 'string' ? delta.reasoning : '';
      if (content || reasoning) onDelta({ content, reasoning });
    }
    for (;;) {
      scope.check();
      const { value, done } = await reader.read();
      scope.check();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 262144) throw new Error('STREAM_EVENT_TOO_LARGE');
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        consume(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
        if (doneMarker) break;
      }
      if (doneMarker) break;
      if (done) { if (buffer.trim()) consume(buffer); break; }
    }
    return { requestId, completed };
  } catch (error) {
    scope.check();
    throw error;
  } finally {
    if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    scope.close();
  }
}
