'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Toaster } from 'react-hot-toast';
import { loadLocalImage, validateLocalImageFile } from '../../packages/studio/src/localImage.js';
import { MAX_PROJECT_BYTES, buildCanvasProject, parseCanvasProject, prepareCanvasProject } from '../../packages/Open-AI-Design-Agent/packages/design-agent/src/localCanvasProject.js';
import styles from './FytCanvasStudio.module.css';

const CanvasArea = dynamic(() => import('design-agent').then(module => module.CanvasArea), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-sm text-white/40">Loading canvas…</div>,
});
const button = 'rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:opacity-30';

export default function FytCanvasStudio({ locale, active, incomingImage, onImageHandled }) {
  const zh = locale === 'zh';
  const [visited, setVisited] = useState(active);
  const [zoom, setZoom] = useState(100);
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [sourceCount, setSourceCount] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const projectInput = useRef(null);
  const onProjectDirtyChange = useCallback(value => { dirtyRef.current = value; setDirty(value); }, []);
  const incomingId = useRef(null);
  const canvas = useRef(null);
  const input = useRef(null);
  const sources = useRef(new Map());
  const totals = useRef({ pixels: 0, bytes: 0 });
  const alive = useRef(true);
  const generation = useRef(0);
  const importing = useRef(false);
  const currentImport = useRef(null);

  useEffect(() => { if (active) setVisited(true); }, [active]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false; generation.current++;
      currentImport.current?.abort();
      for (const source of sources.current.values()) source.release();
      sources.current.clear();
    };
  }, []);
  useEffect(() => {
    const confirmDiscard = () => !dirtyRef.current || window.confirm(zh ? '画布有未保存的修改，确定放弃吗？' : 'Discard unsaved canvas changes?');
    const beforeUnload = event => {
      if (!dirtyRef.current) return;
      event.preventDefault(); event.returnValue = '';
    };
    const beforeSignOut = event => { if (!confirmDiscard()) event.preventDefault(); };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('fyt:before-sign-out', beforeSignOut);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('fyt:before-sign-out', beforeSignOut);
    };
  }, [zh]);
  const isLocalSource = useCallback(url => sources.current.has(url), []);
  const onNodeCountChange = useCallback(value => { setCount(value); setReady(true); }, []);
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
    if (!batch.length) return;
    if (batch.length > 20) { setError(zh ? '一次最多导入20张图片。' : 'Import up to 20 images at a time.'); return; }
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
            ? (zh ? '本页累计素材达到上限（20张、32MP或50MB）。请先导出，再清空画布释放素材。' : 'Page asset limit reached (20 images, 32MP or 50MB). Export, then clear the canvas to release assets.')
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

  function addText() {
    if (!text.trim() || !canvas.current) return;
    canvas.current.addText(text); setText('');
  }

  return <div className={`${styles.root} h-full flex flex-col text-white`}>
    <Toaster position="top-center" />
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-white/10 bg-[#0e1015]">
      <h1 className="text-sm font-bold text-cyan-300 mr-2">{zh ? '本地无限画布' : 'Local infinite canvas'}</h1>
      <input type="file" accept=".fytcanvas,application/json" ref={projectInput} className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void projectOperation(file); }} />
      <button className={button} disabled={busy || !ready} onClick={() => projectInput.current?.click()}>{zh ? '打开项目' : 'Open project'}</button>
      <button className={button} disabled={busy || !ready} onClick={() => void projectOperation()}>{zh ? '保存项目' : 'Save project'}</button>
      <span className="text-[11px] text-amber-200" role="status">{dirty ? (zh ? '未保存' : 'Unsaved') : (zh ? '无未保存修改' : 'No unsaved changes')}</span>
      <input type="file" multiple accept="image/png,image/jpeg,image/webp" ref={input} className="hidden" onChange={event => { void importFiles(event.target.files); event.target.value = ''; }} />
      <button className={button} disabled={busy || !ready} onClick={() => input.current?.click()}>{busy ? (zh ? '导入中…' : 'Importing…') : (zh ? '导入图片' : 'Import images')}</button>
      <button className={button} disabled={!count || busy} onClick={() => canvas.current?.fitAll()}>{zh ? '适应全部内容' : 'Fit all'}</button>
      <button className={button} disabled={!count || busy} onClick={() => canvas.current?.exportCanvas()}>{zh ? '导出全部PNG' : 'Export all PNG'}</button>
      <button className={button} disabled={!count && !sourceCount && !busy} onClick={() => canvas.current?.clearCanvas()}>{zh ? '清空画布' : 'Clear canvas'}</button>
      <span className="text-[11px] text-white/35 ml-auto">{zh ? `${count}/100个元素 · ${sourceCount}/20张来源图片` : `${count}/100 elements · ${sourceCount}/20 source images`}</span>
    </div>
    <div className="flex-1 min-h-0 flex flex-col md:flex-row">
      <div className="relative flex-1 min-h-0 min-w-0">
        {visited && <CanvasArea ref={canvas} theme="dark" localOnly active={active} onLocalFiles={importFiles} isLocalSource={isLocalSource} onLocalClear={releaseSources} onProjectDirtyChange={onProjectDirtyChange} onZoomChange={setZoom} onNodeCountChange={onNodeCountChange} />}
        {!count && !busy && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-5">
          <h2 className="text-2xl font-black text-white/80 mb-3">{zh ? '把想法放在同一张画布上' : 'Put your ideas on one canvas'}</h2>
          <p className="text-xs text-white/35">{zh ? '导入或拖入图片，也可以从右侧添加文字。' : 'Import or drop images, or add text from the tools panel.'}</p>
        </div>}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl bg-[#1a1d26] border border-white/10 p-2 shadow-xl">
          <button aria-label={zh ? '缩小' : 'Zoom out'} className={button} onClick={() => canvas.current?.zoomOut()}>−</button>
          <span className="w-14 text-center text-xs text-white/60">{zoom}%</span>
          <button aria-label={zh ? '放大' : 'Zoom in'} className={button} onClick={() => canvas.current?.zoomIn()}>+</button>
          <button className={button} onClick={() => canvas.current?.resetZoom()}>100%</button>
        </div>
      </div>
      <aside className="w-full md:w-64 shrink-0 max-h-[40%] md:max-h-none overflow-y-auto border-t md:border-t-0 md:border-l border-white/10 p-4 bg-[#101219]">
        <h2 className="text-xs font-bold mb-3">{zh ? '文字与排版' : 'Text and layout'}</h2>
        <textarea aria-label={zh ? '画布文字' : 'Canvas text'} className="w-full bg-black/30 rounded-lg border border-white/10 p-3 text-xs outline-none focus:border-cyan-400/40" rows={3} maxLength={6000} value={text} onChange={event => setText(event.target.value)} placeholder={zh ? '输入要放到画布上的文字…' : 'Text to place on the canvas…'} />
        <button className={`${button} w-full mt-2`} disabled={!ready || !text.trim() || count >= 100} onClick={addText}>{zh ? '添加文字' : 'Add text'}</button>
        <p className="text-xs text-white/45 leading-relaxed mt-5">{zh ? '拖动空白处平移，滚轮缩放。选中元素后拖动、缩放或旋转，双击文字编辑；右键可复制、排列、锁定、隐藏或删除。' : 'Drag empty space to pan and scroll to zoom. Select elements to move, resize or rotate. Double-click text to edit; right-click for copy, order, lock, hide or delete.'}</p>
        <p className="text-xs text-white/35 leading-relaxed mt-4">{zh ? '素材不上传、不扣费。保存项目可下载含原图的可编辑.fytcanvas文件，打开可恢复布局与视口。切换菜单保留，刷新或切换账号会清空，请先保存。云端保存尚未接入。' : 'No upload or charge. Save an editable .fytcanvas project with original images, layout and viewport. Navigation retains the canvas; save before reload or account changes. Cloud saving is not connected.'}</p>
        <p className="text-[11px] text-white/30 leading-relaxed mt-4">{zh ? '导出为透明背景PNG，包含全部可见图片与文字，不含网格和选择框。元素跨度过大时需移近后再导出。' : 'PNG export includes all visible images and text on a transparent background, without grid or selection handles. Move widely separated elements closer if export exceeds the size limit.'}</p>
        {error && <p role="alert" className="text-xs text-red-300 mt-4">{error}</p>}
        {notice && <p role="status" className="text-xs text-cyan-300 mt-4">{notice}</p>}
      </aside>
    </div>
  </div>;
}
