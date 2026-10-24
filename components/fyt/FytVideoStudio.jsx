'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getChatGroups } from '@/lib/fyt/chat.mjs';
import { modelOptions } from '@/lib/fyt/model-alias.mjs';
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

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 200;

export default function FytVideoStudio({ locale, userId, active, onSettled }) {
  const zh = locale === 'zh';
  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState('');
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [seconds, setSeconds] = useState(VIDEO_DURATIONS[0]);
  const [size, setSize] = useState(VIDEO_SIZES[0]);
  const [imageUrl, setImageUrl] = useState('');
  const [task, setTask] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const pollTimer = useRef(null);
  const abort = useRef(null);

  const copy = useCallback((code) => {
    if (code === 'AUTH_REQUIRED') return zh ? '请先登录 fyt。' : 'Sign in with fyt first.';
    if (code === 'INVALID_VIDEO_REQUEST') return zh ? '请填写提示词并选择模型。' : 'Pick a model and enter a prompt.';
    return zh
      ? '请求未完成，请检查额度、渠道或日志。系统不会自动重发，中断不代表未扣费。'
      : 'Request incomplete. Check balance, channel and logs. No automatic retry; interruption does not imply no charge.';
  }, [zh]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; }
  }, []);

  useEffect(() => () => { stopPolling(); abort.current?.abort(); }, [stopPolling]);

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
    // 复用图片同一套模型目录接口，只把 type 换成 video。
    getVideoModels({ group, signal: controller.signal })
      .then(values => {
        if (controller.signal.aborted) return;
        setModels(values);
        setModel(values[0] || '');
      })
      .catch(cause => { if (!controller.signal.aborted) setError(copy(cause?.message)); });
    return () => controller.abort();
  }, [group, userId, active, copy]);

  const poll = useCallback(async (taskId, modelName) => {
    let count = 0;
    const tick = async () => {
      count += 1;
      try {
        const result = await fetchFytVideo(taskId);
        setStatus(result.status);
        saveVideoTask(userId, { id: taskId, model: modelName, status: result.status });
        if (isTerminalStatus(result.status)) {
          setRunning(false);
          stopPolling();
          onSettled?.();
          return;
        }
      } catch (cause) {
        setError(copy(cause?.message));
      }
      if (count >= MAX_POLLS) { setRunning(false); stopPolling(); return; }
      pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
    };
    await tick();
  }, [copy, onSettled, stopPolling, userId]);

  // 刷新后按任务编号续查：已结束的任务直接展示结果，未结束的继续轮询。
  const restored = useRef(false);
  useEffect(() => {
    if (!userId || !active || restored.current) return;
    restored.current = true;
    const saved = loadVideoTask(userId);
    if (!saved) return;
    setTask({ id: saved.id, model: saved.model });
    setStatus(saved.status);
    if (!isTerminalStatus(saved.status)) {
      setRunning(true);
      poll(saved.id, saved.model);
    }
  }, [userId, active, poll]);

  async function generate() {
    if (running || !model || !group || !userId) return;
    setError(''); setTask(null); setStatus(''); setRunning(true);
    clearVideoTask(userId);
    const controller = new AbortController(); abort.current = controller;
    try {
      const created = await createFytVideo({ model, group, prompt, seconds, size, imageUrl: imageUrl.trim() || undefined }, { signal: controller.signal });
      setTask(created);
      setStatus(created.status);
      saveVideoTask(userId, { id: created.id, model: created.model || model, status: created.status });
      poll(created.id, created.model || model);
    } catch (cause) {
      setRunning(false);
      setError(copy(cause?.message));
    }
  }

  // 与原版画布同一套视觉：深色底、圆角胶囊、底部提示词条。
  const pill = 'rounded-full border border-white/10 bg-[#151515] px-3 py-1.5 text-xs text-white/85 transition-colors hover:border-white/25 disabled:opacity-40 disabled:hover:border-white/10';
  const done = task && isSuccessStatus(status);
  const failed = task && isTerminalStatus(status) && !isSuccessStatus(status);

  return <div className="h-full flex flex-col bg-black">
    <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 border-b border-white/5">
      <select aria-label={zh ? '视频分组' : 'Video group'} className={pill} value={group} disabled={!userId || running} onChange={event => setGroup(event.target.value)}>
        {!groups.length && <option value="">{zh ? '无可用分组' : 'No group'}</option>}
        {groups.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
      </select>
      <select aria-label={zh ? '视频模型' : 'Video model'} className={pill} value={model} disabled={!userId || running || !models.length} onChange={event => setModel(event.target.value)}>
        {!models.length && <option value="">{zh ? '当前分组无视频模型' : 'No video model'}</option>}
        {modelOptions(models).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <select aria-label={zh ? '时长' : 'Duration'} className={pill} value={seconds} disabled={running} onChange={event => setSeconds(Number(event.target.value))}>
        {VIDEO_DURATIONS.map(value => <option key={value} value={value}>{value}s</option>)}
      </select>
      <select aria-label={zh ? '分辨率' : 'Resolution'} className={pill} value={size} disabled={running} onChange={event => setSize(event.target.value)}>
        {VIDEO_SIZES.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      {task && <span className="text-[11px] text-white/35">{status === 'queued' ? (zh ? '排队中' : 'Queued') : status === 'in_progress' ? (zh ? '生成中' : 'Running') : status === 'completed' ? (zh ? '已完成' : 'Done') : status === 'failed' ? (zh ? '失败' : 'Failed') : status}</span>}
    </div>

    <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
      {!task && <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 text-white/30">
        <p className="text-sm">{zh ? '描述一个镜头，生成一段视频' : 'Describe a shot to generate a video'}</p>
        <p className="text-[11px] text-white/20">{zh ? '任务异步执行，刷新页面会按任务编号继续查询' : 'Runs asynchronously; reload resumes by task id'}</p>
      </div>}

      {task && !done && !failed && <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-[#0b0b0d] text-white/40">
        <span className="text-sm">{zh ? '生成中，通常需要几分钟' : 'Generating, usually a few minutes'}</span>
        <span className="text-[11px] text-white/25">{task.id}</span>
      </div>}

      {failed && <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-300">
        {zh ? '任务未完成，按服务端规则退款；可换个模型或稍后重试。' : 'Task did not complete; refunded per server rules.'}
      </div>}

      {done && <figure className="rounded-2xl border border-white/10 bg-[#0b0b0d] p-3">
        <figcaption className="flex items-center justify-between text-[11px] text-white/40 mb-2">
          <span>{task.id}</span>
          <a className="text-cyan-300/90 hover:underline" href={fytVideoContentUrl(task.id)} download>{zh ? '下载' : 'Download'}</a>
        </figcaption>
        <video className="w-full rounded-xl" controls src={fytVideoContentUrl(task.id)} />
      </figure>}
    </div>

    <div className="border-t border-white/5 px-4 py-3 space-y-2">
      <input className="w-full rounded-2xl border border-white/10 bg-[#151515] px-4 py-2 text-xs text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none"
        value={imageUrl} disabled={running} placeholder={zh ? '参考图地址（可选，用于图生视频）' : 'Reference image URL (optional)'}
        onChange={event => setImageUrl(event.target.value)} />
      <div className="flex items-end gap-2">
        <textarea className="flex-1 resize-none rounded-2xl border border-white/10 bg-[#151515] px-4 py-3 text-sm text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none"
          rows={2} maxLength={2000} value={prompt} disabled={running}
          placeholder={zh ? '描述镜头、主体、光线与运动' : 'Describe subject, camera, light and motion'}
          onChange={event => setPrompt(event.target.value)} />
        <button type="button" disabled={!userId || running || !model || !prompt.trim()} onClick={generate}
          className="rounded-full bg-[#22d3ee] px-5 py-2.5 text-sm font-bold text-black transition-opacity disabled:opacity-40">
          {running ? (zh ? '生成中…' : 'Generating…') : (zh ? '生成' : 'Generate')}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>
  </div>;
}
