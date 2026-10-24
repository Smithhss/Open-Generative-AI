'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authenticatedScope } from '@/lib/fyt/chat.mjs';
import { clearSession } from '@/lib/fyt/session.mjs';

// 作品库：列出已落盘的生成结果，支持筛选、删除与批量下载。
export default function FytWorksStudio({ locale, userId, active }) {
  const zh = locale === 'zh';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [blobs, setBlobs] = useState({});
  const [playing, setPlaying] = useState({});
  const abort = useRef(null);

  const load = useCallback(async () => {
    if (!userId) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true); setError('');
    try {
      const scope = await authenticatedScope(controller.signal);
      try {
        scope.check();
        const response = await fetch('/api/user/artifacts?limit=100', { ...scope.init });
        const body = await response.json().catch(() => null);
        scope.check();
        if (response.status === 401) { clearSession({ status: 'anonymous', broadcast: true }); throw new Error('AUTH_REQUIRED'); }
        if (!response.ok || body?.success !== true) throw new Error(`HTTP ${response.status}`);
        if (!controller.signal.aborted) setItems(Array.isArray(body.data) ? body.data : []);
      } finally { scope.close(); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause?.message === 'AUTH_REQUIRED' ? (zh ? '请先登录 fyt。' : 'Sign in first.') : (zh ? '作品读取失败' : 'Failed to load works'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [userId, zh]);

  useEffect(() => {
    if (!active || !userId) return undefined;
    void load();
    return () => abort.current?.abort();
  }, [active, userId, load]);

  const visible = useMemo(() => items.filter(item => {
    if (filter === 'all') return true;
    const action = String(item.action || '');
    if (filter === 'text') return action.includes('text_to_video');
    if (filter === 'image') return action.includes('image_to_video');
    return true;
  }), [items, filter]);

  function toggle(id) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // 产物接口需要鉴权，<video src> 带不了请求头，所以取回 blob 再播/存。
  async function fetchBlob(item) {
    const scope = await authenticatedScope();
    try {
      const response = await fetch(item.url, { ...scope.init });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.blob();
    } finally { scope.close(); }
  }

  async function play(item) {
    if (playing[item.task_id]) return;
    setError('');
    try {
      const blob = await fetchBlob(item);
      const url = URL.createObjectURL(blob);
      setBlobs(previous => ({ ...previous, [item.task_id]: url }));
      setPlaying(previous => ({ ...previous, [item.task_id]: true }));
    } catch {
      setError(zh ? '播放失败，请稍后重试。' : 'Playback failed; try again.');
    }
  }

  async function saveOne(item) {
    try {
      const blob = await fetchBlob(item);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `${item.task_id}.mp4`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      setError(zh ? '下载失败，请稍后重试。' : 'Download failed; try again.');
    }
  }

  async function remove(id) {
    if (!window.confirm(zh ? '删除后无法恢复，确定删除这条作品？' : 'Delete this work? This cannot be undone.')) return;
    try {
      const scope = await authenticatedScope();
      try {
        const response = await fetch(`/api/user/artifacts/${encodeURIComponent(id)}`, { ...scope.init, method: 'DELETE' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } finally { scope.close(); }
      setItems(previous => previous.filter(item => item.task_id !== id));
      setSelected(previous => { const next = new Set(previous); next.delete(id); return next; });
      setNotice(zh ? '已删除。' : 'Deleted.');
    } catch {
      setError(zh ? '删除失败，请重试。' : 'Delete failed; try again.');
    }
  }

  // 批量下载：逐个触发，间隔一点避免浏览器拦截。
  async function downloadSelected() {
    const targets = visible.filter(item => selected.has(item.task_id));
    if (!targets.length || busy) return;
    setBusy(true); setNotice('');
    for (const item of targets) {
      await saveOne(item);
      await new Promise(resolve => setTimeout(resolve, 600));
    }
    setBusy(false);
    setNotice(zh ? `已开始下载 ${targets.length} 个文件。` : `Started ${targets.length} downloads.`);
  }

  const pill = 'rounded-full border border-white/10 bg-[#151515] px-3 py-1.5 text-xs text-white/85 transition-colors hover:border-white/25 disabled:opacity-40';
  const tabs = [
    { id: 'all', label: zh ? '全部' : 'All' },
    { id: 'text', label: zh ? '文生视频' : 'Text to video' },
    { id: 'image', label: zh ? '图生视频' : 'Image to video' },
  ];

  if (!userId) return <div className="h-full flex items-center justify-center text-sm text-amber-300">{zh ? '请先登录 fyt。' : 'Sign in with fyt first.'}</div>;

  return <div className="h-full flex flex-col bg-black">
    <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 border-b border-white/5">
      {tabs.map(tab => <button key={tab.id} type="button" onClick={() => setFilter(tab.id)}
        className={`${pill} ${filter === tab.id ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200' : ''}`}>{tab.label}</button>)}
      <span className="w-px h-5 bg-white/10 mx-1" />
      <button type="button" className={pill} disabled={!selected.size || busy} onClick={downloadSelected}>
        {busy ? (zh ? '下载中…' : 'Downloading…') : `${zh ? '批量下载' : 'Download'}${selected.size ? ` (${selected.size})` : ''}`}
      </button>
      <button type="button" className={pill} disabled={loading} onClick={() => void load()}>{zh ? '刷新' : 'Refresh'}</button>
      <span className="text-[11px] text-white/35 ml-auto">{zh ? `${visible.length} 个作品` : `${visible.length} works`}</span>
    </div>

    {(error || notice) && <div className="px-4 py-1.5 text-[11px] border-b border-white/5">
      {error ? <span role="alert" className="text-red-300">{error}</span> : <span role="status" className="text-cyan-300/80">{notice}</span>}
    </div>}

    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      {loading && !items.length && <p className="text-center text-sm text-white/30 py-10">{zh ? '读取中…' : 'Loading…'}</p>}
      {!loading && !visible.length && <p className="text-center text-sm text-white/30 py-10">{zh ? '还没有作品，去视频页生成一条试试。' : 'No works yet.'}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(item => <figure key={item.task_id} className={`rounded-2xl border p-3 transition-colors ${selected.has(item.task_id) ? 'border-cyan-400/50 bg-cyan-400/5' : 'border-white/10 bg-[#0b0b0d]'}`}>
          {blobs[item.task_id]
            ? <video className="w-full rounded-xl bg-black" controls autoPlay src={blobs[item.task_id]} />
            : <button type="button" onClick={() => void play(item)}
                className="w-full aspect-video rounded-xl bg-black/60 border border-white/5 flex flex-col items-center justify-center gap-1 text-white/40 hover:text-white/70 transition-colors">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                <span className="text-[11px]">{zh ? '播放' : 'Play'}</span>
              </button>}
          <figcaption className="mt-2 flex items-center gap-2">
            <input type="checkbox" checked={selected.has(item.task_id)} onChange={() => toggle(item.task_id)}
              aria-label={zh ? '选择作品' : 'Select work'} className="accent-cyan-400" />
            <span className="min-w-0 flex-1 truncate text-[11px] text-white/45">{item.task_id}</span>
            <button type="button" className="text-[11px] text-cyan-300/90 hover:underline" onClick={() => void saveOne(item)}>{zh ? '下载' : 'Download'}</button>
            <button type="button" className="text-[11px] text-red-300/80 hover:underline" onClick={() => void remove(item.task_id)}>{zh ? '删除' : 'Delete'}</button>
          </figcaption>
        </figure>)}
      </div>
    </div>
  </div>;
}
