// 提示词模板：把「不知道写什么」变成「点一下就有一句能用的」。
// 内容放在代码里，随版本走；以后要后台可编辑，再迁到数据卷（参考侧边栏开关的做法）。
//
// 占位符用 {{xxx}} 表示，点选后用户自己替换成真实内容。

export const TEMPLATE_GROUPS = [
  { id: 'product', zh: '产品', en: 'Product' },
  { id: 'portrait', zh: '人像', en: 'Portrait' },
  { id: 'scene', zh: '场景', en: 'Scene' },
  { id: 'video', zh: '视频', en: 'Video' },
];

export const TEMPLATES = [
  {
    id: 'product-hero',
    group: 'product',
    kind: 'image',
    zh: '产品主图',
    en: 'Product hero',
    promptZh: '{{产品}} 的产品主图，纯色背景，柔和的侧顶光，45 度俯视，细节清晰，商业摄影质感，留出上方空白用于文案',
    promptEn: 'Hero product shot of {{product}} on a clean solid background, soft top-side lighting, 45-degree angle, crisp details, commercial photography, empty space at the top for copy',
  },
  {
    id: 'product-scene',
    group: 'product',
    kind: 'image',
    zh: '场景化产品图',
    en: 'Product in scene',
    promptZh: '{{产品}} 放在{{场景}}中，自然光，浅景深，生活方式摄影，画面有生活气息，产品处于视觉中心',
    promptEn: '{{product}} placed in {{scene}}, natural light, shallow depth of field, lifestyle photography, lived-in atmosphere, product as the visual focus',
  },
  {
    id: 'product-flatlay',
    group: 'product',
    kind: 'image',
    zh: '平铺摆拍',
    en: 'Flat lay',
    promptZh: '{{产品}} 与{{配件}}平铺在{{材质}}台面上，正俯视，均匀柔光，极简构图，留白充足',
    promptEn: 'Flat lay of {{product}} with {{accessories}} on a {{material}} surface, top-down view, even soft light, minimal composition, generous negative space',
  },
  {
    id: 'portrait-studio',
    group: 'portrait',
    kind: 'image',
    zh: '棚拍人像',
    en: 'Studio portrait',
    promptZh: '{{人物}}的棚拍肖像，浅灰背景，蝴蝶光，85mm 镜头，皮肤质感自然，眼神清晰',
    promptEn: 'Studio portrait of {{person}} on a light grey backdrop, butterfly lighting, 85mm lens, natural skin texture, sharp catchlights',
  },
  {
    id: 'portrait-cinematic',
    group: 'portrait',
    kind: 'image',
    zh: '电影感人物',
    en: 'Cinematic portrait',
    promptZh: '{{人物}}在{{环境}}中，黄昏侧逆光，暖色调，电影感构图，轻微胶片颗粒',
    promptEn: '{{person}} in {{environment}}, golden-hour rim light, warm tones, cinematic framing, subtle film grain',
  },
  {
    id: 'scene-illustration',
    group: 'scene',
    kind: 'image',
    zh: '插画场景',
    en: 'Illustration scene',
    promptZh: '{{主题}}的扁平插画，{{主色调}}配色，几何化造型，干净的线条，留白构图，适合做封面',
    promptEn: 'Flat illustration of {{subject}}, {{palette}} palette, geometric shapes, clean lines, airy composition, cover-ready',
  },
  {
    id: 'scene-avatar',
    group: 'scene',
    kind: 'image',
    zh: '头像',
    en: 'Avatar',
    promptZh: '{{风格}}风格的头像，人物居中，圆形构图友好，背景简洁，色彩明快，适合社交平台',
    promptEn: '{{style}} style avatar, centered subject, circle-crop friendly, simple background, vivid colors, social-profile ready',
  },
  {
    id: 'scene-poster',
    group: 'scene',
    kind: 'image',
    zh: '活动海报底图',
    en: 'Poster background',
    promptZh: '{{活动主题}}的海报底图，{{氛围}}氛围，主体在右侧，左侧大面积留白放文案，高对比度',
    promptEn: 'Poster background for {{event}}, {{mood}} mood, subject on the right, large empty area on the left for copy, high contrast',
  },
  {
    id: 'video-storyboard',
    group: 'video',
    kind: 'video',
    zh: '产品分镜',
    en: 'Product storyboard',
    promptZh: '{{产品}}在{{场景}}中的特写镜头，镜头缓慢推近，光线柔和，质感细腻，适合作为广告分镜的第一镜',
    promptEn: 'Close-up of {{product}} in {{scene}}, slow push-in, soft lighting, rich texture, first shot of an ad storyboard',
  },
  {
    id: 'video-talking',
    group: 'video',
    kind: 'video',
    zh: '口播场景',
    en: 'Talking head',
    promptZh: '{{人物}}正面半身，坐在{{场景}}里对着镜头说话，自然光，背景轻微虚化，机位稳定',
    promptEn: 'Medium shot of {{person}} facing camera in {{scene}}, natural light, softly blurred background, locked-off camera',
  },
  {
    id: 'video-demo',
    group: 'video',
    kind: 'video',
    zh: '产品演示',
    en: 'Product demo',
    promptZh: '{{产品}}被{{动作}}，手部特写，桌面场景，光线均匀，动作流畅，突出使用细节',
    promptEn: '{{product}} being {{action}}, close-up on hands, tabletop scene, even lighting, smooth motion, showing usage details',
  },
  {
    id: 'video-atmosphere',
    group: 'video',
    kind: 'video',
    zh: '氛围空镜',
    en: 'Atmosphere shot',
    promptZh: '{{场景}}的氛围空镜，{{时间}}的光线，轻微镜头运动，无人，适合作为转场',
    promptEn: 'Atmospheric empty shot of {{scene}} at {{time}}, gentle camera movement, no people, good as a transition',
  },
];

export function templatesFor(kind) {
  return TEMPLATES.filter(template => template.kind === kind);
}

// 模板里有 {{xxx}} 时提示用户替换，返回占位符列表
export function placeholdersIn(text) {
  if (typeof text !== 'string') return [];
  return [...new Set([...text.matchAll(/\{\{([^}]+)\}\}/g)].map(match => match[1].trim()))];
}
