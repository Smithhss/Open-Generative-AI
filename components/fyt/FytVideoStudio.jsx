'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { VideoStudio } from 'studio';
import { authenticatedScope, getChatGroups } from '@/lib/fyt/chat.mjs';
import FytModelPicker from '@/components/fyt/FytModelPicker';
import FytTemplateBar from '@/components/fyt/FytTemplateBar';
import {
  VIDEO_DURATIONS,
  VIDEO_SIZES,
  clearVideoTask,
  createFytVideo,
  fetchFytVideo,
  fytVideoContentUrl,
  getVideoModels,
  isSuccessStatus,
  isTerminalStatus,
  loadVideoTask,
  saveVideoTask,
} from '@/lib/fyt/videos.mjs';

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 只负责「参数 + 生成」：界面与画廊全部交给原版 VideoStudio。
export default function FytVideoStudio({ locale, userId, active, onSettled }) {
  const zh = locale === 'zh';
  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState('');
  const [models, setModels] = useState([]);
  const [capabilities, setCapabilities] = useState({});
  const [model, setModel] = useState('');
  const [seconds, setSeconds] = useState(VIDEO_DURATIONS[0]);
  const [size, setSize] = useState(VIDEO_SIZES[0]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [resumed, setResumed] = useState(null);
  const abort = useRef(null);

  const copy = useCallback((code) => {
    if (code === 'AUTH_REQUIRED') return zh ? '请先登录 fyt。' : 'Sign in with fyt first.';
    if (code === 'INVALID_VIDEO_REQUEST') return zh ? '请填写提示词并选择模型。' : 'Pick a model and enter a prompt.';
    return zh
      ? '请求未完成，请检查额度、渠道或日志。系统不会自动重发，中断不代表未扣费。'
      : 'Request incomplete. Check balance, channel and logs. No automatic retry; interruption does not imply no charge.';
  }, [zh]);

  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    if (!userId || !active) return undefined;
    const controller = new AbortController();
    getChatGroups({ signal: controller.signal })
      .then(values => {
        if (controller.signal.aborted) return;
        setGroups(values);
        setGroup(previous => (values.some(item => item.name === previous) ? previous : values[0]?.name || ''));
      })
      .catch(cause => { if (!controller.signal.aborted) setError(copy(cause?.message)); });
    return () => controller.abort();
  }, [userId, active, copy]);

  useEffect(() => {
    setModels([]); setModel('');
    if (!group || !userId || !active) return undefined;
    const controller = new AbortController();
    getVideoModels({ group, signal: controller.signal })
      .then(({ models: values, capabilities: caps }) => {
        if (controller.signal.aborted) return;
        setModels(values);
        setCapabilities(caps);
        setModel(values[0] || '');
      })
      .catch(cause => { if (!controller.signal.aborted) setError(copy(cause?.message)); });
    return () => controller.abort();
  }, [group, userId, active, copy]);

  // 刷新后按任务编号续查：结果放在胶囊行，点开即用；不重复提交。
  const restored = useRef(false);
  useEffect(() => {
    if (!userId || !active || restored.current) return;
    restored.current = true;
    const saved = loadVideoTask(userId);
    if (!saved) return;
    setResumed(saved);
    setStatus(saved.status);
    if (isTerminalStatus(saved.status)) return;
    const controller = new AbortController(); abort.current = controller;
    (async () => {
      setRunning(true);
      try {
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (!controller.signal.aborted && Date.now() < deadline) {
          const result = await fetchFytVideo(saved.id, { signal: controller.signal });
          setStatus(result.status);
          saveVideoTask(userId, { id: saved.id, model: saved.model, status: result.status });
          if (isTerminalStatus(result.status)) break;
          await sleep(POLL_INTERVAL_MS);
        }
      } catch { /* 轮询失败保留上一次状态，不自动重发 */ }
      finally { if (!controller.signal.aborted) { setRunning(false); onSettled?.(); } }
    })();
  }, [userId, active, onSettled]);

  // 播放地址需要鉴权，<video src> 带不了请求头，所以取回字节换成本地 blob。
  async function localizeVideo(id) {
    const path = fytVideoContentUrl(id);
    try {
      const scope = await authenticatedScope();
      try {
        const response = await fetch(path, { ...scope.init });
        if (!response.ok) return path;
        const blob = await response.blob();
        if (!blob.size) return path;
        return URL.createObjectURL(blob);
      } finally { scope.close(); }
    } catch {
      return path;
    }
  }

  // 提交并等待终态：原版画廊需要最终地址才能渲染。
  async function generate({ prompt }) {
    if (running || !model || !group || !userId || !prompt) throw new Error('INVALID_VIDEO_REQUEST');
    setError(''); setStatus(''); setResumed(null); setRunning(true);
    clearVideoTask(userId);
    const controller = new AbortController(); abort.current = controller;
    try {
      const created = await createFytVideo({ model, group, prompt, seconds, size }, { signal: controller.signal });
      saveVideoTask(userId, { id: created.id, model: created.model || model, status: created.status });
      setStatus(created.status);
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
        const result = await fetchFytVideo(created.id, { signal: controller.signal });
        setStatus(result.status);
        saveVideoTask(userId, { id: created.id, model: created.model || model, status: result.status });
        if (isSuccessStatus(result.status)) {
          return { id: created.id, url: await localizeVideo(created.id), model: created.model || model };
        }
        if (isTerminalStatus(result.status)) throw new Error('VIDEO_TASK_FAILED');
      }
      throw new Error('VIDEO_TASK_TIMEOUT');
    } finally {
      setRunning(false);
      if (!controller.signal.aborted) onSettled?.();
    }
  }

  const pill = 'rounded-full border border-white/10 bg-[#151515] px-3 py-1.5 text-xs text-white/85 transition-colors hover:border-white/25 disabled:opacity-40 disabled:hover:border-white/10';
  // 时长与分辨率由服务端 capabilities 下发；模型没声明时退回内置常量。
  const durations = capabilities[model]?.durations?.length ? capabilities[model].durations : VIDEO_DURATIONS;
  const sizes = capabilities[model]?.sizes?.length ? capabilities[model].sizes : VIDEO_SIZES;
  const statusLabel = status === 'queued' ? (zh ? '排队中' : 'Queued')
    : status === 'in_progress' ? (zh ? '生成中' : 'Running')
    : status === 'completed' ? (zh ? '已完成' : 'Done')
    : status === 'failed' ? (zh ? '失败' : 'Failed') : '';

  const controls = <>
    <select aria-label={zh ? '视频分组' : 'Video group'} className={pill} value={group} disabled={!userId || running} onChange={event => setGroup(event.target.value)}>
      {!groups.length && <option value="">{zh ? '无可用分组' : 'No group'}</option>}
      {groups.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
    </select>
    <FytModelPicker models={models} capabilities={{}} value={model} onChange={setModel}
      disabled={!userId || running || !models.length} zh={zh} />
    <select aria-label={zh ? '时长' : 'Duration'} className={pill} value={seconds} disabled={running} onChange={event => setSeconds(Number(event.target.value))}>
      {durations.map(value => <option key={value} value={value}>{value}s</option>)}
    </select>
    <select aria-label={zh ? '分辨率' : 'Resolution'} className={pill} value={size} disabled={running} onChange={event => setSize(event.target.value)}>
      {sizes.map(value => <option key={value} value={value}>{value}</option>)}
    </select>
    {statusLabel && <span className="text-[11px] text-white/35">{statusLabel}</span>}
    {resumed && isSuccessStatus(status) && <a className={`${pill} text-cyan-300`} href={fytVideoContentUrl(resumed.id)} download>{zh ? '下载上次结果' : 'Download last'}</a>}
    {error && <span className="text-[11px] text-red-300/90">{error}</span>}
  </>;

  return <VideoStudio locale={locale} previewMode persistenceId={userId}
    fytVideo={{
      enabled: Boolean(userId && group && model && models.length && !running),
      // 输入框上方的模板入口
      renderTemplates: ({ onPick }) => <FytTemplateBar kind="video" zh={zh} onPick={onPick} />,
      controls,
      generate,
      onError: cause => setError(copy(cause?.message)),
    }} />;
}
