'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getChatGroups, getChatModels, selectChatModel, streamChat } from '@/lib/fyt/chat.mjs';
import { readChatHistory, saveChatHistory, trimChatContext } from '@/lib/fyt/chat-history.mjs';
import { AGENT_TEMPLATES } from '@/lib/fyt/agent-templates.mjs';

const field = 'rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50 disabled:opacity-40';
const button = 'rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:opacity-40';
function errorCopy(error, zh) {
  const code = error?.message || '';
  if (code === 'AUTH_REQUIRED') return zh ? '登录已过期，请使用右上角重新登录。' : 'Session expired. Sign in again using the account controls.';
  if (code.includes('429')) return zh ? '请求过于频繁，请稍后手动重试。' : 'Too many requests. Try again later.';
  if (code.includes('403')) return zh ? '当前账号没有此项权限，请检查分组或联系管理员。' : 'This account does not have access. Check the group or contact an administrator.';
  if (code.includes('402')) return zh ? '额度不足，请前往控制台检查。' : 'Insufficient credit. Check the console.';
  if (code.includes('404')) return zh ? '当前预发接口不可用，请联系管理员核实版本。' : 'This API is unavailable on the current staging version.';
  return zh ? '请求未完成。请检查网络、模型或控制台日志；系统未自动重发。' : 'Request incomplete. Check the connection, model or console logs. No automatic retry was made.';
}

export default function FytAgentStudio({ locale, userId, enabled, onSettled }) {
  const zh = locale === 'zh';
  const lang = zh ? 'zh' : 'en';
  const [groups, setGroups] = useState([]);
  const [models, setModels] = useState([]);
  const [group, setGroup] = useState('');
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [list, setList] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [notice, setNotice] = useState('');
  const [running, setRunning] = useState(false);
  const [reasoning, setReasoning] = useState('');
  const [requestId, setRequestId] = useState('');
  const run = useRef(null);
  const end = useRef(null);
  const listRef = useRef([]);
  const historyWritable = useRef(true);
  const historyLoaded = useRef(false);
  const alive = useRef(true);
  const active = list.find(c => c.id === activeId);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; run.current?.abort(); };
  }, []);
  const updateList = useCallback(fn => {
    const next = fn(listRef.current);
    listRef.current = next;
    setList(next);
  }, []);
  useEffect(() => {
    if (userId) {
      try {
        const saved = readChatHistory(window.localStorage, userId);
        listRef.current = saved; setList(saved); setActiveId(saved[0]?.id || '');
      } catch { historyWritable.current = false; setSaveError(true); setStorageBlocked(true); }
    }
    historyLoaded.current = true;
    setReady(true);
  }, [userId]);
  useEffect(() => {
    if (!ready || !userId || storageBlocked) return;
    const timer = setTimeout(() => {
      try { saveChatHistory(window.localStorage, userId, list); setSaveError(false); }
      catch { setSaveError(true); }
    }, 350);
    return () => clearTimeout(timer);
  }, [ready, userId, list, storageBlocked]);
  useEffect(() => () => {
    // Preserve the last visible partial response if navigation or sign-out unmounts us.
    if (userId && historyLoaded.current && historyWritable.current) {
      try { saveChatHistory(window.localStorage, userId, listRef.current); } catch { /* The live page already shows storage failures. */ }
    }
  }, [userId]);

  useEffect(() => {
    if (!enabled || !userId) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    getChatGroups({ signal: controller.signal }).then(values => {
      if (controller.signal.aborted) return;
      setGroups(values);
      setGroup(previous => values.some(g => g.name === previous) ? previous : values.find(g => g.name === listRef.current[0]?.group)?.name || values[0]?.name || '');
      if (!values.length) setError(zh ? '没有可用分组。' : 'No available groups.');
    }).catch(e => { if (!controller.signal.aborted) setError(errorCopy(e, zh)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [enabled, userId, retry, zh]);
  useEffect(() => {
    setModels([]); setModel('');
    if (!group || !userId) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    getChatModels({ group, signal: controller.signal }).then(values => {
      if (controller.signal.aborted) return;
      setModels(values);
      const conversation = listRef.current.find(c => c.id === activeId);
      const previous = conversation?.model;
      const valid = conversation?.group === group && values.includes(previous);
      const needsChoice = Boolean(conversation && (previous || conversation.messages.length));
      setModel(selectChatModel(values, conversation, group));
      if (!valid && needsChoice) setNotice(zh ? '原模型在当前分组不可用，请重新选择；系统不会替换为其他模型。' : 'The original model is unavailable in this group. Select a model explicitly; none was substituted.');
      if (!values.length) setError(zh ? '此分组没有已声明支持聊天的模型。' : 'No declared chat models in this group.');
    }).catch(e => { if (!controller.signal.aborted) setError(errorCopy(e, zh)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // Changing conversations in the same group is handled by openConversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, userId, retry, zh]);
  useEffect(() => { if (enabled) end.current?.scrollIntoView({ block: 'nearest' }); }, [active?.messages, reasoning, enabled]);

  function createConversation(template) {
    if (running) return;
    const conversation = { id: crypto.randomUUID(), title: template.name[lang], model, group,
      templateId: template.id, system: template.system[lang], messages: [], updatedAt: Date.now() };
    updateList(previous => [conversation, ...previous].slice(0, 20));
    setActiveId(conversation.id); setInput(''); setError(''); setNotice(''); setReasoning(''); setRequestId('');
  }
  function openConversation(conversation) {
    if (running) return;
    setActiveId(conversation.id); setInput(''); setError(''); setReasoning(''); setRequestId('');
    if (groups.some(g => g.name === conversation.group)) {
      setGroup(conversation.group);
      setModel(conversation.group === group && models.includes(conversation.model) ? conversation.model : '');
    } else setModel('');
  }
  function changeSetting(name, value) {
    updateList(previous => previous.map(c => c.id === activeId ? { ...c, [name]: value, updatedAt: Date.now() } : c));
  }
  async function send(regenerate = false) {
    if (run.current || running || !userId || !active || !model || !group || loading) return;
    let prompt = input.trim();
    let previous = active.messages;
    if (regenerate) {
      if (!window.confirm(zh ? '重新生成会再次消耗额度，是否继续？' : 'Regenerating uses credit again. Continue?')) return;
      const lastUser = previous.findLastIndex(m => m.role === 'user');
      if (lastUser < 0) return;
      prompt = previous[lastUser].content; previous = previous.slice(0, lastUser);
    }
    if (!prompt || prompt.length > 6000) return;
    const context = trimChatContext(previous, active.system, prompt);
    const controller = new AbortController();
    run.current = controller;
    const id = active.id; const assistantId = crypto.randomUUID();
    const isCurrent = () => alive.current && run.current === controller;
    let content = ''; let thought = ''; let overLimit = false;
    const patch = status => {
      if (!isCurrent()) return;
      updateList(values => values.map(c => c.id === id ? { ...c, updatedAt: Date.now(), messages: c.messages.map(m => m.id === assistantId ? { ...m, content, status } : m) } : c));
    };
    updateList(values => values.map(c => c.id === id ? { ...c, model, group, updatedAt: Date.now(),
      messages: [...previous.slice(-38), { id: crypto.randomUUID(), role: 'user', content: prompt, status: 'complete' },
        { id: assistantId, role: 'assistant', content: '', status: 'streaming' }] } : c));
    setRunning(true); setInput(''); setError(''); setReasoning(''); setRequestId('');
    setNotice(context.trimmed ? (zh ? '较早的完整轮次已从本次上下文中省略。' : 'Older complete turns were omitted from this request.') : '');
    try {
      const result = await streamChat({ model, group, system: active.system, messages: context.messages, signal: controller.signal,
        onDelta(delta) {
          if (!isCurrent()) return;
          if (content.length + thought.length + delta.content.length + delta.reasoning.length > 200000) {
            overLimit = true; controller.abort(); return;
          }
          content += delta.content; thought += delta.reasoning;
          setReasoning(thought); patch('streaming');
        } });
      if (!isCurrent()) return;
      setRequestId(result.requestId || '');
      patch(result.completed ? 'complete' : 'interrupted');
      if (!result.completed) setError(zh ? '连接已结束，但未收到完成标记。部分回答已保留。' : 'Connection ended without a completion signal. Partial answer retained.');
    } catch (e) {
      if (!isCurrent()) return;
      patch(controller.signal.aborted ? 'stopped' : 'error');
      setError(overLimit ? (zh ? '回答超过页面长度限制，已停止等待并保留已接收部分。实际扣费请查看消费日志。' : 'Response exceeded the page limit. Stopped waiting and retained the received portion; check usage logs.') : controller.signal.aborted ? (zh ? '已停止等待。上游可能仍在处理，实际扣费请查看消费日志。' : 'Stopped waiting. The provider may still process this request; check usage logs.') : errorCopy(e, zh));
    } finally {
      if (isCurrent()) { run.current = null; setRunning(false); onSettled?.(); }
    }
  }

  return <div className="h-full flex flex-col lg:flex-row text-white">
    <aside className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-white/5 p-4 overflow-y-auto max-h-48 lg:max-h-none">
      <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-bold">{zh ? '我的对话' : 'My chats'}</h2><button className={button} disabled={running} onClick={() => createConversation(AGENT_TEMPLATES[0])}>{zh ? '新对话' : 'New chat'}</button></div>
      <p className="text-xs text-white/35 mb-3">{zh ? '仅保存在当前浏览器，最多20个对话。' : 'Saved in this browser only, up to 20 chats.'}</p>
      <div className="flex lg:flex-col gap-2">{list.map(c => <button key={c.id} disabled={running} onClick={() => openConversation(c)} className={`text-left rounded-xl px-3 py-3 text-xs truncate shrink-0 lg:shrink border ${c.id === activeId ? 'border-cyan-400/30 bg-cyan-400/5 text-cyan-300' : 'border-white/5 text-white/50 hover:bg-white/5'}`}>{c.title || (zh ? '新对话' : 'New chat')}</button>)}</div>
    </aside>
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="border-b border-white/5 p-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-cyan-300 mr-2">{zh ? '文本助手' : 'Text assistants'}</span>
        <label className="text-xs text-white/50">{zh ? '分组' : 'Group'} <select aria-label={zh ? '分组' : 'Group'} className={`${field} max-w-36`} value={group} disabled={running || !userId} onChange={e => setGroup(e.target.value)}><option value="">{zh ? '选择分组' : 'Choose group'}</option>{groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}</select></label>
        <label className="text-xs text-white/50">{zh ? '模型' : 'Model'} <select aria-label={zh ? '模型' : 'Model'} className={`${field} max-w-64`} value={model} disabled={running || loading || !userId} onChange={e => setModel(e.target.value)}><option value="">{loading ? (zh ? '读取中…' : 'Loading…') : (zh ? '选择模型' : 'Choose model')}</option>{models.map(m => <option key={m}>{m}</option>)}</select></label>
        <button className={button} disabled={running || loading || !userId} onClick={() => setRetry(n => n + 1)}>{zh ? '刷新模型' : 'Refresh models'}</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-7">
        {!active || !active.messages.length ? <div className="max-w-3xl mx-auto py-6">
          <h1 className="text-2xl md:text-3xl font-black mb-2">{zh ? '选择助手，开始创作' : 'Choose an assistant. Start creating.'}</h1>
          <p className="text-sm text-white/40 mb-6">{zh ? '使用 fyt 文本模型。这里生成文字，不执行工具或生成媒体。' : 'Powered by fyt text models. Text only; no tools or media generation.'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{AGENT_TEMPLATES.map(t => <button key={t.id} disabled={running} onClick={() => createConversation(t)} className={`rounded-2xl border p-5 text-left hover:border-cyan-400/40 bg-white/[0.02] ${active?.templateId === t.id ? 'border-cyan-400/40' : 'border-white/10'}`}><span className="block text-sm font-bold mb-2 text-cyan-300">{t.name[lang]}</span><span className="text-xs text-white/40">{t.description[lang]}</span></button>)}</div>
        </div> : <div className="max-w-3xl mx-auto space-y-5">{active.messages.map(m => <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-full md:max-w-[90%] rounded-2xl px-4 py-3 text-sm break-words ${m.role === 'user' ? 'bg-cyan-400 text-black whitespace-pre-wrap' : 'bg-white/[0.04] border border-white/5 text-white/90'}`}>
          {m.role === 'user' ? m.content : <div className="prose prose-invert prose-sm max-w-none [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{m.content || (m.status === 'streaming' ? (zh ? '正在等待回答…' : 'Waiting for response…') : (zh ? '未收到回答' : 'No response received'))}</ReactMarkdown></div>}
          {m.role === 'assistant' && m.status !== 'complete' && <p className="text-xs opacity-50 mt-2">{m.status === 'streaming' ? (zh ? '生成中' : 'Generating') : (zh ? '未完整完成，不带入下轮上下文' : 'Incomplete; excluded from the next context')}</p>}
        </div></div>)}</div>}
        {reasoning && <details className="max-w-3xl mx-auto mt-4 text-xs text-white/40"><summary className="cursor-pointer">{zh ? '本轮推理内容（不保存）' : 'This turn’s reasoning (not saved)'}</summary><pre className="whitespace-pre-wrap mt-2">{reasoning}</pre></details>}
        <div ref={end} />
      </div>
      <div className="p-4 md:px-7 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          {active && <details className="mb-3 text-xs text-white/40"><summary className="cursor-pointer">{zh ? '编辑角色与系统提示词' : 'Edit role and system prompt'}</summary><div className="mt-2 space-y-2"><input aria-label={zh ? '角色名称' : 'Role name'} className={`${field} w-full`} value={active.title} maxLength={80} disabled={running} onChange={e => changeSetting('title', e.target.value)} /><textarea aria-label={zh ? '系统提示词' : 'System prompt'} className={`${field} w-full`} value={active.system} maxLength={4000} rows={3} disabled={running} onChange={e => changeSetting('system', e.target.value)} /></div></details>}
          {saveError && <p role="alert" className="text-xs text-amber-300 mb-2">{zh ? '本机历史读取或保存失败；本轮内容可能未保存。原数据未被清除。' : 'Local history could not be read or saved. This turn may not be saved; existing data was not cleared.'}</p>}
          {error && <p role="alert" className="text-xs text-red-300 mb-2">{error}</p>}
          {notice && <p className="text-xs text-amber-300 mb-2">{notice}</p>}
          {!userId && <p className="text-xs text-cyan-300 mb-2">{zh ? '请先使用右上角登录 fyt。' : 'Sign in with fyt using the account controls first.'}</p>}
          <form onSubmit={e => { e.preventDefault(); void send(); }} className="rounded-2xl border border-white/10 bg-[#0b0b0d] p-3">
            <textarea aria-label={zh ? '消息' : 'Message'} className="w-full resize-none bg-transparent outline-none text-sm text-white/90 placeholder:text-white/25 disabled:opacity-40" rows={3} maxLength={6000} value={input} disabled={!userId || running} placeholder={active ? (zh ? '描述你的需求…' : 'Describe what you need…') : (zh ? '先选择上方助手或新建对话' : 'Choose an assistant or start a new chat first')} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
            <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-white/30">{zh ? '发送将消耗 fyt 额度 · Shift+Enter 换行' : 'Sending uses fyt credit · Shift+Enter for a new line'}</span>{running ? <button type="button" className={button} onClick={() => run.current?.abort()}>{zh ? '停止' : 'Stop'}</button> : <div className="flex gap-2">{active?.messages.length > 0 && <button type="button" className={button} disabled={!model || loading || !userId} onClick={() => void send(true)}>{zh ? '重新生成' : 'Regenerate'}</button>}<button className="rounded-xl bg-cyan-400 text-black font-bold text-xs px-5 py-2 disabled:opacity-30" disabled={!active || !input.trim() || !model || loading || !userId}>{zh ? '发送' : 'Send'}</button></div>}</div>
          </form>
          <div className="text-[11px] text-white/30 mt-2 flex flex-wrap gap-2"><a className="hover:text-cyan-300" href="/console/logs">{zh ? '实际扣费请查看控制台消费日志' : 'Check console usage logs for actual charges'}</a>{requestId && <span>{zh ? '请求号：' : 'Request: '}{requestId}</span>}</div>
        </div>
      </div>
    </div>
  </div>;
}
