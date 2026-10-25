'use client';

import { useMemo, useState } from 'react';
import { TEMPLATE_GROUPS, placeholdersIn, templatesFor } from '@/lib/fyt/templates.mjs';

// 输入框上方的一排模板：点一下把提示词填进去，用户再改 {{占位符}}。
// 默认收起，只显示一行，避免抢走输入框的注意力。
export default function FytTemplateBar({ kind, zh, onPick }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState('all');

  const all = useMemo(() => templatesFor(kind), [kind]);
  const groups = useMemo(
    () => TEMPLATE_GROUPS.filter(item => all.some(template => template.group === item.id)),
    [all],
  );
  const visible = group === 'all' ? all : all.filter(template => template.group === group);

  if (!all.length) return null;

  return <div className="mb-2">
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setOpen(value => !value)}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${open
          ? 'border-cyan-300/40 bg-cyan-400/10 text-cyan-200'
          : 'border-white/10 bg-white/[0.03] text-white/55 hover:border-white/25 hover:text-white/80'}`}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h10M4 18h7" />
        </svg>
        {zh ? '模板' : 'Templates'}
        <span className="text-white/30">{all.length}</span>
      </button>
      {!open && <span className="truncate text-[10.5px] text-white/25">
        {zh ? '不知道怎么写？点模板选一个' : 'Not sure what to write? Start from a template'}
      </span>}
    </div>

    {open && <div className="mt-2 rounded-xl border border-white/[0.08] bg-[#131313] p-2">
      <div className="mb-2 flex flex-wrap gap-1">
        <button type="button" onClick={() => setGroup('all')}
          className={`rounded-full px-2 py-0.5 text-[10.5px] transition-colors ${group === 'all' ? 'bg-white/10 text-white/90' : 'text-white/40 hover:text-white/70'}`}>
          {zh ? '全部' : 'All'}
        </button>
        {groups.map(item => <button key={item.id} type="button" onClick={() => setGroup(item.id)}
          className={`rounded-full px-2 py-0.5 text-[10.5px] transition-colors ${group === item.id ? 'bg-white/10 text-white/90' : 'text-white/40 hover:text-white/70'}`}>
          {zh ? item.zh : item.en}
        </button>)}
      </div>
      <div className="thin-scrollbar grid max-h-[132px] grid-cols-2 gap-1 overflow-y-auto">
        {visible.map(template => {
          const text = zh ? template.promptZh : template.promptEn;
          const holes = placeholdersIn(text);
          return <button key={template.id} type="button"
            onClick={() => { onPick?.(text); setOpen(false); }}
            className="group rounded-lg border border-white/[0.06] px-2 py-1.5 text-left transition-colors hover:border-white/15 hover:bg-white/[0.04]">
            <span className="block truncate text-[11.5px] text-white/85">{zh ? template.zh : template.en}</span>
            <span className="mt-0.5 block truncate text-[10px] text-white/30">
              {holes.length ? `${zh ? '需填' : 'Fill'}: ${holes.join(' / ')}` : (zh ? '直接可用' : 'Ready to use')}
            </span>
          </button>;
        })}
      </div>
    </div>}
  </div>;
}
