'use client';

import { useEffect, useState } from 'react';
import { STUDIO_TABS, fetchVisibleTabs, saveVisibleTabs } from '@/lib/fyt/tabs.mjs';
import { TEMPLATES, TEMPLATE_GROUPS, fetchTemplates, saveTemplates } from '@/lib/fyt/templates.mjs';

// 管理员后台：两个页签——侧边栏入口开关、提示词模板。
// 都存工作台数据卷，改完即时生效，不用发版。
function newTemplate() {
  return {
    id: `tpl-${Date.now()}`,
    group: 'product',
    kind: 'image',
    zh: '',
    en: '',
    promptZh: '',
    promptEn: '',
  };
}

export default function FytTabsAdmin({ open, onClose, token, zh, onSaved }) {
  const [tab, setTab] = useState('tabs');
  const [selected, setSelected] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true); setMessage('');
    Promise.all([fetchVisibleTabs(), fetchTemplates()]).then(([tabs, list]) => {
      if (cancelled) return;
      setSelected(tabs ?? STUDIO_TABS.map(item => item.id));
      // 没配置过就从内置默认开始编辑
      setTemplates(list ?? TEMPLATES.map(item => ({ ...item })));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const toggleTab = id => setSelected(previous => (previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]));
  const patchTemplate = (id, patch) => setTemplates(previous => previous.map(item => (item.id === id ? { ...item, ...patch } : item)));
  const removeTemplate = id => setTemplates(previous => previous.filter(item => item.id !== id));

  async function save() {
    setSaving(true); setMessage('');
    try {
      if (tab === 'tabs') {
        if (!selected.length) { setMessage(zh ? '至少保留一个入口。' : 'Keep at least one entry.'); setSaving(false); return; }
        const ordered = STUDIO_TABS.map(item => item.id).filter(id => selected.includes(id));
        await saveVisibleTabs(ordered, token);
        onSaved?.(ordered);
      } else {
        const invalid = templates.find(item => !item.zh.trim() || !item.promptZh.trim());
        if (invalid) { setMessage(zh ? '模板的名称和提示词都要填。' : 'Each template needs a name and a prompt.'); setSaving(false); return; }
        const saved = await saveTemplates(templates, token);
        setTemplates(saved.length ? saved : templates);
      }
      setMessage(zh ? '已保存，刷新后生效。' : 'Saved. Reload to apply.');
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

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
    <div className={`w-full ${tab === 'tabs' ? 'max-w-md' : 'max-w-2xl'} rounded-2xl border border-white/10 bg-[#0b0b0d] p-5 transition-all`}>
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-full bg-white/[0.04] p-0.5">
          {[{ id: 'tabs', label: zh ? '侧边栏' : 'Sidebar' }, { id: 'templates', label: zh ? '提示词模板' : 'Templates' }].map(item => (
            <button key={item.id} type="button" onClick={() => { setTab(item.id); setMessage(''); }}
              className={`rounded-full px-3 py-1 text-[11.5px] transition-colors ${tab === item.id ? 'bg-white/10 text-white/90' : 'text-white/45 hover:text-white/75'}`}>
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="text-white/40 hover:text-white/80" aria-label={zh ? '关闭' : 'Close'}>✕</button>
      </div>

      {loading ? <p className="py-10 text-center text-xs text-white/30">{zh ? '读取中…' : 'Loading…'}</p> : <>
        {tab === 'tabs' && <>
          <p className="mt-3 text-[11px] text-white/40">
            {zh ? '关掉的入口不会出现在导航里，路由仍然存在，随时可以打开。' : 'Hidden entries disappear from the sidebar; routes stay available.'}
          </p>
          <ul className="mt-3 space-y-1.5">
            {STUDIO_TABS.map(item => <li key={item.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs text-white/80 hover:border-white/15">
                <input type="checkbox" className="accent-cyan-400" checked={selected.includes(item.id)} onChange={() => toggleTab(item.id)} />
                <span className="flex-1">{zh ? item.zh : item.en}</span>
                <span className="text-[10px] text-white/25">{item.id}</span>
              </label>
            </li>)}
          </ul>
        </>}

        {tab === 'templates' && <>
          <p className="mt-3 text-[11px] text-white/40">
            {zh ? '输入框上方展示的模板。提示词里用 {{产品}} 这类占位符，用户点选后自己替换。' : 'Templates shown above the prompt box. Use {{placeholders}} for values the user fills in.'}
          </p>
          <div className="thin-scrollbar mt-3 max-h-[380px] space-y-2 overflow-y-auto pr-1">
            {templates.map((item, index) => <div key={item.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
              <div className="flex items-center gap-1.5">
                <span className="w-5 text-center text-[10px] text-white/25">{index + 1}</span>
                <input value={item.zh} onChange={event => patchTemplate(item.id, { zh: event.target.value })}
                  placeholder={zh ? '模板名称' : 'Name'}
                  className="w-32 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11.5px] text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none" />
                <select value={item.group} onChange={event => patchTemplate(item.id, { group: event.target.value })}
                  className="rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-white/75 focus:outline-none">
                  {TEMPLATE_GROUPS.map(group => <option key={group.id} value={group.id}>{group.zh}</option>)}
                </select>
                <select value={item.kind} onChange={event => patchTemplate(item.id, { kind: event.target.value })}
                  className="rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-white/75 focus:outline-none">
                  <option value="image">{zh ? '图片' : 'Image'}</option>
                  <option value="video">{zh ? '视频' : 'Video'}</option>
                </select>
                <span className="flex-1" />
                <button type="button" onClick={() => removeTemplate(item.id)}
                  className="rounded-md px-2 py-1 text-[11px] text-red-300/70 hover:bg-red-500/10 hover:text-red-200">
                  {zh ? '删除' : 'Delete'}
                </button>
              </div>
              <textarea value={item.promptZh} onChange={event => patchTemplate(item.id, { promptZh: event.target.value })}
                rows={2} placeholder={zh ? '提示词（中文）' : 'Prompt'}
                className="mt-1.5 w-full resize-y rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] leading-relaxed text-white/85 placeholder:text-white/25 focus:border-white/25 focus:outline-none" />
            </div>)}
            {!templates.length && <p className="py-6 text-center text-[11px] text-white/25">{zh ? '还没有模板' : 'No templates yet'}</p>}
          </div>
          <button type="button" onClick={() => setTemplates(previous => [...previous, newTemplate()])}
            className="mt-2 w-full rounded-lg border border-dashed border-white/15 py-1.5 text-[11px] text-white/50 hover:border-white/30 hover:text-white/80">
            + {zh ? '新增模板' : 'Add template'}
          </button>
        </>}
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
  </div>;
}
