'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageStudio } from 'studio';
import { getChatGroups } from '@/lib/fyt/chat.mjs';
import { getImageModels, generateFytImage, generateFytImageEdit } from '@/lib/fyt/images.mjs';
import FytModelPicker from '@/components/fyt/FytModelPicker';

export default function FytImageStudio({ locale, userId, active, onSettled, onOpenImage, transferring }) {
  const zh = locale === 'zh';
  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState('');
  const [models, setModels] = useState([]);
  const [capabilities, setCapabilities] = useState({});
  const [size, setSize] = useState('');
  const [model, setModel] = useState('');
  const [modelGroup, setModelGroup] = useState('');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const run = useRef(null);
  const errorCopy = error => {
    const code = error?.message || '';
    const message = code === 'AUTH_REQUIRED' ? (zh ? '请先登录 fyt。' : 'Sign in with fyt first.')
      : code === 'IMAGE_BASE64_REQUIRED' ? (zh ? '上游未返回可直接显示的图片数据，请凭请求编号检查日志，勿重复点击生成。' : 'No inline image returned. Check the request log before generating again.')
      : (zh ? '请求未完成，请检查额度、渠道或日志。系统未自动重发；中断不代表未扣费。' : 'Request incomplete. Check balance, channel and logs. No automatic retry; interruption does not imply no charge.');
    return error?.requestId ? `${message} Request ID: ${error.requestId}` : message;
  };
  useEffect(() => () => run.current?.abort(), []);
  useEffect(() => {
    if (!userId || !active) return;
    const controller = new AbortController();
    getChatGroups({ signal: controller.signal }).then(values => {
      if (controller.signal.aborted) return;
      setGroups(values); setGroup(previous => values.some(item => item.name === previous) ? previous : values[0]?.name || '');
    }).catch(cause => { if (!controller.signal.aborted) setError(errorCopy(cause)); });
    return () => controller.abort();
  }, [userId, active, reload, zh]);
  useEffect(() => {
    setModels([]); setError('');
    if (!group || !userId) return;
    const controller = new AbortController(); setLoading(true);
    getImageModels({ group, signal: controller.signal }).then(({ models: values, capabilities: caps }) => {
      if (!controller.signal.aborted) {
        setModels(values);
        setCapabilities(caps);
        setModel(previous => values.includes(previous) ? previous : values[0] || '');
        setModelGroup(group);
      }
    }).catch(cause => { if (!controller.signal.aborted) setError(errorCopy(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [group, userId, reload, zh]);
  // 当前模型支持的尺寸由服务端 capabilities 决定；没验证过的模型不显示尺寸选项。
  const sizes = capabilities[model]?.sizes || [];
  const activeSize = sizes.includes(size) ? size : (capabilities[model]?.defaultSize || sizes[0] || '');
  async function generate(prompt) {
    if (run.current || !model || modelGroup !== group || !group || !userId) throw new Error('INVALID_IMAGE_REQUEST');
    const controller = new AbortController(); run.current = controller; setRunning(true);
    try { return await generateFytImage({ model, group, prompt, size: activeSize || undefined }, { signal: controller.signal }); }
    finally { run.current = null; setRunning(false); if (!controller.signal.aborted) onSettled?.(); }
  }

  async function generateEdit({ prompt, file }) {
    if (run.current || !model || modelGroup !== group || !group || !userId) throw new Error('INVALID_IMAGE_REQUEST');
    const controller = new AbortController(); run.current = controller; setRunning(true);
    try { return await generateFytImageEdit({ model, group, prompt, file }, { signal: controller.signal }); }
    finally { run.current = null; setRunning(false); if (!controller.signal.aborted) onSettled?.(); }
  }

  // 与原版底部参数条同一套视觉：深色底、细边、圆角胶囊。
  const pill = 'rounded-full border border-white/10 bg-[#151515] px-3 py-1.5 text-xs text-white/85 transition-colors hover:border-white/25 disabled:opacity-40 disabled:hover:border-white/10';
  const pillActive = 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200';
  const controls = <div className="flex flex-wrap items-center gap-1.5">
    <select aria-label={zh ? '图片分组' : 'Image group'} className={pill} value={group} disabled={!userId || running || loading} onChange={event => setGroup(event.target.value)}>
      {!groups.length && <option value="">{zh ? '请先登录' : 'Sign in first'}</option>}
      {groups.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
    </select>
    <FytModelPicker models={models} capabilities={capabilities} value={model} onChange={setModel}
      disabled={!userId || running || loading || !models.length} zh={zh} />
    {sizes.length > 0 && <select aria-label={zh ? '图片尺寸' : 'Image size'} className={pill} value={activeSize} disabled={!userId || running || loading}
      onChange={event => setSize(event.target.value)}>
      {sizes.map(value => <option key={value} value={value}>{value}</option>)}
    </select>}
    {!loading && userId && !models.length && <button type="button" className={pill} onClick={() => setReload(value => value + 1)}>{zh ? '重试' : 'Retry'}</button>}
    {error && <span className="text-[11px] text-red-300/90">{error}</span>}
  </div>;

  return <div className="h-full relative">
    <ImageStudio locale={locale} previewMode persistenceId={userId}
      fytImage={{
        enabled: Boolean(userId && group && modelGroup === group && models.length && !loading && !running),
        generate,
        generateEdit,
        supportsEdit: true,
        controls,
        errorCopy,
        onOpenImage,
        transferring,
      }} />
  </div>;
}
