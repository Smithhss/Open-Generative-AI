// 工作台侧边栏的可见入口由管理员在后台控制，配置存在 fyt 的选项里：
//   key   Studio.VisibleTabs
//   value ["works","image","video"] 这样的 JSON 数组
// 没配置时用默认集合。页面出问题时管理员关掉对应入口即可，不用发版。

export const OPTION_KEY = 'Studio.VisibleTabs';

// 顺序与侧边栏一致，便于后台展示
export const STUDIO_TABS = [
  { id: 'works', zh: '作品', en: 'Works' },
  { id: 'image', zh: '图像工作室', en: 'Image studio' },
  { id: 'layers', zh: '图层工作室', en: 'Layers studio' },
  { id: 'design-agent', zh: '无限画布', en: 'Infinite canvas' },
  { id: 'video', zh: '视频工作室', en: 'Video studio' },
  { id: 'agents', zh: '智能体', en: 'Agents' },
  { id: 'apps', zh: '探索应用', en: 'Explore apps' },
];

export const DEFAULT_VISIBLE_TABS = ['works', 'image', 'video', 'layers', 'design-agent', 'agents'];

const KNOWN_IDS = new Set(STUDIO_TABS.map(tab => tab.id));

function parse(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    // 只认已知入口，避免脏数据把导航弄空
    const ids = parsed.filter(id => typeof id === 'string' && KNOWN_IDS.has(id));
    return ids;
  } catch {
    return null;
  }
}

const ENDPOINT = '/api/v1/creative-agent/studio-tabs';

// 公开只读：配置存在工作台自己的数据卷里
export async function fetchVisibleTabs(signal) {
  try {
    const response = await fetch(ENDPOINT, { signal, credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    const tabs = body?.tabs;
    if (!Array.isArray(tabs) || !tabs.length) return null;
    return tabs.filter(id => typeof id === 'string' && KNOWN_IDS.has(id));
  } catch {
    return null;
  }
}

// 写配置需要管理员令牌（服务端会向 fyt 校验角色）
export async function saveVisibleTabs(tabs, token, signal) {
  const response = await fetch(ENDPOINT, {
    method: 'PUT',
    signal,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ tabs }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    throw new Error(body?.message || body?.error?.message || `HTTP ${response.status}`);
  }
  return true;
}
