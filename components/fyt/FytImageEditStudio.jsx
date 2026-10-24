'use client';

import { useEffect, useRef, useState } from 'react';
import { EDIT_ACCEPTED_TYPES, MAX_EDIT_BYTES, generateFytImageEdit, validateEditFile } from '@/lib/fyt/images.mjs';
import { modelOptions } from '@/lib/fyt/model-alias.mjs';

// 图生图沿用原版画布观感：深色底、细边、底部提示词条；不引入独立的标题区。
export default function FytImageEditStudio({ locale, userId, group, model, models, running, onRunningChange, onSettled, errorCopy, onBack }) {
  const zh = locale === 'zh';
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const run = useRef(null);
  const fileInput = useRef(null);

  useEffect(() => () => {
    run.current?.abort();
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function pick(event) {
    const next = event.target.files?.[0] || null;
    setError('');
    if (!next) { setFile(null); setPreview(''); return; }
    try {
      validateEditFile(next);
      if (preview) URL.revokeObjectURL(preview);
      setFile(next);
      setPreview(URL.createObjectURL(next));
    } catch {
      setFile(null); setPreview('');
      setError(zh ? '只支持 PNG / JPEG / WebP，且不超过 20MB。' : 'PNG / JPEG / WebP only, up to 20MB.');
    }
  }

  async function submit() {
    if (run.current || running || !userId || !group || !model || !file || !prompt.trim()) return;
    const controller = new AbortController(); run.current = controller;
    setError(''); setResult(null); onRunningChange?.(true);
    try {
      const output = await generateFytImageEdit({ model, group, prompt, file }, { signal: controller.signal });
      setResult(output);
    } catch (cause) {
      setError(errorCopy(cause));
    } finally {
      run.current = null;
      onRunningChange?.(false);
      if (!controller.signal.aborted) onSettled?.();
    }
  }

  const pill = 'rounded-full border border-white/10 bg-[#151515] px-3 py-1.5 text-xs text-white/85 transition-colors hover:border-white/25 disabled:opacity-40 disabled:hover:border-white/10';
  const ready = Boolean(userId && group && model && file && prompt.trim() && !running);

  return <div className="h-full flex flex-col bg-black">
    <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 border-b border-white/5">
      <button type="button" className={pill} onClick={onBack}>{zh ? '返回文生图' : 'Back'}</button>
      <select aria-label={zh ? '图片模型' : 'Image model'} className={pill} value={model} disabled>
        {!models.length && <option value="">{zh ? '无可用模型' : 'No model'}</option>}
        {modelOptions(models).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <button type="button" className={pill} disabled={running} onClick={() => fileInput.current?.click()}>
        {file ? (zh ? '换一张' : 'Replace') : (zh ? '上传参考图' : 'Upload reference')}
      </button>
      <input ref={fileInput} type="file" accept={EDIT_ACCEPTED_TYPES.join(',')} className="hidden" onChange={pick} />
      <span className="text-[11px] text-white/30">{zh ? `PNG/JPEG/WebP · 上限 ${Math.round(MAX_EDIT_BYTES / 1024 / 1024)}MB` : `PNG/JPEG/WebP · ${Math.round(MAX_EDIT_BYTES / 1024 / 1024)}MB max`}</span>
    </div>

    <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
      {!preview && !result && <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 text-white/30">
        <p className="text-sm">{zh ? '上传一张参考图，描述想改的地方' : 'Upload a reference image and describe the change'}</p>
      </div>}

      <div className="grid gap-4 md:grid-cols-2">
        {preview && <figure className="rounded-2xl border border-white/10 bg-[#0b0b0d] p-3">
          <figcaption className="text-[11px] text-white/40 mb-2">{zh ? '参考图' : 'Reference'}</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={zh ? '参考图预览' : 'Reference preview'} className="w-full rounded-xl" />
        </figure>}

        {result && <figure className="rounded-2xl border border-white/10 bg-[#0b0b0d] p-3">
          <figcaption className="flex items-center justify-between text-[11px] text-white/40 mb-2">
            <span>{zh ? '结果' : 'Result'}</span>
            <a className="text-cyan-300/90 hover:underline" href={result.url} download target="_blank" rel="noreferrer">{zh ? '下载' : 'Download'}</a>
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result.url} alt={zh ? '图生图结果' : 'Edited image'} className="w-full rounded-xl"
            onError={event => {
              // 网关没开产物代理时退回直连地址，避免整张图消失。
              const direct = result.externalUrl;
              if (direct && event.currentTarget.src !== direct) event.currentTarget.src = direct;
            }} />
        </figure>}
      </div>

      {error && <p role="alert" className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{error}</p>}
    </div>

    <div className="border-t border-white/5 px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea className="flex-1 resize-none rounded-2xl border border-white/10 bg-[#151515] px-4 py-3 text-sm text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none"
          rows={2} maxLength={4000} value={prompt} disabled={running}
          placeholder={zh ? '描述要改什么，例如：把背景换成浅灰，保留主体和光线' : 'Describe the change, e.g. replace the background with light grey'}
          onChange={event => setPrompt(event.target.value)} />
        <button type="button" disabled={!ready} onClick={submit}
          className="rounded-full bg-[#22d3ee] px-5 py-2.5 text-sm font-bold text-black transition-opacity disabled:opacity-40">
          {running ? (zh ? '生成中…' : 'Generating…') : (zh ? '绘制' : 'Generate')}
        </button>
      </div>
    </div>
  </div>;
}
