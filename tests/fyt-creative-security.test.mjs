import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('creative resources require gateway identity and retain their owner', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fyt-creative-security-'));
  process.env.FYT_DATA_DIR = directory;
  process.env.FYT_INTERNAL_API = 'http://gateway.test';
  process.env.FYT_TICKET_SECRET = 'security-fixture-secret-with-32-bytes';
  await writeFile(join(directory, 'creative-agent.json'), JSON.stringify({
    sessions: {
      legacy: { id: 'legacy', messages: [], assets: [], jobs: [] },
      oldReference: { id: 'oldReference', owner_id: 101, messages: [], assets: [{ asset_label: 'old-asset', kind: 'image', url: 'https://old-external.test/image.png' }], jobs: [] },
    }, jobs: {},
  }));
  const { handleCreativeAgent } = await import('../lib/fyt/creative-agent.mjs');
  const originalFetch = globalThis.fetch;
  const tokenA = 'fixture-access-token-for-user-101';
  const tokenB = 'fixture-access-token-for-user-202';
  let blockModels = false;
  const blocked = [];
  let generationCalls = 0;
  let planningCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    assert.equal(url.origin, 'http://gateway.test', 'credentials must never leave the gateway');
    assert.equal(new Headers(init.headers).has('cookie'), false);
    if (url.pathname === '/api/user/self') {
      const token = new Headers(init.headers).get('authorization');
      const id = token === `Bearer ${tokenA}` ? 101 : token === `Bearer ${tokenB}` ? 202 : null;
      return Response.json(id ? { success: true, data: { id, role: 1 } } : { success: false }, { status: id ? 200 : 401 });
    }
    if (url.pathname === '/api/user/models') {
      if (blockModels) return new Promise(resolve => blocked.push(() => resolve(Response.json({ success: true, data: [] }))));
      return Response.json({ success: true, data: url.searchParams.get('type') === 'image' ? ['image-a', 'image-b'] : ['chat-a'] });
    }
    if (url.pathname === '/api/user/artifacts/not-owned') return Response.json({ error: 'forbidden' }, { status: 403 });
    if (url.pathname === '/pg/chat/completions') {
      planningCalls++;
      return Response.json({ choices: [{ message: { content: 'a landscape' } }] });
    }
    if (url.pathname === '/pg/images/generations') {
      generationCalls++;
      return Response.json({ error: { message: 'fixture upstream unavailable' } }, { status: 502 });
    }
    throw new Error('Unexpected gateway request');
  };
  const request = (segments, { token = tokenA, method = 'GET', body } = {}) => handleCreativeAgent(
    new Request(`http://studio.test/api/${segments.join('/')}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }), segments,
  );
  const create = async token => {
    const response = await request(['sessions'], { token, method: 'POST', body: {} });
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    await t.test('anonymous and forged credentials cannot access private routes', async () => {
      for (const segments of [['sessions'], ['jobs', 'unknown', 'events'], ['files', 'unknown']]) {
        assert.equal((await request(segments, { token: null })).status, 401);
        assert.equal((await request(segments, { token: 'forged-opaque-token-value' })).status, 401);
      }
      assert.equal((await request(['studio-tabs'], { token: null })).status, 200);
      assert.equal((await request(['studio-templates'], { token: null })).status, 200);
    });
    await t.test('another user cannot list, read, overwrite or delete a session', async () => {
      const session = await create(tokenA);
      const list = await (await request(['sessions'], { token: tokenB })).json();
      assert.equal(list.some(item => item.id === session.id || item.id === 'legacy'), false);
      for (const tail of ['messages', 'assets', 'jobs']) {
        assert.equal((await request(['sessions', session.id, tail], { token: tokenB })).status, 404);
      }
      for (const method of ['PATCH', 'DELETE']) assert.equal((await request(['sessions', session.id], { token: tokenB, method, ...(method === 'PATCH' ? { body: { name: 'stolen' } } : {}) })).status, 404);
      assert.equal((await request(['sessions', 'legacy', 'messages'])).status, 404);
      assert.equal((await request(['sessions', session.id, 'messages'], { method: 'PATCH', body: { messages: [{ role: 'user', content: 'owner message' }] } })).status, 200);
      const messages = await (await request(['sessions', session.id, 'messages'])).json();
      assert.equal(messages[0].content, 'owner message');
    });
    await t.test('external and unsafe reference URLs are rejected before fetch', async () => {
      const session = await create(tokenA);
      for (const url of ['https://attacker.test/image.png', 'http://127.0.0.1/private', '//attacker.test/image', '/api/user/self', '/pg/images/artifact/../private', 'data:image/svg+xml;base64,PHN2Zz4=']) {
        assert.equal((await request(['sessions', session.id, 'assets'], { method: 'POST', body: { url } })).status, 400, url);
      }
      assert.equal((await request(['sessions', session.id, 'assets'], { method: 'POST', body: { url: 'data:image/png;base64,iVBORw0KGgo=' } })).status, 200);
    });
    await t.test('jobs have owners and concurrent submissions are limited without charging', async () => {
      blockModels = true;
      const session = await create(tokenA);
      try {
        const jobs = [];
        for (let i = 0; i < 2; i++) {
          const response = await request(['sessions', session.id, 'chat'], { method: 'POST', body: { message: 'fixture' } });
          assert.equal(response.status, 200);
          jobs.push((await response.json()).job_id);
        }
        assert.equal((await request(['sessions', session.id, 'chat'], { method: 'POST', body: { message: 'third' } })).status, 429);
        assert.equal((await request(['jobs', jobs[0], 'events'], { token: tokenB })).status, 404);
        assert.equal((await request(['sessions', session.id], { method: 'DELETE' })).status, 409);
        assert.equal(generationCalls, 0);
      } finally {
        blockModels = false;
        for (const release of blocked.splice(0)) release();
        await new Promise(resolve => setImmediate(resolve));
      }
    });
    await t.test('a chargeable image POST is not retried on ambiguous failure', async () => {
      const session = await create(tokenB);
      const response = await request(['sessions', session.id, 'chat'], { token: tokenB, method: 'POST', body: { message: 'fixture' } });
      assert.equal(response.status, 200);
      const { job_id: id } = await response.json();
      for (let i = 0; i < 30; i++) {
        const status = await (await request(['jobs', id], { token: tokenB })).json();
        if (status.status === 'done') break;
        await new Promise(resolve => setImmediate(resolve));
      }
      assert.equal(generationCalls, 1);
    });
    await t.test('deleting a session during body upload cannot enqueue an orphan charge', async () => {
      const session = await create(tokenA);
      let controller;
      let reading;
      const started = new Promise(resolve => { reading = resolve; });
      const stream = new ReadableStream({ start(value) { controller = value; } });
      const upload = new Request('http://studio.test/chat', { method: 'POST', duplex: 'half', body: stream, headers: { Authorization: `Bearer ${tokenA}` } });
      const body = upload.body;
      Object.defineProperty(upload, 'body', { value: { getReader() { reading(); return body.getReader(); } } });
      const before = generationCalls;
      const pending = handleCreativeAgent(upload, ['sessions', session.id, 'chat']);
      await started;
      assert.equal((await request(['sessions', session.id], { method: 'DELETE' })).status, 200);
      controller.enqueue(new TextEncoder().encode('{"message":"fixture"}'));
      controller.close();
      assert.equal((await pending).status, 404);
      assert.equal(generationCalls, before);
    });
    await t.test('legacy unsupported references fail before any chargeable planning', async () => {
      const before = planningCalls;
      const response = await request(['sessions', 'oldReference', 'chat'], { method: 'POST', body: { message: 'edit', canvas_state: { selected: 'old-asset' } } });
      assert.equal(response.status, 200);
      const { job_id: id } = await response.json();
      for (let i = 0; i < 30; i++) {
        if ((await (await request(['jobs', id])).json()).status === 'done') break;
        await new Promise(resolve => setImmediate(resolve));
      }
      assert.equal(planningCalls, before);
    });
    await t.test('unregistered selected local images cannot become chargeable text-to-image', async () => {
      const session = await create(tokenA);
      const before = planningCalls;
      const response = await request(['sessions', session.id, 'chat'], { method: 'POST', body: { message: 'edit this image', canvas_state: { selected: null, selected_unregistered_image: true } } });
      assert.equal(response.status, 400);
      assert.equal(planningCalls, before);
      assert.deepEqual(await (await request(['sessions', session.id, 'jobs'])).json(), []);
    });
    await t.test('unreadable internal references fail before chargeable planning', async () => {
      const session = await create(tokenA);
      const response = await request(['sessions', session.id, 'assets'], { method: 'POST', body: { url: '/api/user/artifacts/not-owned' } });
      assert.equal(response.status, 200);
      const asset = await response.json();
      const before = planningCalls;
      const created = await request(['sessions', session.id, 'chat'], { method: 'POST', body: { message: 'edit', canvas_state: { selected: asset.asset_label } } });
      const { job_id: id } = await created.json();
      for (let i = 0; i < 30; i++) {
        if ((await (await request(['jobs', id])).json()).status === 'done') break;
        await new Promise(resolve => setImmediate(resolve));
      }
      assert.equal(planningCalls, before);
    });
    await t.test('queued jobs are durable before charging and storage failure rejects submission', async () => {
      const stored = JSON.parse(await readFile(join(directory, 'creative-agent.json'), 'utf8'));
      assert.ok(Object.values(stored.jobs).some(job => job.owner_id === 202));
      const session = await create(tokenB);
      const previous = await readFile(join(directory, 'creative-agent.json'));
      const before = planningCalls;
      await rm(directory, { recursive: true });
      await writeFile(directory, 'fixture blocks directory creation');
      try {
        assert.equal((await request(['sessions', session.id, 'chat'], { token: tokenB, method: 'POST', body: { message: 'fixture' } })).status, 503);
        assert.equal(planningCalls, before);
        assert.deepEqual(await (await request(['sessions', session.id, 'jobs'], { token: tokenB })).json(), []);
      } finally {
        await rm(directory);
        await mkdir(directory);
        await writeFile(join(directory, 'creative-agent.json'), previous);
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise(resolve => setTimeout(resolve, 500));
    await rm(directory, { recursive: true, force: true });
  }
});
