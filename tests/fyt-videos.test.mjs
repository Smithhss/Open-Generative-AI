import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  videoRequestBody,
  normalizeVideoTask,
  normalizeStatus,
  isTerminalStatus,
  isSuccessStatus,
  fytVideoContentUrl,
  createFytVideo,
  fetchFytVideo,
  saveVideoTask,
  loadVideoTask,
  clearVideoTask,
} from '../lib/fyt/videos.mjs';

test('video request keeps only supported parameters', () => {
  assert.deepEqual(
    videoRequestBody({ model: 'kling-v2', group: 'default', prompt: ' a fox ', seconds: 5, size: '1280x720', imageUrl: 'https://cdn/x.png', seed: 1 }),
    { model: 'kling-v2', group: 'default', prompt: 'a fox', seconds: '5', size: '1280x720', input_reference: 'https://cdn/x.png' },
  );
  assert.equal(videoRequestBody({ model: 'kling-v2', group: 'default', prompt: 'hi' }).seconds, '4');
  for (const params of [
    { model: '', group: 'default', prompt: 'hi' },
    { model: 'kling-v2', group: '', prompt: 'hi' },
    { model: 'kling-v2', group: 'default', prompt: ' ' },
  ]) assert.throws(() => videoRequestBody(params), /INVALID_VIDEO_REQUEST/);
});

test('task response accepts id or task_id and rejects empty payloads', () => {
  assert.deepEqual(normalizeVideoTask({ id: 'task-1', status: 'queued', model: 'kling-v2' }), { id: 'task-1', status: 'queued', model: 'kling-v2' });
  assert.equal(normalizeVideoTask({ task_id: 'task-2' }).id, 'task-2');
  // 网关查询接口把任务包在 data 里。
  assert.deepEqual(normalizeVideoTask({ code: 'success', data: { id: 'task-3', status: 'SUCCESS' } }), { id: 'task-3', status: 'completed', model: '' });
  for (const body of [{}, { id: '' }, { id: 42 }]) assert.throws(() => normalizeVideoTask(body), /INVALID_VIDEO_RESPONSE/);
});

test('status vocabulary from the gateway is normalized before comparison', () => {
  assert.equal(normalizeStatus('SUCCESS'), 'completed');
  assert.equal(normalizeStatus('completed'), 'completed');
  assert.equal(normalizeStatus('IN_PROGRESS'), 'in_progress');
  assert.equal(normalizeStatus('QUEUED'), 'queued');
  assert.equal(normalizeStatus('FAILED'), 'failed');
  assert.equal(normalizeStatus(''), 'unknown');
  assert.equal(normalizeStatus(undefined), 'unknown');
});

test('status helpers treat failures as terminal and only completed as success', () => {
  assert.equal(isTerminalStatus('completed'), true);
  assert.equal(isTerminalStatus('failed'), true);
  assert.equal(isTerminalStatus('in_progress'), false);
  // 网关返回大写，未归一化时轮询永远不会结束。
  assert.equal(isTerminalStatus('SUCCESS'), true);
  assert.equal(isTerminalStatus('FAILED'), true);
  assert.equal(isTerminalStatus('IN_PROGRESS'), false);
  assert.equal(isSuccessStatus('SUCCESS'), true);
  assert.equal(isSuccessStatus('completed'), true);
  assert.equal(isSuccessStatus('failed'), false);
});

test('task id survives a reload so polling can resume', () => {
  const store = new Map();
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  };
  try {
    assert.equal(loadVideoTask(1), null);
    saveVideoTask(1, { id: 'task-7', model: 'seedance-2.5', status: 'QUEUED' });
    assert.deepEqual(loadVideoTask(1), { id: 'task-7', model: 'seedance-2.5', status: 'queued' });
    // 不同用户互不可见
    assert.equal(loadVideoTask(2), null);
    clearVideoTask(1);
    assert.equal(loadVideoTask(1), null);
    // 脏数据不应抛错
    store.set('fyt.video.task.3', '{not json');
    assert.equal(loadVideoTask(3), null);
  } finally {
    globalThis.localStorage = original;
  }
});

test('content url encodes the task id', () => {
  assert.equal(fytVideoContentUrl('a/b'), '/pg/videos/a%2Fb/content');
});

test('video submit is never retried and surfaces auth loss', async () => {
  const { acceptAuthBundle, clearSession } = await import('../lib/fyt/session.mjs');
  const bundle = id => ({ access_token: `fixture-${id}`, access_expires_at: Date.now() / 1000 + 3600, user: { id }, session: { sid: `sid-${id}` } });
  const original = globalThis.fetch;
  const parameters = { model: 'kling-v2', group: 'default', prompt: 'fox', seconds: 5 };
  try {
    let calls = 0;
    // 只统计对 /pg/videos 的提交次数：提交前会先刷新令牌，那不是重发。
    const countSubmit = url => { if (String(url).includes('/pg/videos')) calls += 1; };
    acceptAuthBundle(bundle(1), { broadcast: false });
    globalThis.fetch = async url => { countSubmit(url); throw new TypeError('network'); };
    await assert.rejects(createFytVideo(parameters));
    assert.equal(calls, 1);

    globalThis.fetch = async url => { countSubmit(url); return Response.json({ error: { message: 'expired' } }, { status: 401 }); };
    await assert.rejects(createFytVideo(parameters), /AUTH_REQUIRED/);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
    clearSession();
  }
});

test('polling reads status without issuing a second submission', async () => {
  const { acceptAuthBundle, clearSession } = await import('../lib/fyt/session.mjs');
  const original = globalThis.fetch;
  const seen = [];
  acceptAuthBundle({ access_token: 'fixture', access_expires_at: Date.now() / 1000 + 3600, user: { id: 1 }, session: { sid: 'sid' } }, { broadcast: false });
  globalThis.fetch = async (url, init) => {
    seen.push([url, init?.method || 'GET']);
    return Response.json({ code: 'success', message: '', data: { id: 'task-9', status: 'IN_PROGRESS' } });
  };
  try {
    const result = await fetchFytVideo('task-9');
    assert.equal(result.status, 'in_progress');
    assert.deepEqual(seen, [['/pg/videos/task-9', 'GET']]);
  } finally {
    globalThis.fetch = original;
    clearSession();
  }
});
