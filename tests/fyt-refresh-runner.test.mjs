import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { REFRESH_RACE_BACKOFF_MS, runRefresh } from "../lib/fyt/refresh-runner.mjs";
const bundle = {
    access_token: "access",
    token_type: "Bearer",
    access_expires_at: 2_000_000_000,
    user: { id: 2, username: "tester" },
    session: { sid: "sid-new" },
};
function scripted(responses) {
    const sentSids = [];
    const sleeps = [];
    return {
        sentSids,
        sleeps,
        deps: {
            send: async (sid) => {
                sentSids.push(sid);
                const next = responses.shift();
                if (!next)
                    throw new Error("no scripted response left");
                return next;
            },
            sleep: async (ms) => {
                sleeps.push(ms);
            },
        },
    };
}
describe("runRefresh", () => {
    it("returns the bundle when the server rotates the refresh token", async () => {
        const s = scripted([{ status: 200, body: { success: true, data: bundle } }]);
        const outcome = await runRefresh({ ...s.deps, sid: "sid-old" });
        assert.equal(outcome.kind, "authenticated");
        assert.deepEqual(s.sentSids, ["sid-old"]);
    });
    it("backs off and retries while another tab wins the refresh race", async () => {
        const race = { status: 409, body: { success: false, code: "AUTH_REFRESH_RACE" } };
        const s = scripted([race, race, { status: 200, body: { success: true, data: bundle } }]);
        const outcome = await runRefresh({ ...s.deps, sid: "sid-old" });
        assert.equal(outcome.kind, "authenticated");
        assert.deepEqual(s.sleeps, REFRESH_RACE_BACKOFF_MS.slice(0, 2));
    });
    it("gives up as transient after the race backoff is exhausted", async () => {
        const race = { status: 409, body: { success: false, code: "AUTH_REFRESH_RACE" } };
        const s = scripted(Array.from({ length: REFRESH_RACE_BACKOFF_MS.length + 1 }, () => race));
        const outcome = await runRefresh({ ...s.deps, sid: "sid-old" });
        assert.deepEqual(outcome, { kind: "transient", reason: "AUTH_REFRESH_RACE" });
    });
    it("retries once without the stale sid on AUTH_SESSION_MISMATCH", async () => {
        const s = scripted([
            { status: 409, body: { success: false, code: "AUTH_SESSION_MISMATCH" } },
            { status: 200, body: { success: true, data: bundle } },
        ]);
        const outcome = await runRefresh({ ...s.deps, sid: "sid-stale" });
        assert.equal(outcome.kind, "authenticated");
        assert.deepEqual(s.sentSids, ["sid-stale", undefined]);
    });
    it("treats a rejected refresh cookie as signed out", async () => {
        const s = scripted([{ status: 401, body: { success: false, code: "AUTH_UNAUTHORIZED" } }]);
        assert.deepEqual(await runRefresh({ ...s.deps, sid: undefined }), { kind: "anonymous" });
    });
    it("keeps the session on rate limiting and server errors", async () => {
        const limited = scripted([{ status: 429, body: null }]);
        assert.deepEqual(await runRefresh({ ...limited.deps, sid: "sid" }), { kind: "transient", reason: "status_429" });
        const broken = scripted([{ status: 502, body: null }]);
        assert.deepEqual(await runRefresh({ ...broken.deps, sid: "sid" }), { kind: "transient", reason: "status_502" });
    });
    it("reports network failures as transient", async () => {
        const outcome = await runRefresh({
            sid: "sid",
            send: async () => {
                throw new TypeError("fetch failed");
            },
            sleep: async () => { },
        });
        assert.deepEqual(outcome, { kind: "transient", reason: "network" });
    });
    it("does not accept a success envelope without a usable bundle", async () => {
        const s = scripted([{ status: 200, body: { success: true, data: { access_token: "" } } }]);
        assert.deepEqual(await runRefresh({ ...s.deps, sid: "sid" }), { kind: "transient", reason: "status_200" });
    });
});
