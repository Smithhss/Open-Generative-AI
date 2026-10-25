'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { labelForModel, vendorForModel } from '@/lib/fyt/model-alias.mjs';
import { brandPaths } from '@/lib/fyt/brand-icons.mjs';

// 外观对齐原版模型选择器：顶部 MODEL 标题、左侧厂商图标栏（带两字代码）、
// 右侧分类 + 搜索 + 按厂商分组的模型列表，选中项右侧打勾。
// 数据仍来自 fyt 的模型目录，不依赖上游那份静态清单。
const VENDOR_CODE = {
  OpenAI: 'OP',
  Google: 'GO',
  ByteDance: 'BY',
  'Black Forest': 'BF',
  Kuaishou: 'KS',
  Ideogram: 'ID',
  MiniMax: 'MM',
  Alibaba: 'AL',
  DeepSeek: 'DS',
  Anthropic: 'AN',
  fyt: 'FY',
};

// 原版是单色图标 + 深色方块，这里保持中性，不做品牌配色
const VENDOR_TONE = {
  OpenAI: 'from-white/[0.14] to-white/[0.05] text-white/85',
  Google: 'from-white/[0.14] to-white/[0.05] text-white/85',
  ByteDance: 'from-white/[0.14] to-white/[0.05] text-white/85',
  fyt: 'from-white/[0.14] to-white/[0.05] text-white/70',
};
const NEUTRAL_TONE = 'from-white/[0.12] to-white/[0.04] text-white/80';

// 有 logo 的厂商画 logo，没有的退回首字母
function BrandIcon({ vendor, size = 14, className = '' }) {
  const paths = brandPaths(vendor);
  if (!paths) return <span className={`text-[10px] font-semibold ${className}`}>{vendor[0].toUpperCase()}</span>;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    {paths.map((d, index) => <path key={index} d={d} />)}
  </svg>;
}

export default function FytModelPicker({ models, capabilities, value, onChange, disabled, zh }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [vendorFilter, setVendorFilter] = useState(null);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = event => { if (box.current && !box.current.contains(event.target)) setOpen(false); };
    const onKey = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = useMemo(() => models.map(id => ({
    id,
    label: labelForModel(id),
    vendor: vendorForModel(id),
    sizes: capabilities?.[id]?.sizes || [],
    editable: Boolean(capabilities?.[id]?.supportsEdit),
  })), [models, capabilities]);

  const vendors = useMemo(() => {
    const seen = [];
    for (const item of items) if (!seen.includes(item.vendor)) seen.push(item.vendor);
    return seen;
  }, [items]);

  const visible = items.filter(item => {
    if (vendorFilter && item.vendor !== vendorFilter) return false;
    if (tab === 't2i' && item.sizes.length === 0) return false;
    if (tab === 'i2i' && !item.editable) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return item.id.toLowerCase().includes(query) || item.label.toLowerCase().includes(query) || item.vendor.toLowerCase().includes(query);
  });

  const grouped = useMemo(() => {
    const map = new Map();
    for (const item of visible) {
      if (!map.has(item.vendor)) map.set(item.vendor, []);
      map.get(item.vendor).push(item);
    }
    return [...map.entries()];
  }, [visible]);

  const current = items.find(item => item.id === value);
  const tabs = [
    { id: 'all', label: zh ? '全部' : 'All' },
    { id: 't2i', label: zh ? '文生图' : 'Text to Image' },
    { id: 'i2i', label: zh ? '图生图' : 'Image to Image' },
  ];

  const close = () => { setOpen(false); setSearch(''); setVendorFilter(null); };

  return <div className="relative" ref={box}>
    <button type="button" disabled={disabled} onClick={() => (open ? close() : setOpen(true))}
      className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#161616] px-2.5 py-1.5 text-xs text-white/85 transition-colors hover:border-white/25 disabled:opacity-40">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-white/15 to-white/5 text-white/85">
        <BrandIcon vendor={current?.vendor || 'fyt'} size={12} />
      </span>
      <span className="max-w-[180px] truncate">{current?.label || (zh ? '选择模型' : 'Select model')}</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-40">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    {open && <div
      className="absolute bottom-full left-0 z-50 mb-2 flex h-[490px] w-[372px] overflow-hidden rounded-2xl border border-white/10 bg-[#161616] shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
      role="dialog" aria-label={zh ? '选择模型' : 'Select model'}>
      {/* 左侧厂商栏 */}
      <div className="flex w-[58px] shrink-0 flex-col items-center overflow-y-auto border-r border-white/[0.06] bg-[#111111] py-3">
        {/* 顶部是「全部」，对应原版那颗星 */}
        <button type="button" title={zh ? '全部模型' : 'All models'}
          onClick={() => setVendorFilter(null)}
          className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${vendorFilter === null ? 'bg-white/[0.14] text-white' : 'text-white/45 hover:bg-white/[0.06] hover:text-white/80'}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95L12 2.6z" />
          </svg>
        </button>
        <span className="my-2 h-px w-6 bg-white/[0.08]" />
        {vendors.map((vendor, index) => <div key={vendor} className="flex w-full flex-col items-center">
          {index > 0 && <span className="mb-1.5 mt-0.5 h-px w-6 bg-white/[0.05]" />}
          <button type="button" title={vendor}
            onClick={() => setVendorFilter(previous => (previous === vendor ? null : vendor))}
            className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br transition-all ${VENDOR_TONE[vendor] || NEUTRAL_TONE} ${vendorFilter === vendor ? 'ring-1 ring-cyan-300/60' : 'hover:brightness-125'}`}>
            <BrandIcon vendor={vendor} size={16} />
          </button>
          <span className="mt-1 text-[8px] font-semibold tracking-[0.12em] text-white/25">{VENDOR_CODE[vendor] || vendor.slice(0, 2).toUpperCase()}</span>
        </div>)}
      </div>

      {/* 右侧内容 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <span className="text-[10px] font-semibold tracking-[0.16em] text-white/35">MODEL</span>
          <button type="button" onClick={close} aria-label={zh ? '关闭' : 'Close'} className="text-white/30 transition-colors hover:text-white/70">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex gap-1.5 px-4 pb-3">
          {tabs.map(item => <button key={item.id} type="button" onClick={() => setTab(item.id)}
            className={`rounded-full px-2.5 py-1 text-[10.5px] transition-colors ${tab === item.id
              ? 'bg-white/[0.07] text-white/90 ring-1 ring-white/15'
              : 'text-white/40 hover:text-white/70'}`}>
            {item.label}
          </button>)}
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/40 px-2.5 py-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-white/30">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            <input value={search} onChange={event => setSearch(event.target.value)} autoFocus
              placeholder={zh ? '搜索模型…' : 'Search models...'}
              className="w-full bg-transparent text-[11.5px] text-white placeholder:text-white/25 focus:outline-none" />
          </div>
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto pb-3">
          <p className="px-4 pb-1 text-[10px] text-white/30">{zh ? '全部模型' : 'All models'}</p>
          {!visible.length && <p className="px-4 py-6 text-center text-[11px] text-white/25">{zh ? '没有匹配的模型' : 'No models match'}</p>}
          {grouped.map(([vendor, list]) => <div key={vendor}>
            <div className="flex items-center gap-1.5 px-4 py-1.5">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-white/10 text-white/60"><BrandIcon vendor={vendor} size={9} /></span>
              <span className="text-[10.5px] text-white/45">{vendor}</span>
            </div>
            <div className="px-2">
              {list.map(item => <button key={item.id} type="button"
                onClick={() => { onChange(item.id); close(); }}
                className={`flex min-h-[50px] w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${item.id === value ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-white/12 to-white/[0.04] text-white/75">
                  <BrandIcon vendor={vendor} size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-white/90">{item.label}</span>
                  <span className="block truncate text-[10px] text-white/35">{vendor}</span>
                </span>
                {item.id === value && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0 text-cyan-300"><path d="M20 6L9 17l-5-5" /></svg>}
              </button>)}
            </div>
          </div>)}
        </div>
      </div>
    </div>}
  </div>;
}
