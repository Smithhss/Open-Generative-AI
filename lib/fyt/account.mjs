import { getAccessToken, getSessionRevision, getSessionState, refreshSession, clearSession } from './session.mjs';
import { currencyConfigFromStatus } from './currency.mjs';

export async function getAccount({ signal } = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const revision = getSessionRevision();
  const userId = getSessionState().user?.id;
  const [self, status] = await Promise.all([
    fetch('/api/user/self', { signal, headers: { Authorization: `Bearer ${token}` }, credentials: 'same-origin', cache: 'no-store' }),
    fetch('/api/status', { signal, credentials: 'same-origin', cache: 'no-store' }),
  ]);
  const [selfBody, statusBody] = await Promise.all([self.json(), status.json()]);
  if (revision !== getSessionRevision()) throw new Error('SESSION_CHANGED');
  if (self.status === 401) {
    await refreshSession();
    throw new Error('AUTH_REQUIRED');
  }
  if (!self.ok || selfBody.success !== true) throw new Error('ACCOUNT_UNAVAILABLE');
  if (!status.ok || statusBody.success !== true || !statusBody.data) throw new Error('CURRENCY_UNAVAILABLE');
  if (selfBody.data?.id !== userId || !Number.isFinite(selfBody.data?.quota)) throw new Error('INVALID_ACCOUNT');
  return { user: selfBody.data, currency: currencyConfigFromStatus(statusBody.data) };
}

export async function logout() {
  const { accessToken, session } = getSessionState();
  const revision = getSessionRevision();
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (session) headers['X-Auth-Session'] = session.sid;
  const response = await fetch('/api/user/auth/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers });
  if (!response.ok) throw new Error('LOGOUT_FAILED');
  const body = await response.json();
  if (body.success !== true) throw new Error('LOGOUT_FAILED');
  if (revision === getSessionRevision()) clearSession({ broadcast: true });
}
