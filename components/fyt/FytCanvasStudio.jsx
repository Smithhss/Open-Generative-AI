'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { DesignAgentStudio } from 'studio';
import { authenticatedScope } from '@/lib/fyt/chat.mjs';
import { getSessionState, subscribeSession } from '@/lib/fyt/session.mjs';
import { loadLocalImage, validateLocalImageFile } from '../../packages/studio/src/localImage.js';
import { MAX_PROJECT_BYTES, buildCanvasProject, parseCanvasProject, prepareCanvasProject } from '../../packages/Open-AI-Design-Agent/packages/design-agent/src/localCanvasProject.js';

// 原版画布 + fyt 本地素材：素材只留在浏览器里，项目文件本地保存，不经过任何远端存储。
export default function FytCanvasStudio({ locale, active, userEmail, authToken, incomingImage, onImageHandled }) {
  const zh = locale === 'zh';
  const [ready, setReady] = useState(false);
  const [sourceCount, setSourceCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const projectInput = useRef(null);
  const imageInput = useRef(null);
  const incomingId = useRef(null);
  const canvas = useRef(null);
  const sources = useRef(new Map());
  const totals = useRef({ pixels: 0, bytes: 0 });
  const alive = useRef(true);
  const generation = useRef(0);
  const importing = useRef(false);
  const currentImport = useRef(null);

  // 画布把 localStorage.token 当 Bearer 发出去；令牌会刷新，必须跟着会话走，
  // 否则渲染时写一次，过期后就一直是无效令牌。
  useEffect(() => {
    const sync = () => {
      const state = getSessionState();
      try {
        if (state.status === 'authenticated' && state.accessToken) localStorage.setItem('token', state.accessToken);
        else localStorage.removeItem('token');
      } catch { /* 隐私模式忽略 */ }
    };
    sync();
    const unsubscribe = subscribeSession(sync);
    return () => { unsubscribe?.(); };
  }, []);

  const onProjectDirtyChange = useCallback(value => { dirtyRef.current = value; setDirty(value); }, []);

  useEffect(() => { alive.current = true; return () => {
    alive.current = false; generation.current++;
    currentImport.current?.abort();
    for (const source of sources.current.values()) source.release();
    sources.current.clear();
  }; }, []);

  // 画布挂载后把 ref 暴露出来，供项目文件与图片导入使用。
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => {
      if (canvas.current) { setReady(true); clearInterval(timer); }
    }, 200);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    const confirmDiscard = () => !dirtyRef.current || window.confirm(zh ? '画布有未保存的修改，确定放弃吗？' : 'Discard unsaved canvas changes?');
    const beforeUnload = event => { if (!dirtyRef.current) return; event.preventDefault(); event.returnValue = ''; };
    const beforeSignOut = event => { if (!confirmDiscard()) event.preventDefault(); };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('fyt:before-sign-out', beforeSignOut);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('fyt:before-sign-out', beforeSignOut);
    };
  }, [zh]);

  // 画布只接受 blob 源；AI 产物是远端地址，先取回字节注册成本地素材。
  const resolveAgentAsset = useCallback(async url => {
    try {
      const scope = await authenticatedScope();
      let blob;
      try {
        const response = await fetch(url, { ...scope.init });
        if (!response.ok) return null;
        blob = await response.blob();
      } finally { scope.close(); }
      const file = new File([blob], `agent-${Date.now()}.png`, { type: blob.type || 'image/png' });
      validateLocalImageFile(file);
      const loaded = await loadLocalImage(file);
      sources.current.set(loaded.url, { ...loaded, file });
      if (alive.current) setSourceCount(sources.current.size);
      return loaded.url;
    } catch {
      return null;
    }
  }, []);

  const isLocalSource = useCallback(url => sources.current.has(url), []);
  const releaseSources = useCallback(() => {
    generation.current++;
    currentImport.current?.abort();
    for (const source of sources.current.values()) source.release();
    sources.current.clear(); totals.current = { pixels: 0, bytes: 0 };
    if (alive.current) { setSourceCount(0); setError(''); setNotice(''); }
  }, []);

  const importFiles = useCallback(async files => {
    if (importing.current || !alive.current) return false;
    const batch = Array.from(files || []);
    if (!batch.length) return false;
    if (batch.length > 20) { setError(zh ? '一次最多导入20张图片。' : 'Import up to 20 images at a time.'); return false; }
    const epoch = generation.current;
    const controller = new AbortController();
    currentImport.current = controller; importing.current = true;
    setBusy(true); setError(''); setNotice('');
    let accepted = 0;
    try {
      for (const file of batch) {
        if (controller.signal.aborted || epoch !== generation.current || !alive.current) break;
        let loaded;
        try {
          validateLocalImageFile(file);
          if (sources.current.size >= 20 || totals.current.bytes + file.size > 50 * 1024 * 1024) throw new Error('ASSET_BUDGET');
          loaded = await loadLocalImage(file, { signal: controller.signal });
          const pixels = loaded.image.naturalWidth * loaded.image.naturalHeight;
          if (totals.current.pixels + pixels > 32000000) throw new Error('ASSET_BUDGET');
          if (controller.signal.aborted || epoch !== generation.current || !alive.current) { loaded.release(); break; }
          sources.current.set(loaded.url, { ...loaded, file });
          const added = await new Promise(resolve => {
            if (!canvas.current) { resolve(false); return; }
            canvas.current.addImage(loaded.url, undefined, undefined, undefined, undefined, resolve);
          });
          if (!added || controller.signal.aborted || epoch !== generation.current || !alive.current) {
            sources.current.delete(loaded.url); loaded.release();
            if (!added && !controller.signal.aborted && epoch === generation.current && alive.current) setError(zh ? '图片未加入画布，请检查元素数量上限。' : 'The image was not added. Check the element limit.');
            continue;
          }
          totals.current = { pixels: totals.current.pixels + pixels, bytes: totals.current.bytes + file.size };
          accepted++; setSourceCount(sources.current.size);
        } catch (cause) {
          if (loaded) { sources.current.delete(loaded.url); loaded.release(); }
          if (controller.signal.aborted || epoch !== generation.current || !alive.current) break;
          setError(cause.message === 'ASSET_BUDGET'
            ? (zh ? '本页累计素材达到上限（20张、32MP或50MB）。请先导出，再清空画布释放素材。' : 'Page asset limit reached (20 images, 32MP or 50MB). Export, then clear the canvas.')
            : (zh ? '部分图片无法导入。仅支持PNG/JPEG/WebP，单图最大10MB、8192单边及16MP。' : 'Some images could not be imported. Use PNG/JPEG/WebP, up to 10MB, 8192px per side and 16MP each.'));
        }
      }
    } finally {
      importing.current = false;
      if (alive.current) {
        setBusy(false);
        if (epoch === generation.current && accepted) setNotice(zh ? `已加入${accepted}张图片。` : `${accepted} images added.`);
      }
    }
    return accepted > 0;
  }, [zh]);

  useEffect(() => {
    if (!incomingImage || incomingId.current === incomingImage.id || !active || !ready || busy) return;
    incomingId.current = incomingImage.id;
    void importFiles([incomingImage.file]).then(success => onImageHandled?.(incomingImage.id, Boolean(success)));
  }, [incomingImage, active, ready, busy, importFiles, onImageHandled]);

  async function projectOperation(file) {
    if (importing.current || !alive.current || !canvas.current) return;
    const epoch = generation.current;
    const controller = new AbortController();
    currentImport.current = controller; importing.current = true;
    setBusy(true); setError(''); setNotice('');
    let prepared, committed = false;
    const valid = () => alive.current && epoch === generation.current && !controller.signal.aborted;
    try {
      if (!file) {
        const snapshot = canvas.current.getLocalProjectSnapshot();
        const project = await buildCanvasProject(snapshot, new Map(sources.current), { signal: controller.signal });
        if (!valid()) return;
        const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
        if (blob.size > MAX_PROJECT_BYTES) throw new Error('PROJECT_SIZE');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `canvas-${new Date().toISOString().replace(/[:.]/g, '-')}.fytcanvas`;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        const saved = canvas.current.markLocalProjectSaved(snapshot.token);
        setNotice(saved
          ? (zh ? '已生成项目文件，请确认浏览器已完成下载。' : 'Project file generated. Check your browser download.')
          : (zh ? '已生成开始保存时的项目快照；当前画布仍有未保存修改。' : 'Snapshot generated; newer canvas changes remain unsaved.'));
      } else {
        if (!file.size || file.size > MAX_PROJECT_BYTES) throw new Error('PROJECT_SIZE');
        const project = parseCanvasProject(await file.text());
        if (!valid()) return;
        prepared = await prepareCanvasProject(project, loadLocalImage, { signal: controller.signal });
        if (!valid()) return;
        if (dirtyRef.current && !window.confirm(zh ? '打开项目将替换当前未保存的画布，确定继续吗？' : 'Replace the current unsaved canvas?')) return;
        const previous = sources.current;
        const next = new Map([...prepared.assets.values()].map(source => [source.url, source]));
        sources.current = next;
        try {
          if (!canvas.current?.replaceLocalProject(prepared.project, prepared.assets)) throw new Error('PROJECT_RESTORE');
        } catch (cause) { sources.current = previous; throw cause; }
        committed = true;
        for (const source of previous.values()) source.release();
        totals.current = { bytes: 0, pixels: 0 };
        for (const source of next.values()) {
          totals.current.bytes += source.file.size;
          totals.current.pixels += source.image.naturalWidth * source.image.naturalHeight;
        }
        setSourceCount(next.size);
        setNotice(zh ? '项目已打开，可继续编辑。' : 'Project opened and ready to edit.');
      }
    } catch {
      if (valid()) setError(file
        ? (zh ? '项目无法打开：请检查文件格式、图片完整性和大小限制。当前画布已保留。' : 'Cannot open project. Check format, image integrity and size limits. Current canvas retained.')
        : (zh ? '项目文件生成失败，当前画布已保留。' : 'Could not generate project file. Current canvas retained.'));
    } finally {
      if (prepared && !committed) for (const source of prepared.assets.values()) source.release();
      importing.current = false;
      if (currentImport.current === controller) currentImport.current = null;
      if (alive.current) setBusy(false);
    }
  }

  // 工具条沿用原版画布的样式，插在缩放控件右侧。
  const tool = 'px-2 py-1 rounded border border-divider text-[10px] text-secondary-text hover:text-primary-text hover:border-primary transition-all disabled:opacity-40';
  const toolbar = <>
    <input type="file" accept=".fytcanvas,application/json" ref={projectInput} className="hidden"
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void projectOperation(file); }} />
    <input type="file" multiple accept="image/png,image/jpeg,image/webp" ref={imageInput} className="hidden"
      onChange={event => { void importFiles(event.target.files); event.target.value = ''; }} />
    <button type="button" className={tool} disabled={busy || !ready} onClick={() => projectInput.current?.click()}>{zh ? '打开项目' : 'Open'}</button>
    <button type="button" className={tool} disabled={busy || !ready} onClick={() => void projectOperation()}>{zh ? '保存项目' : 'Save'}</button>
    <button type="button" className={tool} disabled={busy || !ready} onClick={() => imageInput.current?.click()}>{busy ? (zh ? '导入中…' : 'Importing…') : (zh ? '导入图片' : 'Import')}</button>
    <button type="button" className={tool} disabled={busy || !ready} onClick={() => canvas.current?.exportCanvas()}>{zh ? '导出PNG' : 'Export'}</button>
    <button type="button" className={tool} disabled={busy || !ready} onClick={() => canvas.current?.clearCanvas()}>{zh ? '清空' : 'Clear'}</button>
    {dirty && <span className="text-[10px] text-amber-300 px-1">{zh ? '未保存' : 'Unsaved'}</span>}
  </>;

  return <div className="h-full flex flex-col">
    <Toaster position="top-center" />
    {(error || notice) && <div className="px-4 py-1.5 text-[11px] border-b border-white/5">
      {error ? <span role="alert" className="text-red-300">{error}</span> : <span role="status" className="text-cyan-300/80">{notice}</span>}
    </div>}
    <div className="flex-1 min-h-0">
      <DesignAgentStudio locale={locale} userEmail={userEmail} authToken={authToken}
        localCanvas onLocalFiles={importFiles} isLocalSource={isLocalSource} onLocalClear={releaseSources}
        onProjectDirtyChange={onProjectDirtyChange} canvasApiRef={canvas} toolbarExtra={toolbar}
        resolveAsset={resolveAgentAsset} />
    </div>
    {sourceCount > 0 && <span className="sr-only">{zh ? `${sourceCount}张来源图片` : `${sourceCount} source images`}</span>}
  </div>;
}
