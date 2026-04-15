import test from "node:test";
import assert from "node:assert/strict";

import { buildRequireAuth } from "../src/auth/auth.middleware.js";
import { createFakeSupabase } from "./helpers/fake-supabase.js";

function createResponseCollector() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

test("requireAuth retorna 401 sem JWT", async () => {
  const requireAuth = buildRequireAuth({
    getSupabase: () => createFakeSupabase(),
    sendError,
  });

  const req = { headers: {}, originalUrl: "/api/profile", method: "GET" };
  const res = createResponseCollector();
  let nextCalled = false;

  await requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "Token ausente.");
});

test("requireAuth retorna 401 com JWT inválido", async () => {
  const requireAuth = buildRequireAuth({
    getSupabase: () =>
      createFakeSupabase({
        authError: new Error("jwt malformed"),
      }),
    sendError,
  });

  const req = {
    headers: { authorization: "Bearer invalid-token" },
    originalUrl: "/api/profile",
    method: "GET",
  };
  const res = createResponseCollector();

  await requireAuth(req, res, () => {
    throw new Error("next não deveria ser chamado");
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "Token inválido ou expirado.");
});

test("requireAuth extrai userId de JWT válido", async () => {
  const user = { id: "user-123", email: "qa@example.com" };
  const requireAuth = buildRequireAuth({
    getSupabase: () => createFakeSupabase({ authUser: user }),
    sendError,
  });

  const req = {
    headers: { authorization: "Bearer valid-token" },
    originalUrl: "/api/profile",
    method: "GET",
  };
  const res = createResponseCollector();
  let nextCalled = false;

  await requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.id, user.id);
  assert.equal(req.accessToken, "valid-token");
});
