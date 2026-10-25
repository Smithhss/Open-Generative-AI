'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentStudio } from 'studio';
import { getChatGroups, getChatModels, selectChatModel, streamChat } from '@/lib/fyt/chat.mjs';
import { AGENT_TEMPLATES } from '@/lib/fyt/agent-templates.mjs';

// 原版 AgentStudio 的数据层是 MuAPI 智能体平台；fyt 没有那套后端，
// 这里用模板 + /pg/chat/completions 顶上，界面完全交给原版。
export default function FytAgentStudio({ locale, userId, enabled }) {
  const zh = locale === 'zh';
  const [group, setGroup] = useState('');
  const [model, setModel] = useState('');
  const [error, setError] = useState('');
  const replies = useRef(new Map());

  useEffect(() => {
    if (!userId || !enabled) return undefined;
    const controller = new AbortController();
    (async () => {
      try {
        const groups = await getChatGroups({ signal: controller.signal });
        const name = groups[0]?.name || '';
        if (controller.signal.aborted) return;
        setGroup(name);
        if (!name) return;
        const models = await getChatModels({ group: name, signal: controller.signal });
        if (controller.signal.aborted) return;
        setModel(selectChatModel(models, null, name) || models[0] || '');
      } catch {
        if (!controller.signal.aborted) setError(zh ? '模型读取失败' : 'Failed to load models');
      }
    })();
    return () => controller.abort();
  }, [userId, enabled, zh]);

  const templates = useMemo(() => AGENT_TEMPLATES.map(item => ({
    agent_id: item.id,
    slug: item.id,
    name: item.name[zh ? 'zh' : 'en'],
    description: item.description[zh ? 'zh' : 'en'],
    category: zh ? '模板' : 'Template',
    icon_url: null,
    system_prompt: item.system[zh ? 'zh' : 'en'],
  })), [zh]);

  const agentApi = useMemo(() => {
    const storageKey = `fyt.agent.conversations.${userId || 'anon'}`;
    const read = () => {
      try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
    };
    const write = list => {
      try { localStorage.setItem(storageKey, JSON.stringify(list.slice(0, 50))); } catch { /* 隐私模式忽略 */ }
    };
    const upsert = conv => {
      const list = read();
      const index = list.findIndex(item => item.id === conv.id);
      if (index >= 0) list[index] = conv; else list.unshift(conv);
      write(list);
    };

    return {
      async getTemplateAgents() { return templates; },
      // fyt 侧没有「用户创建的智能体」，先与模板同源，避免空列表。
      async getUserAgents() { return templates; },
      async getUserConversations() {
        return read().map(item => ({ id: item.id, agent_slug: item.agent_slug, title: item.title, updated_at: item.updated_at }));
      },
      async getAgentBySlug(_key, slug) {
        const found = templates.find(item => item.agent_id === slug);
        if (!found) throw new Error('AGENT_NOT_FOUND');
        return found;
      },
      async getAgentConversation(_key, _slug, conversationId) {
        const conv = read().find(item => item.id === conversationId);
        return { id: conversationId, history: conv?.messages || [] };
      },
      async sendAgentChatMessage(_key, slug, { message, conversationId }) {
        if (!model || !group) throw new Error('MODEL_UNAVAILABLE');
        const agent = templates.find(item => item.agent_id === slug);
        const list = read();
        const existing = conversationId ? list.find(item => item.id === conversationId) : null;
        const history = existing?.messages || [];
        // 带上前几轮，模型才接得住「再改一下」这类追问。
        const context = [...history.slice(-10), { role: 'user', content: message }];
        let content = '';
        await streamChat({
          model,
          group,
          system: agent?.system_prompt || '',
          messages: context,
          onDelta(delta) { content += delta; },
        });
        const conv = {
          id: existing?.id || `conv_${Date.now().toString(36)}`,
          agent_slug: slug,
          title: existing?.title || message.slice(0, 24),
          updated_at: Date.now(),
          messages: [...context, { role: 'assistant', content }],
        };
        upsert(conv);
        const requestId = `fyt-${Date.now()}`;
        replies.current.set(requestId, { content, conversationId: conv.id });
        return { request_id: requestId };
      },
      // 对话已经在上一步拿到完整结果，这里直接返回，不再等待。
      async pollAgentChatResult(_key, requestId) {
        const stored = replies.current.get(requestId) || { content: '', conversationId: null };
        return {
          messages: [{ role: 'assistant', content: stored.content }],
          conversation_id: stored.conversationId,
        };
      },
      async createAgent() {
        throw new Error(zh ? 'fyt 暂不支持创建智能体' : 'Creating agents is not available in fyt');
      },
    };
  }, [templates, model, group, zh, userId]);

  if (!userId) return <div className="h-full flex items-center justify-center text-sm text-amber-300">{zh ? '请先登录 fyt。' : 'Sign in with fyt first.'}</div>;

  return <>
    {error && <div className="px-4 py-2 text-xs text-red-300 bg-red-500/10 border-b border-red-500/20">{error}</div>}
    <AgentStudio apiKey="fyt" locale={locale} agentApi={agentApi} navigate={() => {}} />
  </>;
}
