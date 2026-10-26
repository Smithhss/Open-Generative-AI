import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STUDIO_TABS, DEFAULT_VISIBLE_TABS } from '../lib/fyt/tabs.mjs';
import { canvasText } from '../packages/Open-AI-Design-Agent/packages/design-agent/src/canvasLocale.mjs';

test('navigation settings retain all feature choices and require admin permission', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fyt-navigation-'));
  process.env.FYT_DATA_DIR = directory;
  process.env.FYT_INTERNAL_API = 'http://navigation.test';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(input).pathname, '/api/user/self');
    const admin = new Headers(init.headers).get('authorization') === 'Bearer fixture-admin-access-token';
    return Response.json({ success: true, data: { id: admin ? 1 : 2, role: admin ? 100 : 1 } });
  };
  try {
    const { handleCreativeAgent } = await import('../lib/fyt/creative-agent.mjs');
    const get = () => handleCreativeAgent(new Request('http://local/api/v1/creative-agent/studio-tabs'), ['studio-tabs']);
    const put = (tabs, token) => handleCreativeAgent(new Request('http://local/api/v1/creative-agent/studio-tabs', {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ tabs }),
    }), ['studio-tabs']);
    assert.deepEqual((await (await get()).json()).tabs, DEFAULT_VISIBLE_TABS);
    assert.equal((await put(['audio', 'mcp-cli'], 'fixture-user-access-token')).status, 403);
    assert.equal((await put(['audio', 'mcp-cli'], 'fixture-admin-access-token')).status, 200);
    assert.deepEqual((await (await get()).json()).tabs, ['audio', 'mcp-cli']);
    assert.equal((await put(DEFAULT_VISIBLE_TABS, 'fixture-admin-access-token')).status, 200);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'studio-tabs.json'), 'utf8')).tabs, STUDIO_TABS.map(tab => tab.id));
    assert.equal((await put([], 'fixture-admin-access-token')).status, 400);
    assert.equal((await put(['unknown-feature'], 'fixture-admin-access-token')).status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});

test('canvas controls switch language while preserving model names', () => {
  for (const text of ['Today', 'New Session', 'Upload Image', 'Session Assets', 'Copy Message', 'No previous sessions']) {
    assert.notEqual(canvasText('zh', text), text);
    assert.equal(canvasText('en', text), text);
  }
  assert.equal(canvasText('zh', 'GPT Image 2'), 'GPT Image 2');
});
