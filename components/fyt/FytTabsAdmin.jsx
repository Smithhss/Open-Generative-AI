'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { STUDIO_TABS, fetchVisibleTabs, saveVisibleTabs } from '@/lib/fyt/tabs.mjs';

export default function FytTabsAdmin({ open, onClose, token, zh, onSaved }) {
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true); setMessage('');
    fetchVisibleTabs().then(tabs => {
      if (cancelled) return;
      setSelected(tabs ?? STUDIO_TABS.map(item => item.id));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const toggleTab = id => setSelected(previous => (previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]));

  async function save() {
    setSaving(true); setMessage('');
    try {
      if (!selected.length) { setMessage(zh ? '至少保留一个入口。' : 'Keep at least one entry.'); return; }
      const ordered = STUDIO_TABS.map(item => item.id).filter(id => selected.includes(id));
      await saveVisibleTabs(ordered, token);
      onSaved?.(ordered);
      setMessage(zh ? '已保存，导航已更新。' : 'Saved. Navigation updated.');
    } catch (error) {
      const raw = error?.message || '';
      const friendly = /401|403|unauthorized|forbidden/i.test(raw)
        ? (zh ? '需要管理员权限才能修改。' : 'Admin permission required.')
        : raw;
      setMessage(`${zh ? '保存失败：' : 'Save failed: '}${friendly}`);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(<div className="fixed inset-0 z-[210] flex items-center justify-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="fyt-sidebar-settings-title">
    <div className={`thin-scrollbar my-auto max-h-[88vh] w-full overflow-y-auto max-w-md rounded-2xl border border-white/10 bg-[#0b0b0d] p-5 transition-all`}>
      <div className="flex items-center justify-between">
        <h2 id="fyt-sidebar-settings-title" className="text-base font-semibold text-white/90">{zh ? '侧边栏设置' : 'Sidebar settings'}</h2>
        <button type="button" onClick={onClose} className="text-white/40 hover:text-white/80" aria-label={zh ? '关闭' : 'Close'}>✕</button>
      </div>

      {loading ? <p className="py-10 text-center text-xs text-white/30">{zh ? '读取中…' : 'Loading…'}</p> : <>
          <p className="mt-3 text-[11px] text-white/40">
            {zh ? '关掉的入口不会出现在导航里，路由仍然存在，随时可以打开。' : 'Hidden entries disappear from the sidebar; routes stay available.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setSelected(STUDIO_TABS.map(item => item.id))} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80">{zh ? '全部显示' : 'Show all'}</button>
            <button type="button" onClick={() => setSelected(STUDIO_TABS.filter(item => item.available).map(item => item.id))} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80">{zh ? '仅显示已接入' : 'Connected only'}</button>
          </div>
          <ul className="mt-3 space-y-1.5">
            {STUDIO_TABS.map(item => <li key={item.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs text-white/80 hover:border-white/15">
                <input type="checkbox" className="accent-cyan-400" checked={selected.includes(item.id)} onChange={() => toggleTab(item.id)} />
                <span className="flex-1">{zh ? item.zh : item.en}</span>
                <span className="text-[10px] text-white/35">{item.available ? (zh ? '已接入' : 'Connected') : (zh ? '待接入' : 'Coming soon')}</span>
              </label>
            </li>)}
          </ul>
      </>}

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
  </div>, document.body);
}
