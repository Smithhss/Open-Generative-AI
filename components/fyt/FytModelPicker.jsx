'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { labelForModel, vendorForModel } from '@/lib/fyt/model-alias.mjs';

// 外观照原版模型选择器：搜索框 + 全部/文生图/图生图 三个分类 + 带厂商的模型行。
// 数据来自 fyt 的模型目录，不依赖上游那份静态清单。
export default function FytModelPicker({ models, capabilities, value, onChange, disabled, zh }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = event => { if (box.current && !box.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const items = useMemo(() => models.map(id => ({
    id,
    label: labelForModel(id),
    vendor: vendorForModel(id),
    sizes: capabilities?.[id]?.sizes || [],
  })), [models, capabilities]);

  const visible = items.filter(item => {
    if (tab === 't2i' && item.sizes.length === 0) return false;
    if (tab === 'i2i' && !capabilities?.[item.id]?.supportsEdit) return false;
    if (!search.trim()) return true;
    const query = search.trim().toLowerCase();
    return item.id.toLowerCase().includes(query) || item.label.toLowerCase().includes(query);
  });

  const current = items.find(item => item.id === value);
  const tabs = [
    { id: 'all', label: zh ? '全部' : 'All' },
    { id: 't2i', label: zh ? '文生图' : 'Text to Image' },
    { id: 'i2i', label: zh ? '图生图' : 'Image to Image' },
  ];

  return <div className="relative" ref={box}>
    <button type="button" disabled={disabled} onClick={() => setOpen(v => !v)}
      className="flex items-center gap-2 rounded-full border border-white/10 bg-[#151515] px-3 py-1.5 text-xs text-white/85 transition-colors hover:border-white/25 disabled:opacity-40">
      <span className="w-4 h-4 rounded bg-white/10 flex items-center justify-center text-[9px] text-white/70">
        {(current?.vendor || 'f')[0].toUpperCase()}
      </span>
      <span className="max-w-[180px] truncate">{current?.label || (zh ? '选择模型' : 'Select model')}</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-50">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    {open && <div className="absolute bottom-full left-0 mb-2 w-[320px] max-h-[420px] overflow-hidden rounded-xl border border-white/10 bg-[#111214] shadow-2xl z-50 flex flex-col">
      <div className="flex gap-1 p-2 border-b border-white/5">
        {tabs.map(item => <button key={item.id} type="button" onClick={() => setTab(item.id)}
          className={`flex-1 rounded-md px-2 py-1 text-[11px] transition-colors ${tab === item.id ? 'bg-cyan-400/15 text-cyan-200' : 'text-white/50 hover:text-white/80'}`}>
          {item.label}
        </button>)}
      </div>
      <div className="p-2 border-b border-white/5">
        <input value={search} onChange={event => setSearch(event.target.value)} autoFocus
          placeholder={zh ? '搜索模型…' : 'Search models…'}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none" />
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {!visible.length && <p className="px-2 py-4 text-center text-[11px] text-white/30">{zh ? '没有匹配的模型' : 'No models match'}</p>}
        {visible.map(item => <button key={item.id} type="button"
          onClick={() => { onChange(item.id); setOpen(false); setSearch(''); }}
          className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/5">
          <span className="w-6 h-6 shrink-0 rounded bg-white/10 flex items-center justify-center text-[10px] text-white/70">
            {item.vendor[0].toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] text-white/90">{item.label}</span>
            <span className="block truncate text-[10px] text-white/35">{item.vendor}</span>
          </span>
          {item.id === value && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-cyan-300 shrink-0"><path d="M20 6L9 17l-5-5" /></svg>}
        </button>)}
      </div>
    </div>}
  </div>;
}
