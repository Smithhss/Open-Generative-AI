import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  videoRequestBody,
  normalizeVideoTask,
  isTerminalStatus,
  isSuccessStatus,
  fytVideoContentUrl,
  createFytVideo,
  fetchFytVideo,
} from '../lib/fyt/videos.mjs';

test('video request keeps only supported parameters', () => {
  assert.deepEqual(
    videoRequestBody({ model: 'kling-v2', group: 'default', prompt: ' a fox ', seconds: 5, size: '1280x720', imageUrl: 'https://cdn/x.png', seed: 1 }),
    { model: 'kling-v2', group: 'default', prompt: 'a fox', seconds: 5, size: '1280x720', input_reference: 'https://cdn/x.png' },
  );
  assert.equal(videoRequestBody({ model: 'kling-v2', group: 'default', prompt: 'hi' }).seconds, 4);
  for (const params of [
    { model: '', group: 'default', prompt: 'hi' },
    { model: 'kling-v2', group: '', prompt: 'hi' },
    { model: 'kling-v2', group: 'default', prompt: ' ' },
  ]) assert.throws(() => videoRequestBody(params), /INVALID_VIDEO_REQUEST/);
});

test('task response accepts id or task_id and rejects empty payloads', () => {
  assert.deepEqual(normalizeVideoTask({ id: 'task-1', status: 'queued', model: 'kling-v2' }), { id: 'task-1', status: 'queued', model: 'kling-v2' });
  assert.equal(normalizeVideoTask({ task_id: 'task-2' }).id, 'task-2');
  for (const body of [{}, { id: '' }, { id: 42 }]) assert.throws(() => normalizeVideoTask(body), /INVALID_VIDEO_RESPONSE/);
});

test('status helpers treat failures as terminal and only completed as success', () => {
  assert.equal(isTerminalStatus('completed'), true);
  assert.equal(isTerminalStatus('failed'), true);
  assert.equal(isTerminalStatus('in_progress'), false);
  assert.equal(isSuccessStatus('completed'), true);
  assert.equal(isSuccessStatus('failed'), false);
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
    acceptAuthBundle(bundle(1), { broadcast: false });
    globalThis.fetch = async () => { calls += 1; throw new TypeError('network'); };
    await assert.rejects(createFytVideo(parameters));
    assert.equal(calls, 1);

    globalThis.fetch = async () => { calls += 1; return Response.json({ error: { message: 'expired' } }, { status: 401 }); };
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
    return Response.json({ id: 'task-9', status: 'in_progress' });
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
