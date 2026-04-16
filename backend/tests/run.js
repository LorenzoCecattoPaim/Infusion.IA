import assert from "node:assert/strict";

import { buildRequireAuth } from "../src/auth/auth.middleware.js";
import { createPaymentCreateHandler } from "../src/payments/create-payment.controller.js";
import { createPayment, processWebhook } from "../src/payments/payment.service.js";
import { createInfinitePayWebhookHandler } from "../src/payments/webhook.controller.js";
import { createFakeSupabase } from "./helpers/fake-supabase.js";

const results = [];

function record(name, error = null) {
  results.push({ name, error });
}

async function run(name, fn) {
  try {
    await fn();
    record(name);
  } catch (error) {
    record(name, error);
  }
}

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

function createGatewayStub() {
  return {
    async createPaymentLink({ orderId, amountCents, credits }) {
      return {
        paymentUrl: `https://checkout.example/${orderId}?amount=${amountCents}&credits=${credits}`,
        gatewayOrderId: `gw-${orderId}`,
      };
    },
  };
}

await run("auth sem JWT retorna 401", async () => {
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

await run("auth com JWT inválido retorna 401", async () => {
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

await run("auth com JWT válido extrai userId", async () => {
  const requireAuth = buildRequireAuth({
    getSupabase: () =>
      createFakeSupabase({
        authUser: { id: "user-123", email: "qa@example.com" },
      }),
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
  assert.equal(req.user.id, "user-123");
  assert.equal(req.accessToken, "valid-token");
});

await run("createPayment cria order_nsu e persiste userId do backend", async () => {
  const store = { payment_orders: [] };
  const supabase = createFakeSupabase({ store });

  const result = await createPayment({
    supabase,
    gatewayProvider: createGatewayStub(),
    userId: "user-backend-1",
    credits: 50,
    amountCents: 9900,
    customer: { name: "Cliente" },
    appBaseUrl: "https://app.example.com",
  });

  assert.ok(result.orderId);
  assert.equal(result.status, "pending");
  assert.equal(store.payment_orders.length, 1);
  assert.equal(store.payment_orders[0].user_id, "user-backend-1");
  assert.equal(store.payment_orders[0].id, result.orderId);
});

await run("processWebhook aprova pedido e não duplica créditos", async () => {
  const store = {
    payment_orders: [
      {
        id: "test123",
        user_id: "user-1",
        credits: 25,
        amount_cents: 5000,
        status: "pending",
        gateway: "infinitepay",
        gateway_order_id: null,
        gateway_payment_url: "https://checkout.example/test123",
        transaction_nsu: null,
        credited_at: null,
      },
    ],
    user_credits: [{ user_id: "user-1", credits: 10, plan: "free" }],
    payment_credit_ledger: [],
    webhook_events: [],
  };

  const supabase = createFakeSupabase({
    store,
    rpcHandlers: {
      apply_payment_credits: async ({ p_order_id, p_user_id, p_amount }, db) => {
        const existing = db.payment_credit_ledger.find((row) => row.order_id === p_order_id);
        const activeRow = db.user_credits.find((row) => row.user_id === p_user_id);

        if (existing) {
          return { data: [{ applied: false, credits: activeRow.credits }], error: null };
        }

        db.payment_credit_ledger.push({
          order_id: p_order_id,
          user_id: p_user_id,
          amount: p_amount,
        });
        activeRow.credits += p_amount;
        const order = db.payment_orders.find((row) => row.id === p_order_id);
        order.credited_at = "2026-04-15T00:00:00.000Z";

        return { data: [{ applied: true, credits: activeRow.credits }], error: null };
      },
    },
  });

  const payload = {
    order_nsu: "test123",
    status: "PAID",
    transaction_nsu: "tx123",
    paid_amount: 5000,
  };

  const first = await processWebhook({
    supabase,
    payload,
    gatewayProvider: createGatewayStub(),
  });
  const second = await processWebhook({
    supabase,
    payload,
    gatewayProvider: createGatewayStub(),
  });

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(store.payment_orders[0].status, "approved");
  assert.equal(store.payment_orders[0].transaction_nsu, "tx123");
  assert.equal(store.user_credits[0].credits, 35);
  assert.equal(store.payment_credit_ledger.length, 1);
});

await run("processWebhook trata order_nsu inexistente sem quebrar", async () => {
  const supabase = createFakeSupabase({
    store: { payment_orders: [], user_credits: [] },
  });

  const result = await processWebhook({
    supabase,
    payload: {
      order_nsu: "missing-order",
      status: "PAID",
      transaction_nsu: "tx-missing",
    },
    gatewayProvider: createGatewayStub(),
  });

  assert.equal(result.success, false);
  assert.match(result.message, /Pedido/);
});

await run("webhook responde 200 rápido e processa em background", async () => {
  let processedPayload = null;
  const handler = createInfinitePayWebhookHandler({
    webhookSecret: "secret",
    getSupabase: () => createFakeSupabase({ store: { webhook_events: [] } }),
    processWebhook: async ({ payload }) => {
      processedPayload = payload;
      return { success: true, message: null };
    },
    gatewayProvider: createGatewayStub(),
  });

  const req = {
    query: { secret: "secret" },
    body: Buffer.from(
      JSON.stringify({
        order_nsu: "test123",
        status: "PAID",
        transaction_nsu: "tx123",
      })
    ),
    headers: {},
  };
  const res = createResponseCollector();

  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: null });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(processedPayload.order_nsu, "test123");
});

await run("POST /api/payments/create retorna checkoutUrl e ignora amount_cents do cliente", async () => {
  let capturedArgs = null;
  const handler = createPaymentCreateHandler({
    getSupabase: () => createFakeSupabase({ store: { payment_orders: [] } }),
    getBaseUrl: () => "https://app.example.com",
    gatewayProvider: createGatewayStub(),
    createPayment: async (args) => {
      capturedArgs = args;
      return {
        orderId: "order-100",
        paymentUrl: "https://checkout.example/order-100",
        status: "pending",
      };
    },
    planCatalog: {
      monthly: [{ id: "aprendiz_mensal", credits: 100, price: 8900 }],
    },
    env: {
      baseUrl: "https://api.infinitepay.io",
      handle: "lojateste",
      webhookSecret: "secret",
    },
  });

  const req = {
    body: { credits: 100, amount_cents: 1 },
    user: { id: "user-100" },
  };
  const res = createResponseCollector();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.checkoutUrl);
  assert.equal(res.body.payment_url, res.body.checkoutUrl);
  assert.equal(capturedArgs.amountCents, 8900);
  assert.equal(capturedArgs.customer, null);
  assert.doesNotThrow(() => new URL(res.body.checkoutUrl));
});

const failed = results.filter((result) => result.error);
for (const result of results) {
  if (result.error) {
    console.error(`FAIL ${result.name}`);
    console.error(result.error);
  } else {
    console.log(`PASS ${result.name}`);
  }
}

if (failed.length) {
  process.exitCode = 1;
} else {
  console.log(`ALL PASS ${results.length}`);
}
