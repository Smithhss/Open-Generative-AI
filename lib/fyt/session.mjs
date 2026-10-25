// Adapted from foyton-relay c06146b96 frontend/src/lib/api/session.ts.
import { runRefresh } from "./refresh-runner.mjs";
import { publishSessionEvent } from "./session-sync.mjs";
const REFRESH_LOCK = "foyton-api:auth-refresh";
const SIGNED_IN_HINT = "foyton-api:signed-in";
const EXPIRY_MARGIN_SECONDS = 30;
const EMPTY = { status: "unknown", accessToken: null, accessExpiresAt: 0, user: null, session: null };
let state = EMPTY;
let epoch = 0;
let inflight = null;
let inflightEpoch = -1;
const listeners = new Set();
function setState(next) {
    state = next;
    listeners.forEach((listener) => listener());
}
export function getSessionState() {
    return state;
}
// Also invalidate requests across a sign-out / sign-in of the same account.
export function getSessionRevision() {
    return epoch;
}
export function getServerSessionState() {
    return EMPTY;
}
function rememberSignedIn(signedIn) {
    try {
        if (signedIn)
            localStorage.setItem(SIGNED_IN_HINT, "1");
        else
            localStorage.removeItem(SIGNED_IN_HINT);
    }
    catch {
        // Storage can be unavailable (private mode, SSR); the marker is only a hint.
    }
}
/** Whether this browser had a signed-in session, i.e. a session check is worth its refresh call. */
export function hadSignedInSession() {
    try {
        return localStorage.getItem(SIGNED_IN_HINT) === "1";
    }
    catch {
        return false;
    }
}
export function subscribeSession(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
export function acceptAuthBundle(bundle, options = {}) {
    const previousSid = state.session?.sid;
    epoch += 1;
    setState({
        status: "authenticated",
        accessToken: bundle.access_token,
        accessExpiresAt: bundle.access_expires_at,
        user: bundle.user,
        session: bundle.session,
    });
    rememberSignedIn(true);
    if (options.broadcast !== false && previousSid !== bundle.session.sid) {
        publishSessionEvent("authenticated", bundle.session.sid);
    }
}
export function updateSessionUser(user) {
    if (state.status === "authenticated")
        setState({ ...state, user });
}
export function clearSession(options = {}) {
    const sid = state.session?.sid;
    epoch += 1;
    const status = options.status ?? "anonymous";
    setState({ ...EMPTY, status });
    // "unknown" means another tab switched accounts and this one re-checks; keep the marker.
    if (status === "anonymous")
        rememberSignedIn(false);
    if (options.broadcast && sid)
        publishSessionEvent("signed_out", sid);
}
async function sendRefresh(sid) {
    const response = await fetch("/api/user/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: sid ? { "X-Auth-Session": sid } : {},
    });
    let body = null;
    try {
        body = await response.json();
    }
    catch {
        body = null;
    }
    return { status: response.status, body };
}
function withRefreshLock(task) {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (!locks)
        return task();
    return locks.request(REFRESH_LOCK, { mode: "exclusive" }, task);
}
export function refreshSession() {
    if (inflight) {
        if (inflightEpoch === epoch) return inflight;
        // A cross-tab account change invalidated this round-trip. Wait for its
        // cookie rotation to finish, then check the new session under the lock.
        return inflight.then(() => state.status === 'anonymous'
            ? { kind: 'anonymous' } : refreshSession());
    }
    const startedAt = epoch;
    inflightEpoch = epoch;
    const sid = state.session?.sid;
    inflight = withRefreshLock(() => runRefresh({ send: sendRefresh, sid, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }))
        .then((outcome) => {
        if (epoch !== startedAt)
            return { kind: "transient", reason: "superseded" };
        if (outcome.kind === "authenticated")
            acceptAuthBundle(outcome.bundle, { broadcast: false });
        else if (outcome.kind === "anonymous")
            clearSession({ status: "anonymous" });
        else if (state.status === "checking")
            setState({ ...state, status: "unknown" });
        return outcome;
    })
        .finally(() => {
        inflight = null;
    });
    return inflight;
}
function accessTokenIsFresh() {
    return Boolean(state.accessToken) && state.accessExpiresAt - EXPIRY_MARGIN_SECONDS > Date.now() / 1000;
}
/**
 * Resolve the session once per page load. Anonymous visitors cost one refresh
 * call (it counts against Go's shared critical rate limit), so marketing pages
 * never call this — only the console and the sign-in pages do.
 */
export async function bootstrapSession() {
    if (state.status === "authenticated" && accessTokenIsFresh())
        return "authenticated";
    if (state.status === "anonymous")
        return "anonymous";
    if (state.status === "unknown")
        setState({ ...state, status: "checking" });
    await refreshSession();
    return state.status;
}
export async function getAccessToken() {
    if (accessTokenIsFresh())
        return state.accessToken;
    if (state.status === "anonymous")
        return null;
    const outcome = await refreshSession();
    return outcome.kind === "authenticated" ? state.accessToken : null;
}
