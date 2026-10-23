// Adapted from foyton-relay c06146b96 frontend/src/lib/api/session-sync.ts.
/**
 * Cross-tab sign-in / sign-out notifications.
 *
 * The channel name, storage key and event shape are shared with the legacy
 * console (same origin), so a sign-out in either app is seen by the other.
 * Tokens are never sent — only the session id and the kind of change.
 */
const CHANNEL_NAME = "foyton-api:auth-session";
const STORAGE_KEY = "foyton-api:auth-session:event";
function randomId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
        return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
const tabSource = randomId();
let publisher = null;
function isSessionEvent(value) {
    if (!value || typeof value !== "object")
        return false;
    const event = value;
    return ((event.kind === "authenticated" || event.kind === "signed_out") &&
        typeof event.sid === "string" &&
        event.sid.length > 0 &&
        typeof event.source === "string" &&
        typeof event.nonce === "string" &&
        typeof event.timestamp === "number");
}
export function publishSessionEvent(kind, sid) {
    if (typeof window === "undefined" || !sid)
        return;
    const event = { kind, sid, source: tabSource, nonce: randomId(), timestamp: Date.now() };
    if (typeof BroadcastChannel !== "undefined") {
        publisher ??= new BroadcastChannel(CHANNEL_NAME);
        publisher.postMessage(event);
        return;
    }
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(event));
        window.localStorage.removeItem(STORAGE_KEY);
    }
    catch {
        // Storage can be unavailable (private mode); cross-tab sync is best effort.
    }
}
export function subscribeSessionEvents(handler) {
    if (typeof window === "undefined")
        return () => { };
    const deliver = (value) => {
        if (isSessionEvent(value) && value.source !== tabSource)
            handler(value);
    };
    let channel = null;
    const onMessage = (message) => deliver(message.data);
    if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.addEventListener("message", onMessage);
    }
    const onStorage = (event) => {
        if (event.key !== STORAGE_KEY || !event.newValue)
            return;
        try {
            deliver(JSON.parse(event.newValue));
        }
        catch {
            // Ignore malformed payloads from other scripts.
        }
    };
    window.addEventListener("storage", onStorage);
    return () => {
        channel?.removeEventListener("message", onMessage);
        channel?.close();
        window.removeEventListener("storage", onStorage);
    };
}
