// 模型别名：把「上游 Studio 的模型 id」和「fyt 实际提供的模型名」对上，
// 同时给下拉框提供可读名称。两件事共用一张表，避免显示名和实际调用再次漂移。
//
// 说明：fyt 模式下生图/生视频都走 fyt 自己的模型目录，这里的上游别名主要解决两件事：
//   1. 界面只显示 `gpt-image-2.5-flare` 这种原始 id，用户看不懂；
//   2. 上游界面（原版预览）里的模型名和 fyt 模型名不是同一套，需要能互相解析。

// fyt 模型名 → 展示名。未收录的模型直接显示原始 id，不做猜测。
const MODEL_LABELS = Object.freeze({
  'gpt-image-2': 'GPT Image 2',
  'gpt-image-2.5-flare': 'GPT Image 2.5 Flare',
  'gpt-image-2.5-sunburst': 'GPT Image 2.5 Sunburst',
  'gemini-nano-banana-2.1': 'Nano Banana 2.1',
  'gemini-3-pro-image-preview': 'Gemini 3 Pro Image',
  'gemini-3.1-flash-image': 'Gemini 3.1 Flash Image',
  'gemini-3.1-flash-image-preview': 'Gemini 3.1 Flash Image (preview)',
  'seedance-2.0': 'Seedance 2.0',
  'seedance-2.5': 'Seedance 2.5',
});

// 上游 Studio 的模型 id → fyt 模型候选（按优先级）。候选都不可用时返回 null，
// 调用方应禁用生成并提示，而不是发一个必然失败的请求。
const UPSTREAM_ALIASES = Object.freeze({
  'gpt-image-1': ['gpt-image-2', 'gpt-image-2.5-flare'],
  'gpt-image-1.5': ['gpt-image-2'],
  'gpt-image-2': ['gpt-image-2'],
  'nano-banana': ['gemini-nano-banana-2.1'],
  'nano-banana-edit': ['gemini-nano-banana-2.1'],
  'gemini-2.5-flash-image': ['gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview'],
  'gemini-3-pro-image': ['gemini-3-pro-image-preview'],
  'seedance-2.0': ['seedance-2.0', 'seedance-2.5'],
  'seedance-2.5': ['seedance-2.5'],
});

export function labelForModel(id) {
  if (typeof id !== 'string') return '';
  const name = id.trim();
  return MODEL_LABELS[name] || name;
}

// 返回 { value, label }，value 必须是 fyt 的真实模型名，label 只用于展示。
export function modelOptions(models) {
  if (!Array.isArray(models)) return [];
  const seen = new Set();
  const options = [];
  for (const item of models) {
    if (typeof item !== 'string') continue;
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: labelForModel(value) });
  }
  return options;
}

// 把上游模型 id 解析成当前分组里真实可用的 fyt 模型；解析不到返回 null。
export function resolveFytModel(upstreamId, available) {
  if (typeof upstreamId !== 'string' || !upstreamId.trim()) return null;
  if (!Array.isArray(available)) return null;
  const usable = new Set(available.filter(item => typeof item === 'string').map(item => item.trim()));
  const candidates = UPSTREAM_ALIASES[upstreamId.trim()] || [upstreamId.trim()];
  for (const candidate of candidates) {
    if (usable.has(candidate)) return candidate;
  }
  return null;
}

// 供界面提示：上游模型在当前分组是否有对应实现。
export function isModelMapped(upstreamId, available) {
  return resolveFytModel(upstreamId, available) !== null;
}

// 模型卡片上显示的厂商名，只用于展示；未收录的归到 fyt。
const MODEL_VENDORS = [
  ['gpt-image', 'OpenAI'],
  ['gemini', 'Google'],
  ['seedance', 'ByteDance'],
  ['doubao', 'ByteDance'],
  ['flux', 'Black Forest'],
  ['kling', 'Kuaishou'],
  ['ideogram', 'Ideogram'],
  ['minimax', 'MiniMax'],
  ['qwen', 'Alibaba'],
  ['deepseek', 'DeepSeek'],
  ['claude', 'Anthropic'],
];

export function vendorForModel(id) {
  if (typeof id !== 'string') return 'fyt';
  const name = id.toLowerCase();
  const hit = MODEL_VENDORS.find(([prefix]) => name.startsWith(prefix));
  return hit ? hit[1] : 'fyt';
}
