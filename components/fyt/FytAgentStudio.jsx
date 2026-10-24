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

  const agentApi = useMemo(() => ({
    async getTemplateAgents() { return templates; },
    // fyt 侧没有「用户创建的智能体」，先与模板同源，避免空列表。
    async getUserAgents() { return templates; },
    async getUserConversations() { return []; },
    async getAgentBySlug(_key, slug) {
      const found = templates.find(item => item.agent_id === slug);
      if (!found) throw new Error('AGENT_NOT_FOUND');
      return found;
    },
    async getAgentConversation(_key, _slug, conversationId) {
      return { id: conversationId, history: [] };
    },
    async sendAgentChatMessage(_key, slug, { message }) {
      if (!model || !group) throw new Error('MODEL_UNAVAILABLE');
      const agent = templates.find(item => item.agent_id === slug);
      let content = '';
      await streamChat({
        model,
        group,
        system: agent?.system_prompt || '',
        messages: [{ role: 'user', content: message }],
        onDelta(delta) { content += delta; },
      });
      const requestId = `fyt-${Date.now()}`;
      replies.current.set(requestId, content);
      return { request_id: requestId };
    },
    // 对话已经在上一步拿到完整结果，这里直接返回，不再等待。
    async pollAgentChatResult(_key, requestId) {
      return { messages: [{ role: 'assistant', content: replies.current.get(requestId) || '' }] };
    },
    async createAgent() {
      throw new Error(zh ? 'fyt 暂不支持创建智能体' : 'Creating agents is not available in fyt');
    },
  }), [templates, model, group, zh]);

  if (!userId) return <div className="h-full flex items-center justify-center text-sm text-amber-300">{zh ? '请先登录 fyt。' : 'Sign in with fyt first.'}</div>;

  return <>
    {error && <div className="px-4 py-2 text-xs text-red-300 bg-red-500/10 border-b border-red-500/20">{error}</div>}
    <AgentStudio apiKey="fyt" locale={locale} agentApi={agentApi} navigate={() => {}} />
  </>;
}
