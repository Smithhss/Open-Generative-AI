'use client';

const TOOLS = [
  { id: 'image', name: ['图片工作室', 'Image studio'], description: ['按分组选择图片模型生成单张图片，支持 b64 与 https 外链产物。', 'Generate one image with a model from your group; base64 and https artifacts both supported.'], status: ['已接入 · 按 fyt 用量扣费', 'Connected · Billed by fyt usage'] },
  { id: 'video', name: ['视频工作室', 'Video studio'], description: ['文生视频与图生视频，任务异步执行，可按任务编号恢复查询。', 'Text and image to video, run as async tasks that can be resumed by task id.'], status: ['已接入 · 异步任务 · 按用量扣费', 'Connected · Async task · Billed by usage'] },
  { id: 'agents', name: ['文本助手', 'Text assistants'], description: ['通用问答、提示词、分镜和文案，支持自定义角色。', 'Chat, visual prompts, storyboards and copy with customizable roles.'], status: ['已接入 · 需登录 · 调用消耗额度', 'Connected · Sign-in required · Uses credit'] },
  { id: 'design-agent', name: ['无限画布', 'Infinite canvas'], description: ['多图与文字自由排版、平移缩放、旋转和完整 PNG 导出。', 'Arrange images and text, pan, zoom, rotate and export the full composition.'], status: ['本地处理 · 不扣费', 'Local only · No charge'] },
  { id: 'layers', name: ['本地图片编辑', 'Local image editor'], description: ['导入图片、画笔标注、形状、调色与 PNG 导出。', 'Import images, draw annotations and shapes, adjust colors and export PNG.'], status: ['本地处理 · 不上传 · 不扣费', 'Local only · No upload or charge'] },
];

export default function FytAppsStudio({ locale, hrefForTab, onNavigate }) {
  const language = locale === 'zh' ? 0 : 1;
  return <div className="h-full overflow-y-auto p-5 md:p-10">
    <div className="max-w-5xl mx-auto">
      <p className="text-xs font-bold uppercase tracking-widest text-cyan-300 mb-3">FYT STUDIO</p>
      <h1 className="text-3xl font-black mb-3">{language === 0 ? '探索创作工具' : 'Explore creative tools'}</h1>
      <p className="text-sm text-white/40 mb-8">{language === 0 ? '只列出已经接入 fyt 的工具。生成类按 fyt 用量扣费，本地处理类不上传、不扣费。' : 'Only tools connected to fyt are listed. Generation is billed by fyt usage; local tools never upload or charge.'}</p>
      <div className="grid sm:grid-cols-2 gap-4">{TOOLS.map(tool => <a key={tool.id} href={hrefForTab(tool.id)} onClick={event => onNavigate(event, tool.id)} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:border-cyan-400/40 hover:bg-cyan-400/[0.03] transition-colors">
        <span className="text-[10px] font-bold text-cyan-300 block mb-4">{tool.status[language]}</span>
        <h2 className="text-lg font-bold text-white mb-2">{tool.name[language]}</h2>
        <p className="text-sm text-white/40 leading-relaxed">{tool.description[language]}</p>
        <span className="block mt-6 text-xs text-white/70">{language === 0 ? '打开工具 →' : 'Open tool →'}</span>
      </a>)}</div>
      <p className="text-xs text-white/30 mt-6">{language === 0 ? '工作流、音频、剪辑、唇形与电影等工具尚未接入，入口暂不展示。' : 'Workflows, audio, clipping, lip sync and cinema are not connected yet and are hidden from navigation.'}</p>
    </div>
  </div>;
}
