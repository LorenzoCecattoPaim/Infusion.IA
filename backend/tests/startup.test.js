import test from "node:test";
import assert from "node:assert/strict";

test("server module carrega sem crash com env mínima", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SERVICE_ROLE_KEY = "service-role-key";
  process.env.INFINITEPAY_HANDLE = "handle";
  process.env.INFINITEPAY_BASE_URL = "https://api.example.com";
  process.env.INFINITEPAY_WEBHOOK_SECRET = "secret";
  process.env.AI_API_KEY = "test-openai-key";
  process.env.PORT = "0";

  const serverModule = await import(`../server.js?ts=${Date.now()}`);

  assert.equal(typeof serverModule.app.use, "function");
  assert.equal(typeof serverModule.startServer, "function");
  assert.equal(typeof serverModule.syncStartupTasks, "function");
});
