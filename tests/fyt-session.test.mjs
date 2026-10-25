import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptAuthBundle, bootstrapSession, clearSession, getSessionState, refreshSession } from '../lib/fyt/session.mjs';
import { getAccount, logout } from '../lib/fyt/account.mjs';

const bundle = id => ({ access_token: `test-access-${id}`, access_expires_at: Date.now() / 1000 + 3600,
  user: { id, username: `user-${id}` }, session: { sid: `test-session-${id}` } });

test('successful server logout clears the in-memory credential and user', async () => {
  const original = globalThis.fetch;
  acceptAuthBundle(bundle(1), { broadcast: false });
  globalThis.fetch = async (path, init) => {
    assert.equal(path, '/api/user/auth/logout');
    assert.equal(init.headers['X-Auth-Session'], 'test-session-1');
    return Response.json({ success: true });
  };
  try {
    await logout();
    assert.equal(getSessionState().accessToken, null);
    assert.equal(getSessionState().user, null);
    assert.equal(getSessionState().status, 'anonymous');
  } finally { globalThis.fetch = original; clearSession(); }
});

test('account response from A is discarded after switching to B', async () => {
  const original = globalThis.fetch;
  let finish;
  acceptAuthBundle(bundle(1), { broadcast: false });
  globalThis.fetch = async path => {
    if (path === '/api/status') return Response.json({ success: true, data: {} });
    assert.equal(path, '/api/user/self');
    return new Promise(resolve => { finish = resolve; });
  };
  try {
    const pending = getAccount();
    await new Promise(resolve => setImmediate(resolve));
    acceptAuthBundle(bundle(2), { broadcast: false });
    finish(Response.json({ success: true, data: { id: 1, quota: 100 } }));
    await assert.rejects(pending, /SESSION_CHANGED/);
  } finally { globalThis.fetch = original; clearSession(); }
});

test('late logout of A cannot clear a newly signed-in B session', async () => {
  const original = globalThis.fetch;
  let finish;
  acceptAuthBundle(bundle(1), { broadcast: false });
  globalThis.fetch = async () => new Promise(resolve => { finish = resolve; });
  try {
    const pending = logout();
    acceptAuthBundle(bundle(2), { broadcast: false });
    finish(Response.json({ success: true }));
    await pending;
    assert.equal(getSessionState().user.id, 2);
  } finally { globalThis.fetch = original; clearSession(); }
});

test('account switch during bootstrap queues a fresh session check', async () => {
  const original = globalThis.fetch;
  let finish;
  let calls = 0;
  clearSession({ status: 'unknown' });
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Promise(resolve => { finish = resolve; });
    return Response.json({ success: true, data: bundle(2) });
  };
  try {
    const first = bootstrapSession();
    clearSession({ status: 'unknown' });
    const second = bootstrapSession();
    finish(Response.json({ success: true, data: bundle(1) }));
    await Promise.all([first, second]);
    assert.equal(calls, 2);
    assert.equal(getSessionState().status, 'authenticated');
    assert.equal(getSessionState().user.id, 2);
  } finally { globalThis.fetch = original; clearSession(); }
});

test('logout during refresh discards the late authentication bundle', async () => {
  const original = globalThis.fetch;
  let finish;
  clearSession({ status: 'unknown' });
  globalThis.fetch = async (path, init) => {
    assert.equal(path, '/api/user/auth/refresh');
    assert.equal(init.credentials, 'same-origin');
    return new Promise(resolve => { finish = resolve; });
  };
  try {
    const pending = refreshSession();
    clearSession();
    finish(Response.json({ success: true, data: bundle(1) }));
    assert.equal((await pending).reason, 'superseded');
    assert.equal(getSessionState().status, 'anonymous');
  } finally { globalThis.fetch = original; clearSession(); }
});

test('unavailable currency does not produce a guessed balance', async () => {
  const original = globalThis.fetch;
  acceptAuthBundle(bundle(1), { broadcast: false });
  globalThis.fetch = async (path, init) => {
    if (path === '/api/user/self') {
      assert.equal(init.headers.Authorization, 'Bearer test-access-1');
      return Response.json({ success: true, data: { id: 1, quota: 500000 } });
    }
    assert.equal(path, '/api/status');
    assert.equal(init.headers, undefined);
    return Response.json({ success: false }, { status: 503 });
  };
  try { await assert.rejects(getAccount(), /CURRENCY_UNAVAILABLE/); }
  finally { globalThis.fetch = original; clearSession(); }
});

