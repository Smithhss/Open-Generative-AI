'use client';

import { useEffect, useState } from 'react';
import { STUDIO_TABS, fetchVisibleTabs, saveVisibleTabs } from '@/lib/fyt/tabs.mjs';

// 管理员用的侧边栏开关：页面出问题时先关入口，不用发版。
export default function FytTabsAdmin({ open, onClose, token, zh, onSaved }) {
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setMessage('');
    fetchVisibleTabs().then(tabs => {
      if (cancelled) return;
      setSelected(tabs ?? STUDIO_TABS.map(tab => tab.id));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const toggle = id => setSelected(previous => (previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]));

  async function save() {
    if (!selected.length) { setMessage(zh ? '至少保留一个入口。' : 'Keep at least one entry.'); return; }
    setSaving(true); setMessage('');
    try {
      // 按固定顺序保存，方便对比
      const ordered = STUDIO_TABS.map(tab => tab.id).filter(id => selected.includes(id));
      await saveVisibleTabs(ordered, token);
      setMessage(zh ? '已保存，刷新后生效。' : 'Saved. Reload to apply.');
      onSaved?.(ordered);
    } catch (error) {
      setMessage(`${zh ? '保存失败：' : 'Save failed: '}${error?.message || ''}`);
    } finally {
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0b0d] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white/90">{zh ? '侧边栏入口开关' : 'Sidebar entries'}</h2>
        <button type="button" onClick={onClose} className="text-white/40 hover:text-white/80" aria-label={zh ? '关闭' : 'Close'}>✕</button>
      </div>
      <p className="mt-1 text-[11px] text-white/40">
        {zh ? '关掉的入口不会出现在导航里，路由仍然存在，随时可以打开。' : 'Hidden entries disappear from the sidebar; routes stay available.'}
      </p>

      {loading ? <p className="py-6 text-center text-xs text-white/30">{zh ? '读取中…' : 'Loading…'}</p> : <ul className="mt-4 space-y-1.5">
        {STUDIO_TABS.map(tab => <li key={tab.id}>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs text-white/80 hover:border-white/15">
            <input type="checkbox" className="accent-cyan-400" checked={selected.includes(tab.id)} onChange={() => toggle(tab.id)} />
            <span className="flex-1">{zh ? tab.zh : tab.en}</span>
            <span className="text-[10px] text-white/25">{tab.id}</span>
          </label>
        </li>)}
      </ul>}

      {message && <p className="mt-3 text-[11px] text-cyan-300/80">{message}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-full border border-white/10 px-4 py-1.5 text-xs text-white/70">
          {zh ? '取消' : 'Cancel'}
        </button>
        <button type="button" disabled={saving || loading} onClick={save}
          className="rounded-full bg-cyan-400 px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-40">
          {saving ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存' : 'Save')}
        </button>
      </div>
    </div>
  </div>;
}
