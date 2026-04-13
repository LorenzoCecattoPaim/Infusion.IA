import "./payment.types.js";

class InfinitePayGateway {
  constructor({ baseUrl, handle, webhookSecret, timeoutMs = 10000 }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.handle = handle;
    this.webhookSecret = webhookSecret;
    this.timeoutMs = timeoutMs;
  }

  async createPaymentLink({ orderId, amountCents, credits, customer, baseUrl }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
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
        webhook_url: `${baseUrl}/webhook/infinitepay?secret=${this.webhookSecret}`,
        redirect_url: `${baseUrl}/pagamento-concluido`,
        customer: {
          name: customer?.name || undefined,
          email: customer?.email || undefined,
          phone_number: customer?.phone_number || undefined,
        },
      };

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
      } catch {
        body = null;
      }

      if (!response.ok) {
        const message = body?.message || body?.error || text || "Erro na InfinitePay";
        throw new Error(message);
      }

      const paymentUrl =
        body?.gateway_payment_url ||
        body?.payment_url ||
        body?.paymentUrl ||
        body?.checkout_url ||
        body?.url ||
        null;
      const gatewayOrderId = body?.gateway_order_id || body?.invoice_slug || body?.id || null;

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
