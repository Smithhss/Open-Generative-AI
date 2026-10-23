'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getChatGroups } from '@/lib/fyt/chat.mjs';
import {
  VIDEO_DURATIONS,
  VIDEO_SIZES,
  createFytVideo,
  fetchFytVideo,
  fytVideoContentUrl,
  getVideoModels,
  isSuccessStatus,
  isTerminalStatus,
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

  const poll = useCallback(async (taskId) => {
    let count = 0;
    const tick = async () => {
      count += 1;
      try {
        const result = await fetchFytVideo(taskId);
        setStatus(result.status);
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
  }, [copy, onSettled, stopPolling]);

  async function generate() {
    if (running || !model || !group || !userId) return;
    setError(''); setTask(null); setStatus(''); setRunning(true);
    const controller = new AbortController(); abort.current = controller;
    try {
      const created = await createFytVideo({ model, group, prompt, seconds, size, imageUrl: imageUrl.trim() || undefined }, { signal: controller.signal });
      setTask(created);
      setStatus(created.status);
      poll(created.id);
    } catch (cause) {
      setRunning(false);
      setError(copy(cause?.message));
    }
  }

  const field = 'bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-xs text-white disabled:opacity-40';
  const done = task && isSuccessStatus(status);

  return <div className="h-full overflow-y-auto p-5 md:p-8">
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-cyan-300 mb-2">FYT VIDEO</p>
        <h1 className="text-2xl font-black mb-2">{zh ? '视频工作室' : 'Video studio'}</h1>
        <p className="text-sm text-white/40">
          {zh ? '任务提交后按 fyt 渠道异步执行，页面刷新可凭任务编号继续查询；失败按服务端规则退款。' : 'Tasks run asynchronously on fyt channels. Reload to resume by task id; failures refund per server rules.'}
        </p>
      </div>

      {!userId && <p className="text-sm text-amber-300">{zh ? '请先登录 fyt 后再生成。' : 'Sign in with fyt to generate.'}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-white/50">{zh ? '分组' : 'Group'}
          <select className={`${field} mt-1 w-full`} value={group} disabled={!userId || running} onChange={event => setGroup(event.target.value)}>
            {!groups.length && <option value="">{zh ? '无可用分组' : 'No group'}</option>}
            {groups.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-white/50">{zh ? '视频模型' : 'Video model'}
          <select className={`${field} mt-1 w-full`} value={model} disabled={!userId || running || !models.length} onChange={event => setModel(event.target.value)}>
            {!models.length && <option value="">{zh ? '当前分组无视频模型' : 'No video model in this group'}</option>}
            {models.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label className="text-xs text-white/50">{zh ? '时长（秒）' : 'Duration (s)'}
          <select className={`${field} mt-1 w-full`} value={seconds} disabled={running} onChange={event => setSeconds(Number(event.target.value))}>
            {VIDEO_DURATIONS.map(value => <option key={value} value={value}>{value}s</option>)}
          </select>
        </label>
        <label className="text-xs text-white/50">{zh ? '分辨率' : 'Resolution'}
          <select className={`${field} mt-1 w-full`} value={size} disabled={running} onChange={event => setSize(event.target.value)}>
            {VIDEO_SIZES.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>

      <label className="block text-xs text-white/50">{zh ? '提示词' : 'Prompt'}
        <textarea className={`${field} mt-1 w-full h-28 resize-y`} value={prompt} maxLength={2000} disabled={running}
          placeholder={zh ? '描述镜头、主体、光线与运动' : 'Describe subject, camera, light and motion'}
          onChange={event => setPrompt(event.target.value)} />
      </label>

      <label className="block text-xs text-white/50">{zh ? '参考图地址（可选，用于图生视频）' : 'Reference image URL (optional, image-to-video)'}
        <input className={`${field} mt-1 w-full`} value={imageUrl} disabled={running}
          placeholder="https://…" onChange={event => setImageUrl(event.target.value)} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!userId || running || !model || !prompt.trim()} onClick={generate}
          className="bg-[#22d3ee] text-black px-5 py-2 rounded-lg text-sm font-bold disabled:opacity-40">
          {running ? (zh ? '生成中…' : 'Generating…') : (zh ? '生成视频' : 'Generate video')}
        </button>
        {task && <span className="text-xs text-white/50">{zh ? '任务' : 'Task'} {task.id} · {status || 'queued'}</span>}
      </div>

      {error && <p role="alert" className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</p>}

      {done && <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <video className="w-full rounded-lg" controls src={fytVideoContentUrl(task.id)} />
        <a className="inline-block mt-3 text-xs text-cyan-300 underline" href={fytVideoContentUrl(task.id)} download>{zh ? '下载视频' : 'Download video'}</a>
      </div>}
    </div>
  </div>;
}
