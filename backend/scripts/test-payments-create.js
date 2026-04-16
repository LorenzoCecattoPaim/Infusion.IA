import assert from "node:assert/strict";

import { createPaymentCreateHandler } from "../src/payments/create-payment.controller.js";
import { createFakeSupabase } from "../tests/helpers/fake-supabase.js";

const handler = createPaymentCreateHandler({
  getSupabase: () => createFakeSupabase({ store: { payment_orders: [] } }),
  getBaseUrl: () => "https://app.example.com",
  gatewayProvider: {},
  createPayment: async ({ credits, amountCents }) => ({
    orderId: "script-order-100",
    paymentUrl: `https://checkout.example/script-order-100?credits=${credits}&amount=${amountCents}`,
    status: "pending",
  }),
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
  body: { credits: 100 },
  user: { id: "script-user-1" },
};

const res = {
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

await handler(req, res);

assert.equal(res.statusCode, 200);
assert.ok(res.body?.checkoutUrl);
assert.doesNotThrow(() => new URL(res.body.checkoutUrl));

console.log(
  JSON.stringify(
    {
      ok: true,
      statusCode: res.statusCode,
      checkoutUrl: res.body.checkoutUrl,
    },
    null,
    2
  )
);
