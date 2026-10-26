// fyt 版 creative-agent 最小实现：会话、任务、事件轮询、出图。
//
// 只覆盖画布 AI 的最小闭环：一句话 → 一张图。多步编排、技能、参考图编辑都不做。
// 单副本运行：会话和任务按 Go 用户隔离并落盘；中断任务不会自动重放收费请求。

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isTicket, sealTicket, unsealTicket, ticketExpiry } from './ticket.mjs';
import { join } from 'node:path';
import { DEFAULT_VISIBLE_TABS } from './tabs.mjs';

const STORE_KEY = '__fyt_creative_agent_store__';
const DATA_DIR = process.env.FYT_DATA_DIR || '/app/data';
const DATA_FILE = join(DATA_DIR, 'creative-agent.json');
// 侧边栏入口开关：存在工作台的数据卷里，管理员改、所有人读
const TABS_FILE = join(DATA_DIR, 'studio-tabs.json');
// 提示词模板：管理员可增删，存在同一个数据卷里
const TEMPLATES_FILE = join(DATA_DIR, 'studio-templates.json');
const DEFAULT_TABS = DEFAULT_VISIBLE_TABS;

// 会话与资产落盘，服务重启后还能接着聊；任务事件只保留最近若干条，避免文件膨胀。
function loadPersisted() {
  try {
    const raw = readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.sessions || typeof parsed.sessions !== 'object' || Array.isArray(parsed.sessions) || !parsed.jobs || typeof parsed.jobs !== 'object' || Array.isArray(parsed.jobs)) throw new Error('invalid stored creative state');
    for (const job of Object.values(parsed.jobs || {})) {
      if (job && !job.done) {
        job.status = 'interrupted';
        job.done = true;
        job.events = [...(job.events || []), { type: 'error', payload: { message: '任务因服务重启中断，请先核对调用记录。' } }].slice(-40);
      }
    }
    return {
      sessions: new Map(Object.entries(parsed.sessions || {})),
      jobs: new Map(Object.entries(parsed.jobs || {})),
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { sessions: new Map(), jobs: new Map() };
    throw error;
  }
}

let saveTimer = null;
function persistStore(state) {
  mkdirSync(DATA_DIR, { recursive: true });
  const sessions = Object.create(null);
  for (const [id, session] of state.sessions) sessions[id] = session;
  const jobs = Object.create(null);
  const recent = [...state.jobs.entries()].filter(([, job]) => job.done).slice(-200);
  for (const entry of state.jobs.entries()) if (!entry[1].done) recent.push(entry);
  for (const [id, job] of recent) jobs[id] = { ...job, events: (job.events || []).slice(-40) };
  const temporary = `${DATA_FILE}.tmp`;
  writeFileSync(temporary, JSON.stringify({ sessions, jobs }), { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, DATA_FILE);
}

function scheduleSave(state) {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      persistStore(state);
    } catch (error) {
      if (!globalThis.__fytCreativeWarned) {
        globalThis.__fytCreativeWarned = true;
        console.warn('[creative-agent] 会话落盘失败，退化为纯内存:', error?.message);
      }
    }
  }, 400);
}

function store() {
  if (!globalThis[STORE_KEY]) {
    const persisted = loadPersisted();
    globalThis[STORE_KEY] = { sessions: persisted.sessions, jobs: persisted.jobs, files: new Map() };
  }
  return globalThis[STORE_KEY];
}

const now = () => Date.now();
const uid = prefix => `${prefix}_${randomUUID()}`;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function fail(message, status = 400, code = 'creative_agent_error') {
  return Response.json({ error: { message, code } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function requestBody(request, limit = 2 * 1024 * 1024) {
  if (Number(request.headers.get('content-length')) > limit) throw Object.assign(new Error('request is too large'), { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return {};
  const parts = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw Object.assign(new Error('request is too large'), { status: 413 });
      }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw Object.assign(new Error('invalid JSON body'), { status: 400 }); }
}

// 参考图只允许内联栅格或由 Go 校验所有权/上游地址的内部媒体接口。
function referenceImage(url) {
  if (typeof url !== 'string') throw Object.assign(new Error('invalid reference image'), { status: 400 });
  if (url.startsWith('data:')) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
    if (!match || match[2].length > 14 * 1024 * 1024 || match[2].length % 4 !== 0) throw Object.assign(new Error('invalid reference image'), { status: 400 });
    const bytes = Buffer.from(match[2], 'base64');
    const valid = match[1] === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : match[1] === 'image/jpeg' ? bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid || bytes.length > 10 * 1024 * 1024) throw Object.assign(new Error('invalid reference image'), { status: 400 });
    return { bytes, type: match[1] };
  }
  if (url.length > 8192 || /[\\\x00-\x20]/.test(url) || !url.startsWith('/') || url.startsWith('//')) throw Object.assign(new Error('invalid reference image'), { status: 400 });
  const target = new URL(url, apiBase());
  const artifact = /^\/api\/user\/artifacts\/[A-Za-z0-9_-]+$/.test(target.pathname) && !target.search;
  const imageProxy = target.pathname === '/pg/images/artifact' && [...target.searchParams.keys()].every(key => key === 'url') && target.searchParams.getAll('url').length === 1;
  if (target.origin !== new URL(apiBase()).origin || target.hash || !(artifact || imageProxy) || target.pathname !== url.split('?')[0]) throw Object.assign(new Error('invalid reference image'), { status: 400 });
  return { target: target.href };
}

// ── 上游调用 ────────────────────────────────────────────────────────────────

function apiBase() {
  return (process.env.FYT_INTERNAL_API || 'http://api:3000').replace(/\/+$/, '');
}

async function callApi(path, { authorization, method = 'GET', body, timeout = 120_000 } = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authorization ? { authorization } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(timeout),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `HTTP ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  return data;
}

// 模型目录只说明「分组里可用」，不代表渠道真的通。按优先级排一下，
// 只选择首个可用模型；收费 POST 失败不自动重试。
function orderModels(models, preferred) {
  const score = name => {
    const index = preferred.findIndex(prefix => name.startsWith(prefix));
    return index === -1 ? preferred.length : index;
  };
  return [...models].sort((a, b) => score(a) - score(b));
}

async function pickModels({ cookie, authorization }) {
  const image = await callApi('/api/user/models?type=image', { cookie, authorization });
  const chat = await callApi('/api/user/models?type=chat', { cookie, authorization });
  const imageModels = Array.isArray(image?.data) ? image.data : [];
  const chatModels = Array.isArray(chat?.data) ? chat.data : [];
  return {
    image: orderModels(imageModels, ['gpt-image', 'seedream', 'flux', 'gemini-']),
    chat: orderModels(chatModels, ['deepseek', 'claude', 'gpt-']),
  };
}

const PROMPT_SYSTEM = [
  '你是视觉提示词编辑。把用户的想法整理成一条可直接用于文生图的提示词。',
  '包含主体、环境、构图、光线、风格与必要的约束，不要解释，不要分点，只输出提示词本身。',
  '信息不足时按最合理的常见理解补全，不要反问。',
].join('');

async function planPrompt({ cookie, authorization, message, chatModel }) {
  const body = {
    model: chatModel,
    group: 'default',
    stream: false,
    messages: [
      { role: 'system', content: PROMPT_SYSTEM },
      { role: 'user', content: message },
    ],
  };
  const result = await callApi('/pg/chat/completions', { cookie, authorization, method: 'POST', body });
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型没有返回提示词');
  return content.trim().slice(0, 1800);
}

async function fetchAssetBytes({ cookie, authorization, url }) {
  const { target, bytes, type } = referenceImage(url);
  if (bytes) return { bytes, type };
  const response = await fetch(target, {
    headers: { ...(authorization ? { authorization } : {}) },
    redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error('参考图读取失败');
  const imageType = (response.headers.get('content-type') || '').split(';')[0];
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(imageType)) { await response.body?.cancel(); throw new Error('参考图格式无效'); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('参考图为空');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 10 * 1024 * 1024) { await reader.cancel(); throw new Error('参考图过大'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new Error('参考图为空');
  return { bytes: Buffer.concat(chunks), type: imageType };
}

async function editImage({ authorization, model, prompt, asset }) {
  const form = new FormData();
  form.append('model', model);
  form.append('group', 'default');
  form.append('prompt', prompt);
  form.append('n', '1');
  form.append('image', new Blob([asset.bytes], { type: asset.type }), 'reference.png');
  const response = await fetch(`${apiBase()}/pg/images/edits`, {
    method: 'POST',
    headers: { ...(authorization ? { authorization } : {}) },
    redirect: 'error', signal: AbortSignal.timeout(120_000),
    body: form,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) throw new Error(data?.error?.message || `HTTP ${response.status}`);
  const item = data?.data?.[0];
  if (item?.url) return `/pg/images/artifact?url=${encodeURIComponent(item.url)}`;
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  throw new Error('上游没有返回图片');
}

async function generateImage({ cookie, authorization, model, prompt }) {
  const body = { model, group: 'default', prompt, n: 1, response_format: 'b64_json' };
  const result = await callApi('/pg/images/generations', { cookie, authorization, method: 'POST', body });
  const item = result?.data?.[0];
  if (!item) throw new Error('上游没有返回图片');
  if (typeof item.url === 'string' && item.url) return `/pg/images/artifact?url=${encodeURIComponent(item.url)}`;
  if (typeof item.b64_json === 'string' && item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  throw new Error('上游返回的图片格式无法识别');
}

// ── 任务执行 ────────────────────────────────────────────────────────────────

// 前端读的是 ev.payload.*（见 CreativeCanvas 的 processEvent），
// 字段必须包在 payload 里，否则 text 不显示、tool_result 的 asset 也拿不到。
function pushEvent(job, event) {
  const { type, ...payload } = event;
  job.events.push({ id: uid('ev'), job_id: job.id, type, payload });
}

async function runJob(job, { cookie, authorization, message, session, canvasState }) {
  job.status = 'processing';
  try {
    const models = await pickModels({ cookie, authorization });
    if (!models.image.length) throw new Error('当前分组没有可用的图片模型');
    if (!models.chat.length) throw new Error('当前分组没有可用的文本模型');

    // 画布上选中了图片就当参考图，走改图而不是重新生成。
    const selected = typeof canvasState?.selected === 'string' ? canvasState.selected : '';
    const source = selected ? (session.assets || []).find(item => item.asset_label === selected && item.kind === 'image') : null;
    if (selected && !source) throw new Error('参考图未登记到当前会话，请重新选择当前会话的图片。');
    const sourceImage = source ? await fetchAssetBytes({ authorization, url: source.url }) : null;
    if (session.assets.length >= 100) throw new Error('当前会话图片数量已达上限，请新建会话。');

    pushEvent(job, { type: 'text', content: source ? '正在按选中的图片改写…' : '正在把描述整理成提示词…' });
    const prompt = await planPrompt({ cookie, authorization, message, chatModel: models.chat[0] });
    pushEvent(job, { type: 'text', content: `\n\n提示词：${prompt}\n\n` });
    pushEvent(job, { type: 'tool_call', name: source ? 'edit_image' : 'generate_image', args: { prompt } });

    // 上游报错可能已经接受请求，不自动重试收费生成。
    const imageModel = models.image[0];
    const url = source
      ? await editImage({ authorization, model: imageModel, prompt, asset: sourceImage })
      : await generateImage({ authorization, model: imageModel, prompt });
    referenceImage(url);
    const label = uid('asset');
    pushEvent(job, {
      type: 'tool_result',
      name: source ? 'edit_image' : 'generate_image',
      result: { ok: true, url, ...(source ? { source_asset_id: source.asset_label } : {}) },
      asset: { url, asset_label: label, kind: 'image', prompt },
    });
    // 登记进会话资产，下一轮才能把它当参考图。
    session.assets.push({ asset_label: label, url, kind: 'image', source_tool: 'agent' });
    scheduleSave(store());
  } catch (error) {
    const message = error?.message || '生成失败';
    // 画布只把 text 事件渲染进气泡，错误事件本身不显示文字，这里补一条。
    pushEvent(job, { type: 'text', content: `\n\n⚠️ ${message}` });
    pushEvent(job, { type: 'error', message });
  } finally {
    job.status = 'done';
    job.done = true;
    scheduleSave(store());
  }
}

// ── 路由 ────────────────────────────────────────────────────────────────────

export async function handleCreativeAgent(request, segments) {
  try { return await handleCreativeRequest(request, segments); }
  catch (error) {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 503;
    return fail(status < 500 ? error.message : 'creative service is unavailable', status);
  }
}

async function handleCreativeRequest(request, segments) {
  const cookie = ''; // 身份只使用 Go 验证的 Bearer，不转发浏览器 Cookie。
  const rawAuth = (request.headers.get('authorization') || '').trim();
  // 画布带的是票据：解出内层令牌再去调网关。真令牌也可以直接传，方便调试。
  let bearer = '';
  if (/^Bearer\s+/i.test(rawAuth)) {
    const value = rawAuth.replace(/^Bearer\s+/i, '');
    if (value.length <= 16_384) bearer = isTicket(value) ? unsealTicket(value) : (/^\S{20,}$/.test(value) ? value : '');
  }
  const authorization = bearer ? `Bearer ${bearer}` : '';
  const [head, id, tail] = segments;
  if (!head) return fail('unknown endpoint', 404);
  const publicRead = request.method === 'GET' && !id && ['studio-tabs', 'studio-templates'].includes(head);
  let me = null;
  if (!publicRead) {
    if (!authorization) return fail('unauthorized', 401, 'unauthorized');
    try { me = await callApi('/api/user/self', { authorization, timeout: 10_000 }); }
    catch (error) { return fail(error.status === 401 || error.status === 403 ? 'unauthorized' : 'identity service is unavailable', error.status === 401 || error.status === 403 ? 401 : 503, 'unauthorized'); }
    if (me?.success !== true || !Number.isSafeInteger(me?.data?.id) || me.data.id <= 0) return fail('unauthorized', 401, 'unauthorized');
  }
  const userId = me?.data?.id;
  const { sessions, jobs, files } = store();

  if (head === 'sessions' && !id) {
    if (request.method === 'GET') {
      return json([...sessions.values()].filter(s => s.owner_id === userId).map(s => ({ id: s.id, name: s.name, created_at: s.created_at, updated_at: s.updated_at })));
    }
    if (request.method === 'POST') {
      if ([...sessions.values()].filter(session => session.owner_id === userId).length >= 100) return fail('session limit reached', 409, 'session_limit');
      const session = { owner_id: userId, id: uid('sess'), name: '新会话', created_at: now(), updated_at: now(), messages: [], assets: [], jobs: [] };
      sessions.set(session.id, session);
      scheduleSave(store());
      return json(session);
    }
    return fail('method not allowed', 405);
  }

  if (head === 'agent-skills') return json([]);

  // 提示词模板：GET 公开读（没配置时返回空，前端用内置默认），PUT 需要管理员
  if (head === 'studio-templates') {
    if (request.method === 'GET') {
      let templates = null;
      try {
        const parsed = JSON.parse(readFileSync(TEMPLATES_FILE, 'utf8'));
        if (Array.isArray(parsed?.templates)) templates = parsed.templates;
      } catch { /* 没配置就让前端用内置默认 */ }
      return json({ templates });
    }
    if (request.method === 'PUT') {
      if (Number(me?.data?.role ?? 0) < 10) return fail('admin permission required', 403, 'forbidden');
      const body = await requestBody(request, 256 * 1024);
      const list = Array.isArray(body?.templates) ? body.templates : [];
      // 只保留结构完整的条目，避免脏数据把面板弄崩
      const clean = list
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          id: String(item.id || '').slice(0, 64) || `tpl-${Date.now()}`,
          group: ['product', 'portrait', 'scene', 'video'].includes(item.group) ? item.group : 'product',
          kind: item.kind === 'video' ? 'video' : 'image',
          zh: String(item.zh || '').slice(0, 40),
          en: String(item.en || '').slice(0, 60),
          promptZh: String(item.promptZh || '').slice(0, 2000),
          promptEn: String(item.promptEn || '').slice(0, 2000),
        }))
        .filter(item => item.zh && item.promptZh);
      try {
        mkdirSync(DATA_DIR, { recursive: true });
        writeFileSync(TEMPLATES_FILE, JSON.stringify({ templates: clean, updated_at: Date.now() }, null, 2));
      } catch (error) {
        return fail(`write failed: ${error?.message || error}`, 500, 'io_error');
      }
      return json({ templates: clean });
    }
  }

  // 侧边栏入口：GET 公开读，PUT 需要管理员
  if (head === 'studio-tabs') {
    if (request.method === 'GET') {
      let tabs = DEFAULT_TABS;
      try {
        const parsed = JSON.parse(readFileSync(TABS_FILE, 'utf8'));
        if (Array.isArray(parsed?.tabs) && parsed.tabs.length) tabs = parsed.tabs;
      } catch { /* 没配置就用默认 */ }
      return json({ tabs });
    }
    if (request.method === 'PUT') {
      if (Number(me?.data?.role ?? 0) < 10) return fail('admin permission required', 403, 'forbidden');
      const body = await requestBody(request, 256 * 1024);
      const tabs = Array.isArray(body?.tabs) ? body.tabs.filter(id => typeof id === 'string' && DEFAULT_TABS.includes(id)) : [];
      if (!tabs.length) return fail('keep at least one tab', 400, 'invalid');
      try {
        mkdirSync(DATA_DIR, { recursive: true });
        writeFileSync(TABS_FILE, JSON.stringify({ tabs, updated_at: Date.now() }, null, 2));
      } catch (error) {
        return fail(`write failed: ${error?.message || error}`, 500, 'io_error');
      }
      return json({ tabs });
    }
  }

  // Go 在上面验证当前会话；缺少私有密钥时签发失败关闭。
  if (head === 'ticket') {
    if (request.method !== 'GET') return fail('method not allowed', 405);
    const ticket = sealTicket(bearer);
    return json({ ticket, expires_at: ticketExpiry(ticket) });
  }

  // 附件上传：不落第三方存储，字节留在本进程，公开地址由本路由提供。
  if (head === 'files' && id) {
    const file = files.get(id);
    if (!file || file.owner_id !== userId) return fail('not found', 404);
    return new Response(file.bytes, { headers: { 'Content-Type': file.type, 'Cache-Control': 'no-store' } });
  }

  if (head === 'jobs' && id) {
    const job = jobs.get(id);
    if (!job || job.owner_id !== userId || sessions.get(job.session_id)?.owner_id !== userId) return fail('job not found', 404);
    if (tail === 'events') {
      const since = Number(new URL(request.url).searchParams.get('since') || 0) || 0;
      const events = job.events.slice(since);
      return json({ events, cursor: job.events.length, done: job.done, approved: null });
    }
    return json({ id: job.id, status: job.status });
  }

  if (head === 'sessions' && id) {
    // 前端在会话尚未建立时会用字符串 "null" 发 PATCH，别把它当会话 id 建出来。
    if (id === 'null' || id === 'undefined') {
      return fail('session id is invalid', 400);
    }
    const session = sessions.get(id);
    // 旧无所有者记录保留，但不能由首访用户认领或根据外部 ID 随意创建。
    if (!session || session.owner_id !== userId) return fail('session not found', 404);

    if (!tail) {
      if (request.method === 'PATCH') {
        const body = await requestBody(request);
        if (sessions.get(id) !== session) return fail('session not found', 404);
        if (typeof body?.name === 'string' && body.name.trim()) session.name = body.name.trim().slice(0, 80);
        session.updated_at = now();
        scheduleSave(store());
        return json({ id: session.id, name: session.name });
      }
      if (request.method === 'DELETE') {
        if (session.jobs.some(jobId => { const job = jobs.get(jobId); return job && !job.done; })) return fail('session has running jobs', 409, 'job_running');
        sessions.delete(id);
        for (const jobId of session.jobs) jobs.delete(jobId);
        scheduleSave(store());
        return json({ ok: true });
      }
    }

    if (tail === 'messages') {
      if (request.method === 'GET') return json(session.messages);
      if (request.method === 'PATCH') {
        const body = await requestBody(request);
        if (sessions.get(id) !== session) return fail('session not found', 404);
        if (Array.isArray(body?.messages)) session.messages = body.messages.slice(-200);
        session.updated_at = now();
        scheduleSave(store());
        return json({ ok: true });
      }
    }

    if (tail === 'assets') {
      if (request.method === 'GET') return json(session.assets);
      if (request.method === 'POST') {
        const body = await requestBody(request, 16 * 1024 * 1024);
        if (sessions.get(id) !== session) return fail('session not found', 404);
        const url = typeof body?.url === 'string' ? body.url : '';
        referenceImage(url);
        if (session.assets.length >= 100) return fail('asset limit reached', 409, 'asset_limit');
        const asset = {
          asset_label: uid('asset'),
          url,
          kind: typeof body?.kind === 'string' ? body.kind : 'image',
          source_tool: typeof body?.source_tool === 'string' ? body.source_tool : 'upload',
        };
        session.assets.push(asset);
        scheduleSave(store());
        return json(asset);
      }
    }

    if (tail === 'jobs' && request.method === 'GET') {
      return json(session.jobs.map(jobId => {
        const job = jobs.get(jobId);
        return job ? { id: job.id, status: job.status } : null;
      }).filter(Boolean));
    }

    if (tail === 'chat' && request.method === 'POST') {
      const body = await requestBody(request);
      if (sessions.get(id) !== session) return fail('session not found', 404);
      const message = typeof body?.message === 'string' ? body.message.trim() : '';
      if (!message) return fail('message is required');
      if (message.length > 4000) return fail('message is too long');
      if (body?.canvas_state?.selected_unregistered_image === true) return fail('Selected local images cannot be edited by the assistant yet. Deselect the image to generate a new one.', 400, 'unregistered_reference');

      if ([...jobs.values()].filter(job => job.owner_id === userId && !job.done).length >= 2) return fail('too many running jobs', 429, 'concurrency_limit');
      const job = { owner_id: userId, id: uid('job'), session_id: id, status: 'pending', done: false, events: [] };
      jobs.set(job.id, job);
      session.jobs.push(job.id);
      session.updated_at = now();
      try { persistStore(store()); }
      catch {
        jobs.delete(job.id);
        session.jobs.pop();
        return fail('job could not be saved', 503, 'storage_unavailable');
      }

      // 不阻塞响应：前端拿到 job_id 后自己轮询事件。
      void runJob(job, { cookie, authorization, message, session, canvasState: body?.canvas_state });
      return json({ job_id: job.id });
    }

    if (tail === 'run-skill') return fail('skills are not available in fyt mode', 400, 'unsupported');
  }

  return fail('unknown endpoint', 404);
}
