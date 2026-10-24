// fyt 版 creative-agent 最小实现：会话、任务、事件轮询、出图。
//
// 只覆盖画布 AI 的最小闭环：一句话 → 一张图。多步编排、技能、参考图编辑都不做。
// 状态放在模块内存里，服务重启即失效；会话元数据由前端另存 localStorage。

const STORE_KEY = '__fyt_creative_agent_store__';

function store() {
  if (!globalThis[STORE_KEY]) {
    globalThis[STORE_KEY] = { sessions: new Map(), jobs: new Map(), files: new Map() };
  }
  return globalThis[STORE_KEY];
}

const now = () => Date.now();
const uid = prefix => `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

function json(data, status = 200) {
  return Response.json(data, { status });
}

function fail(message, status = 400, code = 'creative_agent_error') {
  return Response.json({ error: { message, code } }, { status });
}

// ── 上游调用 ────────────────────────────────────────────────────────────────

function apiBase() {
  return (process.env.FYT_INTERNAL_API || 'http://api:3000').replace(/\/+$/, '');
}

async function callApi(path, { cookie, authorization, method = 'GET', body } = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(authorization ? { authorization } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

// 模型目录只说明「分组里可用」，不代表渠道真的通。按优先级排一下，
// 生成失败时再依次换下一个，最多试三个。
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
  const target = url.startsWith('/') ? `${apiBase()}${url}` : url;
  const response = await fetch(target, {
    headers: { ...(cookie ? { cookie } : {}), ...(authorization ? { authorization } : {}) },
  });
  if (!response.ok) throw new Error('参考图读取失败');
  return { bytes: await response.arrayBuffer(), type: response.headers.get('content-type') || 'image/png' };
}

async function editImage({ cookie, authorization, model, prompt, assetUrl }) {
  const asset = await fetchAssetBytes({ cookie, authorization, url: assetUrl });
  const form = new FormData();
  form.append('model', model);
  form.append('group', 'default');
  form.append('prompt', prompt);
  form.append('n', '1');
  form.append('image', new Blob([asset.bytes], { type: asset.type }), 'reference.png');
  const response = await fetch(`${apiBase()}/pg/images/edits`, {
    method: 'POST',
    headers: { ...(cookie ? { cookie } : {}), ...(authorization ? { authorization } : {}) },
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

function pushEvent(job, event) {
  job.events.push({ id: uid('ev'), job_id: job.id, ...event });
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

    pushEvent(job, { type: 'text', content: source ? '正在按选中的图片改写…' : '正在把描述整理成提示词…' });
    const prompt = await planPrompt({ cookie, authorization, message, chatModel: models.chat[0] });
    pushEvent(job, { type: 'text', content: `\n\n提示词：${prompt}\n\n` });
    pushEvent(job, { type: 'tool_call', name: source ? 'edit_image' : 'generate_image', args: { prompt } });

    // 渠道不通时换下一个模型，最多三次；失败不扣费，成功即止。
    let url = '';
    let lastError = null;
    for (const model of models.image.slice(0, 3)) {
      try {
        url = source
          ? await editImage({ cookie, authorization, model, prompt, assetUrl: source.url })
          : await generateImage({ cookie, authorization, model, prompt });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!url) throw lastError || new Error('没有可用的图片渠道');
    const label = uid('asset');
    pushEvent(job, {
      type: 'tool_result',
      name: source ? 'edit_image' : 'generate_image',
      result: { ok: true, url, ...(source ? { source_asset_id: source.asset_label } : {}) },
      asset: { url, asset_label: label, kind: 'image', prompt },
    });
    // 登记进会话资产，下一轮才能把它当参考图。
    session.assets.push({ asset_label: label, url, kind: 'image', source_tool: 'agent' });
  } catch (error) {
    pushEvent(job, { type: 'error', message: error?.message || '生成失败' });
  } finally {
    job.status = 'done';
    job.done = true;
  }
}

// ── 路由 ────────────────────────────────────────────────────────────────────

export async function handleCreativeAgent(request, segments) {
  const cookie = request.headers.get('cookie') || '';
  const rawAuth = request.headers.get('authorization') || '';
  // 浏览器可能带着一个过期的 MuAPI 令牌；有 cookie 就以 cookie 为准，
  // 否则 Go 侧会优先用那个无效的 Bearer。
  const authorization = cookie ? '' : (/undefined|null/i.test(rawAuth) ? '' : rawAuth);
  const { sessions, jobs, files } = store();
  const [head, id, tail] = segments;

  if (!head) return fail('unknown endpoint', 404);

  if (head === 'sessions' && !id) {
    if (request.method === 'GET') {
      return json([...sessions.values()].map(s => ({ id: s.id, name: s.name, created_at: s.created_at, updated_at: s.updated_at })));
    }
    if (request.method === 'POST') {
      const session = { id: uid('sess'), name: '新会话', created_at: now(), updated_at: now(), messages: [], assets: [], jobs: [] };
      sessions.set(session.id, session);
      return json(session);
    }
    return fail('method not allowed', 405);
  }

  if (head === 'agent-skills') return json([]);

  // 附件上传：不落第三方存储，字节留在本进程，公开地址由本路由提供。
  if (head === 'files' && id) {
    const file = files.get(id);
    if (!file) return new Response('not found', { status: 404 });
    return new Response(file.bytes, { headers: { 'Content-Type': file.type, 'Cache-Control': 'private, max-age=3600' } });
  }

  if (head === 'jobs' && id) {
    const job = jobs.get(id);
    if (!job) return fail('job not found', 404);
    if (tail === 'events') {
      const since = Number(new URL(request.url).searchParams.get('since') || 0) || 0;
      const events = job.events.slice(since);
      return json({ events, cursor: job.events.length, done: job.done, approved: null });
    }
    return json({ id: job.id, status: job.status });
  }

  if (head === 'sessions' && id) {
    const session = sessions.get(id);
    if (!session) return fail('session not found', 404);

    if (!tail) {
      if (request.method === 'PATCH') {
        const body = await request.json().catch(() => ({}));
        if (typeof body?.name === 'string' && body.name.trim()) session.name = body.name.trim().slice(0, 80);
        session.updated_at = now();
        return json({ id: session.id, name: session.name });
      }
      if (request.method === 'DELETE') {
        sessions.delete(id);
        return json({ ok: true });
      }
    }

    if (tail === 'messages') {
      if (request.method === 'GET') return json({ messages: session.messages });
      if (request.method === 'PATCH') {
        const body = await request.json().catch(() => ({}));
        if (Array.isArray(body?.messages)) session.messages = body.messages.slice(-200);
        session.updated_at = now();
        return json({ ok: true });
      }
    }

    if (tail === 'assets') {
      if (request.method === 'GET') return json(session.assets);
      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const url = typeof body?.url === 'string' ? body.url : '';
        if (!url) return fail('url is required');
        const asset = {
          asset_label: `asset_${session.assets.length + 1}`,
          url,
          kind: typeof body?.kind === 'string' ? body.kind : 'image',
          source_tool: typeof body?.source_tool === 'string' ? body.source_tool : 'upload',
        };
        session.assets.push(asset);
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
      const body = await request.json().catch(() => ({}));
      const message = typeof body?.message === 'string' ? body.message.trim() : '';
      if (!message) return fail('message is required');
      if (message.length > 4000) return fail('message is too long');

      const job = { id: uid('job'), session_id: id, status: 'pending', done: false, events: [] };
      jobs.set(job.id, job);
      session.jobs.push(job.id);
      session.updated_at = now();

      // 不阻塞响应：前端拿到 job_id 后自己轮询事件。
      void runJob(job, { cookie, authorization, message, session, canvasState: body?.canvas_state });
      return json({ job_id: job.id });
    }

    if (tail === 'run-skill') return fail('skills are not available in fyt mode', 400, 'unsupported');
  }

  return fail('unknown endpoint', 404);
}
