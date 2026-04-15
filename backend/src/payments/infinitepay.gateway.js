import "./payment.types.js";

class InfinitePayGateway {
  constructor({ baseUrl, handle, webhookSecret, timeoutMs = 10000 }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.handle = handle;
    this.webhookSecret = webhookSecret;
    this.timeoutMs = timeoutMs;
  }

  async createPaymentLink({ orderId, amountCents, credits, customer }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const appBaseUrl = process.env.APP_BASE_URL;

      if (!appBaseUrl) {
        throw new Error("APP_BASE_URL não definida");
      }

      const payload = {
        handle: this.handle,
        order_nsu: orderId,
        items: [
          {
            quantity: 1,
            price: amountCents,
            description: `${credits} créditos`,
          },
        ],
        webhook_url: `${appBaseUrl}/api/webhook/infinitepay?secret=${this.webhookSecret}`,
        redirect_url: `${appBaseUrl}/pagamento-concluido`,
        customer: {
          name: customer?.name || undefined,
          email: customer?.email || undefined,
          phone_number: customer?.phone_number || undefined,
        },
      };

      console.log("📡 Criando pagamento:", payload);

      const response = await fetch(
        `${this.baseUrl}/invoices/public/checkout/links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );

      const text = await response.text();
      let body = null;

      try {
        body = text ? JSON.parse(text) : null;
      } catch {}

      if (!response.ok) {
        const message = body?.message || body?.error || text || "Erro na InfinitePay";
        throw new Error(message);
      }

      console.log("🧾 Resposta InfinitePay:", body);

      const paymentUrl =
        body?.payment_url ||
        body?.checkout_url ||
        body?.url ||
        null;

      const gatewayOrderId =
        body?.invoice_slug ||
        body?.id ||
        null;

      if (!paymentUrl || !gatewayOrderId) {
        throw new Error("Resposta inválida da InfinitePay");
      }

      return {
        paymentUrl,
        gatewayOrderId,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export { InfinitePayGateway };