import test from "node:test";
import assert from "node:assert/strict";

import { createPayment, processWebhook } from "../src/payments/payment.service.js";
import { createInfinitePayWebhookHandler } from "../src/payments/webhook.controller.js";
import { createFakeSupabase } from "./helpers/fake-supabase.js";

function createGatewayStub() {
  return {
    async createPaymentLink({ orderId, amountCents, credits }) {
      return {
        paymentUrl: `https://checkout.example/${orderId}?amount=${amountCents}&credits=${credits}`,
        gatewayOrderId: `ord-${orderId}`,
        invoiceSlug: `inv-${orderId}`,
        transactionNsu: `txn-${orderId}`,
      };
    },
  };
}

test("createPayment persiste os identificadores do gateway sem alterar o contrato de resposta", async () => {
  const store = {
    payment_orders: [],
  };
  const supabase = createFakeSupabase({ store });
  const gateway = createGatewayStub();

  const result = await createPayment({
    supabase,
    gatewayProvider: gateway,
    userId: "user-backend-1",
    credits: 50,
    amountCents: 9900,
    customer: { name: "Cliente" },
    appBaseUrl: "https://app.example.com",
  });

  assert.ok(result.orderId);
  assert.equal(result.status, "pending");
  assert.match(result.paymentUrl, /checkout\.example/);
  assert.equal(store.payment_orders.length, 1);
  assert.equal(store.payment_orders[0].user_id, "user-backend-1");
  assert.equal(store.payment_orders[0].id, result.orderId);
  assert.equal(store.payment_orders[0].gateway_order_id, `ord-${result.orderId}`);
  assert.equal(store.payment_orders[0].invoice_slug, `inv-${result.orderId}`);
  assert.equal(store.payment_orders[0].transaction_nsu, `txn-${result.orderId}`);
});

test("processWebhook aprova pedido e impede duplicacao de creditos em replay do mesmo transaction_nsu", async () => {
  const store = {
    payment_orders: [
      {
        id: "test123",
        user_id: "user-1",
        credits: 25,
        amount_cents: 5000,
        status: "pending",
        gateway: "infinitepay",
        gateway_order_id: "ord-test123",
        invoice_slug: "inv-test123",
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
        const creditRow = db.user_credits.find((row) => row.user_id === p_user_id);
        if (!creditRow) {
          db.user_credits.push({ user_id: p_user_id, credits: 100, plan: "free" });
        }
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
    order_nsu: "ord-test123",
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
  assert.ok(store.payment_orders[0].credited_at);
  assert.equal(store.user_credits[0].credits, 35);
  assert.equal(store.payment_credit_ledger.length, 1);
});

test("processWebhook encontra pedido pelo invoice_slug quando order_nsu nao vier no webhook", async () => {
  const store = {
    payment_orders: [
      {
        id: "test456",
        user_id: "user-2",
        credits: 40,
        amount_cents: 8000,
        status: "pending",
        gateway: "infinitepay",
        gateway_order_id: "ord-test456",
        invoice_slug: "inv-test456",
        gateway_payment_url: "https://checkout.example/test456",
        transaction_nsu: null,
        credited_at: null,
      },
    ],
    user_credits: [{ user_id: "user-2", credits: 5, plan: "free" }],
    payment_credit_ledger: [],
  };

  const supabase = createFakeSupabase({
    store,
    rpcHandlers: {
      apply_payment_credits: async ({ p_order_id, p_user_id, p_amount }, db) => {
        db.payment_credit_ledger.push({
          order_id: p_order_id,
          user_id: p_user_id,
          amount: p_amount,
        });
        const creditRow = db.user_credits.find((row) => row.user_id === p_user_id);
        creditRow.credits += p_amount;
        const order = db.payment_orders.find((row) => row.id === p_order_id);
        order.credited_at = "2026-04-15T00:00:00.000Z";
        return { data: [{ applied: true, credits: creditRow.credits }], error: null };
      },
    },
  });

  const result = await processWebhook({
    supabase,
    payload: {
      invoice_slug: "inv-test456",
      status: "PAID",
      transaction_nsu: "tx456",
      paid_amount: 8000,
    },
    gatewayProvider: createGatewayStub(),
  });

  assert.equal(result.success, true);
  assert.equal(store.payment_orders[0].status, "approved");
  assert.equal(store.payment_orders[0].transaction_nsu, "tx456");
  assert.equal(store.user_credits[0].credits, 45);
});

test("processWebhook nao quebra com pedido inexistente", async () => {
  const supabase = createFakeSupabase({
    store: { payment_orders: [], user_credits: [] },
  });

  const result = await processWebhook({
    supabase,
    payload: {
      order_nsu: "ord-missing-order",
      status: "PAID",
      transaction_nsu: "tx-missing",
    },
    gatewayProvider: createGatewayStub(),
  });

  assert.equal(result.success, false);
  assert.match(result.message, /Pedido/);
});

test("webhook responde 200 rapido, aceita ausencia de assinatura e processa em background", async () => {
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
        order_nsu: "ord-test123",
        status: "PAID",
        transaction_nsu: "tx123",
      })
    ),
    headers: {},
  };

  const res = {
    statusCode: null,
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

  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: null });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(processedPayload.order_nsu, "ord-test123");
});
