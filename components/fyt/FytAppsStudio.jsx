'use client';

const TOOLS = [
  { id: 'design-agent', name: ['无限画布', 'Infinite canvas'], description: ['多图与文字自由排版、平移缩放、旋转和完整PNG导出。', 'Arrange images and text, pan, zoom, rotate and export the full composition.'], status: ['本地处理 · AI与云保存未接入', 'Local only · AI and cloud saving not connected'] },
  { id: 'agents', name: ['文本助手', 'Text assistants'], description: ['通用问答、提示词、分镜和文案，支持自定义角色。', 'Chat, visual prompts, storyboards and copy with customizable roles.'], status: ['已接入 · 需登录 · 调用消耗额度', 'Connected · Sign-in required · Uses credit'] },
  { id: 'layers', name: ['本地图片编辑', 'Local image editor'], description: ['导入图片、画笔标注、形状、调色与PNG导出。', 'Import images, draw annotations and shapes, adjust colors and export PNG.'], status: ['本地处理 · 不上传 · 不扣费', 'Local only · No upload or charge'] },
  { id: 'image', name: ['图片工作室', 'Image studio'], description: ['沿用原版布局，按分组选择图片模型生成单张图片。', 'Generate one image with a model from your group, using the original layout.'], status: ['文生图 · 按 fyt 用量扣费', 'Text to image · Billed by fyt usage'] },
  { id: 'video', name: ['视频工作室', 'Video studio'], description: ['文生视频与图生视频，任务异步执行，可按任务编号恢复查询。', 'Text and image to video, run as async tasks that can be resumed by task id.'], status: ['已接入 · 异步任务 · 按用量扣费', 'Connected · Async task · Billed by usage'] },
  { id: 'audio', name: ['音频工作室', 'Audio studio'], description: ['语音、音效和音乐创作；保留入口，待接音频模型与原界面。', 'Speech, sound effects and music. Original interface and audio integration pending.'], status: ['待接入 · 原界面待恢复', 'Not connected · Original UI pending'] },
  { id: 'clipping', name: ['AI剪辑', 'AI clipping'], description: ['原项目视频上传、片段与自动剪辑能力。', 'Original video upload, clips and automatic editing.'], status: ['待接入 · 原界面待恢复', 'Not connected · Original UI pending'] },
  { id: 'motion-control', name: ['动作控制', 'Motion control'], description: ['角色参考图与动作视频驱动生成。', 'Animate a character using reference images and motion video.'], status: ['待专属渠道 · 原界面待恢复', 'Dedicated channel required · Original UI pending'] },
  { id: 'vibe-motion', name: ['Vibe动效', 'Vibe motion'], description: ['原项目动效描述、编辑与渲染能力。', 'Original motion descriptions, editing and rendering.'], status: ['待接入 · 原界面待恢复', 'Not connected · Original UI pending'] },
  { id: 'lipsync', name: ['唇形同步', 'Lip sync'], description: ['组合人物视频与音频进行唇形同步。', 'Combine character video and audio for lip synchronization.'], status: ['待专属渠道 · 原界面待恢复', 'Dedicated channel required · Original UI pending'] },
  { id: 'body-swap', name: ['角色替换', 'Character replacement'], description: ['保留原项目换体与角色替换的功能入口。', 'Retain the original recast and character replacement entry.'], status: ['待专属渠道 · 原界面待恢复', 'Dedicated channel required · Original UI pending'] },
  { id: 'cinema', name: ['电影工作室', 'Cinema studio'], description: ['原项目分镜、镜头与电影创作工作流。', 'Original storyboards, shots and cinematic creation.'], status: ['待接入 · 原界面待恢复', 'Not connected · Original UI pending'] },
  { id: 'marketing', name: ['营销工作室', 'Marketing studio'], description: ['商品、广告文案与营销视频创作。', 'Products, ad copy and marketing video creation.'], status: ['待接入 · 原界面待恢复', 'Not connected · Original UI pending'] },
  { id: 'workflows', name: ['工作流', 'Workflows'], description: ['保留原节点编辑器与流程编排方向，执行器单独接入。', 'Retain the original node editor and orchestration; execution requires integration.'], status: ['编辑器待恢复 · 执行未接入', 'Editor pending · Execution not connected'] },
  { id: 'ai-influencer', name: ['AI网红', 'AI influencer'], description: ['原项目角色、人设与内容创作能力。', 'Original character, persona and content creation.'], status: ['待接入 · 原界面待恢复', 'Not connected · Original UI pending'] },
];

export default function FytAppsStudio({ locale, hrefForTab, onNavigate }) {
  const language = locale === 'zh' ? 0 : 1;
  return <div className="h-full overflow-y-auto p-5 md:p-10">
    <div className="max-w-5xl mx-auto">
      <p className="text-xs font-bold uppercase tracking-widest text-cyan-300 mb-3">FYT STUDIO</p>
      <h1 className="text-3xl font-black mb-3">{language === 0 ? '探索创作工具' : 'Explore creative tools'}</h1>
      <p className="text-sm text-white/40 mb-8">{language === 0 ? '查看各功能的实际接入状态。保留原项目全部工具入口，逐项显示接入和原界面恢复进度。' : 'See what is connected. All original tools are listed with integration and interface restoration status.'}</p>
      <div className="grid sm:grid-cols-2 gap-4">{TOOLS.map(tool => <a key={tool.id} href={hrefForTab(tool.id)} onClick={event => onNavigate(event, tool.id)} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:border-cyan-400/40 hover:bg-cyan-400/[0.03] transition-colors">
        <span className="text-[10px] font-bold text-cyan-300 block mb-4">{tool.status[language]}</span>
        <h2 className="text-lg font-bold text-white mb-2">{tool.name[language]}</h2>
        <p className="text-sm text-white/40 leading-relaxed">{tool.description[language]}</p>
        <span className="block mt-6 text-xs text-white/70">{language === 0 ? '打开工具 →' : 'Open tool →'}</span>
      </a>)}</div>
      <p className="text-xs text-white/30 mt-6">{language === 0 ? '工作流、AI媒体处理与设计助手的AI能力尚未接入。' : 'Workflows, AI media processing and AI design assistance are not connected yet.'}</p>
    </div>
  </div>;
}
