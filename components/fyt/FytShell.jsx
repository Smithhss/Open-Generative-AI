'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import StandaloneShell from '@/components/StandaloneShell';
import { bootstrapSession, clearSession, getServerSessionState, getSessionState, subscribeSession } from '@/lib/fyt/session.mjs';
import { subscribeSessionEvents } from '@/lib/fyt/session-sync.mjs';
import { getAccount, logout } from '@/lib/fyt/account.mjs';
import { formatQuota } from '@/lib/fyt/currency.mjs';

function FytAccountControls({ session, locale, authError, checkSession, balanceRevision }) {
  const zh = locale === 'zh';
  const [account, setAccount] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setAccount(null);
    setError('');
    if (session.status !== 'authenticated') return () => controller.abort();
    getAccount({ signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setAccount(result);
    }).catch(() => {
      if (!controller.signal.aborted) setError(zh ? '余额读取失败，点击重试' : 'Balance unavailable; click to retry');
    });
    return () => controller.abort();
  }, [session.status, session.user?.id, reload, zh, balanceRevision]);

  async function signOut() {
    if (!window.dispatchEvent(new Event('fyt:before-sign-out', { cancelable: true }))) return;
    setBusy(true);
    try { await logout(); }
    catch { setError(zh ? '退出失败，请重试' : 'Sign out failed; try again'); }
    finally { setBusy(false); }
  }
  function signIn() {
    const currentPath = window.location.pathname;
    const target = /^\/create\/(?:zh\/)?studio(?:\/[a-z0-9-]+)?$/.test(currentPath)
      ? currentPath : (zh ? '/create/zh/studio' : '/create/studio');
    window.location.assign(`/login?redirect=${encodeURIComponent(target)}`);
  }
  const buttonClass = 'px-3 py-1.5 rounded-md border border-white/10 bg-white/5 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-50';
  return <>
    <a href={zh ? '/create/studio' : '/create/zh/studio'} className={buttonClass}>{zh ? 'EN' : '中文'}</a>
    {session.status === 'authenticated' ? <>
      <button className={buttonClass} onClick={() => setReload(value => value + 1)} title={error || (zh ? '刷新余额' : 'Refresh balance')} aria-label={zh ? '刷新余额' : 'Refresh balance'}>
        <span className="hidden sm:inline mr-2">{session.user?.username}</span>
        {account ? formatQuota(account.user.quota, account.currency) : '—'}
      </button>
      <a href="/console" className={`${buttonClass} hidden sm:block`}>{zh ? '控制台' : 'Console'}</a>
      <button className={buttonClass} disabled={busy} onClick={signOut}>{zh ? '退出登录' : 'Sign out'}</button>
    </> : authError
      ? <button className={buttonClass} onClick={checkSession}>{zh ? '重新检查登录' : 'Check session'}</button>
      : <button className="bg-[#22d3ee] text-black px-4 py-2 rounded-lg text-xs font-bold" onClick={signIn}>
          {session.status === 'anonymous' ? (zh ? '登录 fyt' : 'Sign in with fyt') : (zh ? '正在检查登录…' : 'Checking session…')}
        </button>}
    {error && <span role="alert" className="absolute right-4 top-full mt-1 text-xs text-red-300 bg-[#111] p-2 rounded">{error}</span>}
  </>;
}

export default function FytShell({ locale = 'en' }) {
  const session = useSyncExternalStore(subscribeSession, getSessionState, getServerSessionState);
  const [authError, setAuthError] = useState(false);
  const [balanceRevision, setBalanceRevision] = useState(0);
  const onGenerationSettled = useCallback(() => setBalanceRevision(value => value + 1), []);
  const checkSession = useCallback(async () => {
    setAuthError(false);
    const status = await bootstrapSession();
    setAuthError(status === 'unknown' || status === 'checking');
  }, []);
  useEffect(() => {
    const unsubscribe = subscribeSessionEvents(event => {
      const current = getSessionState();
      if (event.kind === 'authenticated' && event.sid !== current.session?.sid) {
        clearSession({ status: 'unknown' });
        void checkSession();
      } else if (event.kind === 'signed_out' &&
          (event.sid === current.session?.sid || current.status === 'checking' || current.status === 'unknown')) {
        clearSession({ status: 'anonymous' });
      }
    });
    void checkSession();
    return unsubscribe;
  }, [checkSession]);

  // Never pass the access token to the upstream shell's API-key prop. Remount on
  // identity changes so prompts and media cannot survive a switch of account.
  const identity = session.status === 'authenticated' ? session.user?.id : null;
  return <StandaloneShell key={identity || 'anonymous'} locale={locale} fyt={{
    userId: identity,
    userEmail: session.user?.username || (identity ? `fyt-${identity}` : undefined),
    accessToken: session.session?.access_token || null,
    onGenerationSettled,
    controls: <FytAccountControls key={`${identity}:${session.session?.sid}`} session={session} locale={locale} authError={authError} checkSession={checkSession} balanceRevision={balanceRevision} />,
  }} />;
}
