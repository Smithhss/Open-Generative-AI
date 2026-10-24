'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageStudio } from 'studio';
import { getChatGroups } from '@/lib/fyt/chat.mjs';
import { getImageModels, generateFytImage } from '@/lib/fyt/images.mjs';
import { modelOptions } from '@/lib/fyt/model-alias.mjs';
import FytImageEditStudio from '@/components/fyt/FytImageEditStudio';

export default function FytImageStudio({ locale, userId, active, onSettled, onOpenImage, transferring }) {
  const zh = locale === 'zh';
  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState('');
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [modelGroup, setModelGroup] = useState('');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [originalPreview, setOriginalPreview] = useState(false);
  const [mode, setMode] = useState('generate');
  const [editRunning, setEditRunning] = useState(false);
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
    getImageModels({ group, signal: controller.signal }).then(values => {
      if (!controller.signal.aborted) {
        setModels(values);
        setModel(previous => values.includes(previous) ? previous : values[0] || '');
        setModelGroup(group);
      }
    }).catch(cause => { if (!controller.signal.aborted) setError(errorCopy(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [group, userId, reload, zh]);
  async function generate(prompt) {
    if (run.current || !model || modelGroup !== group || !group || !userId) throw new Error('INVALID_IMAGE_REQUEST');
    const controller = new AbortController(); run.current = controller; setRunning(true);
    try { return await generateFytImage({ model, group, prompt }, { signal: controller.signal }); }
    finally { run.current = null; setRunning(false); if (!controller.signal.aborted) onSettled?.(); }
  }
  const field = 'bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-xs text-white disabled:opacity-40';
  const controls = <div className="flex flex-wrap items-center gap-2">
    <select aria-label={zh ? '图片分组' : 'Image group'} className={field} value={group} disabled={!userId || running || loading} onChange={event => setGroup(event.target.value)}>
      {!groups.length && <option value="">{zh ? '请先登录' : 'Sign in first'}</option>}
      {groups.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
    </select>
    <select aria-label={zh ? '图片模型' : 'Image model'} className={field} value={model} disabled={!userId || running || loading || !models.length} onChange={event => setModel(event.target.value)}>
      {!models.length && <option value="">{zh ? '无可用模型' : 'No model'}</option>}
      {modelOptions(models).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
    <button type="button" className={field} disabled={running || !userId} onClick={() => setReload(value => value + 1)}>{zh ? '刷新模型' : 'Refresh'}</button>
    <span className="text-xs text-white/45">{error || (loading ? (zh ? '读取模型…' : 'Loading…') : userId && !models.length ? (zh ? '当前分组无可用图片模型' : 'No image model in this group') : '')}</span>
  </div>;
  return <div className="h-full flex flex-col">
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#0b0b0d] px-4 py-2">
      <button type="button" aria-pressed={mode === 'generate'} className={`${field} ${mode === 'generate' ? 'border-cyan-400/40 text-cyan-200' : ''}`} onClick={() => setMode('generate')}>{zh ? '文生图' : 'Text to image'}</button>
      <button type="button" aria-pressed={mode === 'edit'} className={`${field} ${mode === 'edit' ? 'border-cyan-400/40 text-cyan-200' : ''}`} onClick={() => setMode('edit')}>{zh ? '图生图（上传参考图）' : 'Image edit (upload)'}</button>
      <span className="w-px h-5 bg-white/10" />
      <button type="button" aria-pressed={!originalPreview} className={`${field} ${!originalPreview ? 'border-cyan-400/40 text-cyan-200' : ''}`} onClick={() => setOriginalPreview(false)}>{zh ? 'fyt 已接入' : 'Connected to fyt'}</button>
      <button type="button" aria-pressed={originalPreview} className={`${field} ${originalPreview ? 'border-cyan-400/40 text-cyan-200' : ''}`} onClick={() => setOriginalPreview(true)}>{zh ? '原版完整界面' : 'Full original interface'}</button>
      <span className="text-[11px] text-white/45">{originalPreview ? (zh ? '保留原模型目录和参数展示，仅供预览；实际生图请切回 fyt 已接入。' : 'Original model catalog and parameters are for preview. Switch back to fyt to generate.') : (zh ? '已接入模型可实际生成，原版控件仍可在另一视图查看。' : 'Connected models can generate; original controls remain available in the other view.')}</span>
    </div>
    <div className="flex-1 min-h-0 relative">
      <div className={originalPreview || mode === 'edit' ? 'hidden' : 'h-full'}><ImageStudio locale={locale} previewMode persistenceId={userId} fytImage={{ enabled: Boolean(userId && group && modelGroup === group && models.length && !loading && !running), generate, controls, errorCopy, onOpenImage, transferring }} /></div>
      {originalPreview && <div className="h-full"><ImageStudio locale={locale} previewMode /></div>}
      {!originalPreview && mode === 'edit' && <FytImageEditStudio locale={locale} userId={userId} group={group} model={model} models={models}
        running={editRunning} onRunningChange={setEditRunning} onSettled={onSettled} errorCopy={errorCopy} />}
    </div>
  </div>;
}
