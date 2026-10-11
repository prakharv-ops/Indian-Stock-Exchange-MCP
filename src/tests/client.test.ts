import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiClient, ApiError } from "../client.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function client(fetchImpl: typeof fetch, extra = {}) {
  return new ApiClient({ apiKey: "test-key", baseUrl: "https://example.test", retries: 2, fetchImpl, ...extra });
}

test("sends the API key and query params, skipping undefined values", async () => {
  let seen: { url: string; key: string | null } | undefined;
  const api = client((async (url: URL, init: RequestInit) => {
    seen = { url: String(url), key: new Headers(init.headers).get("x-api-key") };
    return json({ ok: true });
  }) as any);
  await api.get("/stock", { name: "Tata Steel", period: undefined });
  assert.equal(seen?.url, "https://example.test/stock?name=Tata+Steel");
  assert.equal(seen?.key, "test-key");
});

test("caches identical requests and de-duplicates concurrent ones", async () => {
  let calls = 0;
  const api = client((async () => {
    calls++;
    return json({ n: calls });
  }) as any);
  const [a, b] = await Promise.all([api.get("/news"), api.get("/news")]);
  assert.deepEqual(a, b);
  await api.get("/news");
  assert.equal(calls, 1);
});

test("does not cache when ttl is 0", async () => {
  let calls = 0;
  const api = client((async () => (calls++, json({}))) as any, { cacheTtlMs: 0 });
  await api.get("/news");
  await api.get("/news");
  assert.equal(calls, 2);
});

test("retries 5xx and 429 then succeeds", async () => {
  const statuses = [503, 429, 200];
  const api = client((async () => json({ ok: 1 }, statuses.shift())) as any);
  assert.deepEqual(await api.get("/x"), { ok: 1 });
  assert.equal(statuses.length, 0);
});

test("does not retry 4xx and reports a helpful message", async () => {
  let calls = 0;
  const api = client((async () => (calls++, json({ detail: "nope" }, 401))) as any);
  await assert.rejects(api.get("/x"), (e: ApiError) => e.status === 401 && /ISE_API_KEY/.test(e.message));
  assert.equal(calls, 1);
});

test("gives up after retries on persistent failure", async () => {
  let calls = 0;
  const api = client((async () => (calls++, json({}, 500))) as any);
  await assert.rejects(api.get("/x"), (e: ApiError) => e.status === 500);
  assert.equal(calls, 3);
});

test("fails fast when no API key is configured", async () => {
  const api = new ApiClient({ apiKey: "", fetchImpl: (async () => json({})) as any });
  await assert.rejects(api.get("/x"), /ISE_API_KEY is not set/);
});

test("never leaks the API key in errors", async () => {
  const api = client((async () => json({}, 404)) as any);
  await assert.rejects(api.get("/x"), (e: Error) => !e.message.includes("test-key"));
});
