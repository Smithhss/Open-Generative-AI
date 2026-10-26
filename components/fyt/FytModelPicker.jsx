'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageModelDropdown, PromptPopover, PromptPopoverHeader, promptControlClassName } from 'studio';
import { labelForModel, vendorForModel } from '@/lib/fyt/model-alias.mjs';
import { brandPaths } from '@/lib/fyt/brand-icons.mjs';

const PROVIDER_IDS = {
  OpenAI: 'openai', Google: 'google', ByteDance: 'bytedance',
  'Black Forest': 'blackforest', Kuaishou: 'kling', Ideogram: 'ideogram',
  MiniMax: 'minimax', Alibaba: 'alibaba',
};

export default function FytModelPicker({ models, capabilities, value, onChange, disabled, zh, mode = 'image' }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => { if (!box.current?.contains(event.target)) setOpen(false); };
    const closeOnEscape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  // Adapt only FYT-authorized models to the original picker's data contract.
  const entries = useMemo(() => models.map(id => {
    const vendor = vendorForModel(id);
    return {
      id, name: labelForModel(id), searchText: `${id} ${labelForModel(id)} ${vendor}`.toLowerCase(),
      family: { id, provider: PROVIDER_IDS[vendor] || vendor.toLowerCase(), provider_name: vendor },
      variantsByMode: { t2i: true, ...(capabilities?.[id]?.supportsEdit ? { i2i: true } : {}) },
    };
  }), [models, capabilities]);
  const categories = mode === 'video' ? [{ id: 'all', label: zh ? '全部' : 'All', entries }] : undefined;
  const vendor = vendorForModel(value);
  const paths = brandPaths(vendor);

  return <div className="relative" ref={box}>
    <button type="button" disabled={disabled} aria-expanded={open} aria-haspopup="dialog"
      onClick={() => setOpen(previous => !previous)}
      className={promptControlClassName({ active: open, compact: true })}>
      {paths && <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        {paths.map((d, index) => <path key={index} d={d} />)}
      </svg>}
      <span className="max-w-[180px] truncate text-xs font-semibold">{labelForModel(value) || (zh ? '选择模型' : 'Select model')}</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && !disabled && <PromptPopover fitViewport
      role="dialog" aria-label={zh ? '选择模型' : 'Select model'}
      className="w-[calc(100vw-2rem)] md:w-[480px] max-w-md md:max-w-none max-h-[70vh]">
      <PromptPopoverHeader>{zh ? '模型' : 'MODEL'}</PromptPopoverHeader>
      <ImageModelDropdown entries={entries} categories={categories} selectedModel={value}
        locale={zh ? 'zh' : 'en'} onSelect={entry => onChange(entry.id)} onClose={() => setOpen(false)} />
    </PromptPopover>}
  </div>;
}
