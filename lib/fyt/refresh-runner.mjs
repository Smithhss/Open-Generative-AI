// Adapted from foyton-relay c06146b96 frontend/src/lib/api/refresh-runner.ts.
export const REFRESH_RACE_BACKOFF_MS = [100, 250, 500];
export function isAuthBundle(value) {
    if (!value || typeof value !== "object")
        return false;
    const bundle = value;
    const user = bundle.user;
    const session = bundle.session;
    return (typeof bundle.access_token === "string" &&
        bundle.access_token.length > 0 &&
        typeof bundle.access_expires_at === "number" &&
        !!user &&
        typeof user.id === "number" &&
        typeof user.username === "string" &&
        !!session &&
        typeof session.sid === "string" &&
        session.sid.length > 0);
}
export async function runRefresh(deps) {
    let sid = deps.sid;
    let raceAttempts = 0;
    let mismatchRetried = false;
    for (;;) {
        let response;
        try {
            response = await deps.send(sid);
        }
        catch {
            return { kind: "transient", reason: "network" };
        }
        const body = (response.body ?? {});
        if (response.status === 200 && body.success === true && isAuthBundle(body.data)) {
            return { kind: "authenticated", bundle: body.data };
        }
        const code = typeof body.code === "string" ? body.code : "";
        if (response.status === 409 && code === "AUTH_REFRESH_RACE" && raceAttempts < REFRESH_RACE_BACKOFF_MS.length) {
            await deps.sleep(REFRESH_RACE_BACKOFF_MS[raceAttempts]);
            raceAttempts += 1;
            continue;
        }
        if (response.status === 409 && code === "AUTH_SESSION_MISMATCH" && !mismatchRetried && sid) {
            mismatchRetried = true;
            sid = undefined;
            continue;
        }
        if (response.status === 401 || response.status === 403) {
            return { kind: "anonymous" };
        }
        return { kind: "transient", reason: code || `status_${response.status}` };
    }
}
