'use client';

import { useEffect, useRef, useState } from 'react';
import { EDIT_ACCEPTED_TYPES, MAX_EDIT_BYTES, generateFytImageEdit, validateEditFile } from '@/lib/fyt/images.mjs';
import { modelOptions } from '@/lib/fyt/model-alias.mjs';

// 图生图单独做一层，不改上游 ImageStudio：上游在上传槽位上做了 `!fytImage` 判断，
// 直接改会抬高后续同步上游的成本。
export default function FytImageEditStudio({ locale, userId, group, model, models, running, onRunningChange, onSettled, errorCopy }) {
  const zh = locale === 'zh';
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const run = useRef(null);

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

  const field = 'bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-xs text-white disabled:opacity-40';
  const ready = Boolean(userId && group && model && file && prompt.trim() && !running);

  return <div className="h-full overflow-y-auto p-5 md:p-8">
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-cyan-300 mb-2">FYT IMAGE EDIT</p>
        <h1 className="text-2xl font-black mb-2">{zh ? '图生图' : 'Image edit'}</h1>
        <p className="text-sm text-white/40">
          {zh ? '上传一张参考图并描述要改什么。源图随请求直接上传，不经过第三方存储；单张计费，失败不自动重试。'
            : 'Upload a reference image and describe the change. The file is sent with the request only; one image per call, no automatic retry.'}
        </p>
      </div>

      {!userId && <p className="text-sm text-amber-300">{zh ? '请先登录 fyt。' : 'Sign in with fyt first.'}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-white/50">{zh ? '参考图' : 'Reference image'}
          <input type="file" accept={EDIT_ACCEPTED_TYPES.join(',')} disabled={running}
            className={`${field} mt-1 w-full file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-white`}
            onChange={pick} />
        </label>
        <label className="text-xs text-white/50">{zh ? '图片模型' : 'Image model'}
          <select className={`${field} mt-1 w-full`} value={model} disabled>
            {!models.length && <option value="">{zh ? '当前分组无可用模型' : 'No model in this group'}</option>}
            {modelOptions(models).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <p className="text-[11px] text-white/35">
        {zh ? `模型跟随上方「fyt 已接入」里的选择；上限 ${Math.round(MAX_EDIT_BYTES / 1024 / 1024)}MB。`
          : `The model follows the picker above; limit ${Math.round(MAX_EDIT_BYTES / 1024 / 1024)}MB.`}
      </p>

      <label className="block text-xs text-white/50">{zh ? '修改要求' : 'Instruction'}
        <textarea className={`${field} mt-1 w-full h-24 resize-y`} value={prompt} maxLength={4000} disabled={running}
          placeholder={zh ? '例如：把背景换成浅灰，保留主体和光线' : 'e.g. replace the background with light grey, keep the subject'}
          onChange={event => setPrompt(event.target.value)} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!ready} onClick={submit}
          className="bg-[#22d3ee] text-black px-5 py-2 rounded-lg text-sm font-bold disabled:opacity-40">
          {running ? (zh ? '生成中…' : 'Generating…') : (zh ? '生成图片' : 'Generate image')}
        </button>
        {result?.external && <span className="text-[11px] text-white/40">{zh ? '经同源代理加载，请及时下载' : 'Loaded through the same-origin proxy; download it soon'}</span>}
      </div>

      {error && <p role="alert" className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</p>}

      {preview && <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <p className="text-[11px] text-white/40 mb-2">{zh ? '参考图' : 'Reference'}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt={zh ? '参考图预览' : 'Reference preview'} className="max-h-56 rounded-lg" />
      </div>}

      {result && <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <p className="text-[11px] text-white/40 mb-2">{zh ? '结果' : 'Result'}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={result.url} alt={zh ? '图生图结果' : 'Edited image'} className="max-h-[420px] rounded-lg"
          onError={event => {
            // 网关没开产物代理时退回直连地址，避免整张图消失。
            const direct = result.externalUrl;
            if (direct && event.currentTarget.src !== direct) event.currentTarget.src = direct;
          }} />
        <a className="inline-block mt-3 text-xs text-cyan-300 underline" href={result.url} download target="_blank" rel="noreferrer">
          {zh ? '下载图片' : 'Download image'}
        </a>
      </div>}
    </div>
  </div>;
}
