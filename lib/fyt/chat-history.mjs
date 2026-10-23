const PREFIX = 'fyt:studio:agents:v1:';
const MAX_BYTES = 1024 * 1024;
const statuses = new Set(['complete', 'streaming', 'stopped', 'error', 'interrupted']);
function key(id) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_USER');
  return `${PREFIX}${id}`;
}
function cleanConversation(value, loading) {
  if (!value || typeof value.id !== 'string' || value.id.length > 128 || !Array.isArray(value.messages) ||
      !['title', 'model', 'group', 'templateId', 'system'].every(field => typeof value[field] === 'string') ||
      value.system.length > 4000 || value.model.length > 256 || value.group.length > 128 || !Number.isFinite(value.updatedAt)) return null;
  const messages = [];
  for (const m of value.messages) {
    if (!m || typeof m.id !== 'string' || m.id.length > 128 || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' ||
        m.content.length > (m.role === 'user' ? 6000 : 200000) || !statuses.has(m.status)) return null;
    messages.push({ id: m.id, role: m.role, content: m.content,
      status: loading && m.status === 'streaming' ? 'interrupted' : m.status });
  }
  // Conversations are generated in user/assistant pairs, plus an optional user draft.
  const tail = messages.slice(-40);
  if (tail[0]?.role === 'assistant') tail.shift();
  return { id: value.id, title: value.title.slice(0, 80), model: value.model, group: value.group,
    templateId: value.templateId.slice(0, 80), system: value.system, updatedAt: value.updatedAt, messages: tail };
}
export function readChatHistory(storage, userId) {
  const storageKey = key(userId);
  const raw = storage.getItem(storageKey);
  if (!raw) return [];
  if (new TextEncoder().encode(raw).length > MAX_BYTES) throw new Error('HISTORY_TOO_LARGE');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('HISTORY_INVALID'); }
  if (!Array.isArray(parsed)) throw new Error('HISTORY_INVALID');
  return parsed.map(c => cleanConversation(c, true)).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);
}
export function saveChatHistory(storage, userId, conversations) {
  const storageKey = key(userId);
  const cleaned = conversations.map(c => cleanConversation(c, false));
  if (cleaned.some(c => !c)) throw new Error('HISTORY_INVALID');
  const list = cleaned.sort((a,b) => b.updatedAt-a.updatedAt).slice(0,20);
  let json = JSON.stringify(list);
  while (new TextEncoder().encode(json).length > MAX_BYTES) {
    if (list.length > 1) list.pop();
    else if (list[0]?.messages.length > 2) list[0].messages.splice(0,2);
    else throw new Error('HISTORY_TOO_LARGE');
    json = JSON.stringify(list);
  }
  storage.setItem(storageKey, json);
}
export function selectChatContext(messages) {
  const result = [];
  for (let i=0; i<messages.length-1; i++) {
    const user = messages[i]; const assistant = messages[i+1];
    if (user.role === 'user' && user.status === 'complete' && assistant.role === 'assistant' && assistant.status === 'complete' && user.content && assistant.content) {
      result.push({role:'user',content:user.content},{role:'assistant',content:assistant.content}); i++;
    }
  }
  return result.slice(-40);
}
export function trimChatContext(messages, system, prompt) {
  const context = selectChatContext(messages);
  let trimmed = false;
  while (context.length && context.reduce((n,m)=>n+m.content.length, system.length+prompt.length) > 24000) {
    context.splice(0,2); trimmed = true;
  }
  // At most 19 previous turns plus this pending turn, leaving room for its reply.
  while (context.length > 38) { context.splice(0,2); trimmed = true; }
  return { messages: [...context, {role:'user', content:prompt}], trimmed };
}
