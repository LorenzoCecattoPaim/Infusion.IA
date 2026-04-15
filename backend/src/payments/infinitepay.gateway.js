import "./payment.types.js";

class InfinitePayGateway {
  constructor({ baseUrl, handle, webhookSecret, timeoutMs = 10000 }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.handle = handle;
    this.webhookSecret = webhookSecret;
    this.timeoutMs = timeoutMs;
  }

  /**
   * A InfinitePay só dispara webhook quando o pagamento já foi aprovado.
   * Não há campo "status" no payload — a presença do webhook já é a confirmação.
   * Valida pela presença de paid_amount > 0 como camada extra de segurança.
   * @param {object} payload
   * @returns {boolean}
   */
  isApprovedWebhook(payload) {
    if (!payload) return false;
    // FIX: InfinitePay não envia campo "status" no webhook.
    // O webhook só é disparado após aprovação, mas validamos paid_amount como garantia extra.
    const paidAmount = Number(payload.paid_amount ?? payload.amount ?? 0);
    return paidAmount > 0;
  }

  /**
   * @param {{ orderId: string, amountCents: number, credits: number, customer: object | null, appBaseUrl?: string }} param0
   * @returns {Promise<{ paymentUrl: string, gatewayOrderId: string | null }>}
   */
  async createPaymentLink({ orderId, amountCents, credits, customer, appBaseUrl }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resolvedAppBaseUrl = appBaseUrl || process.env.APP_BASE_URL;

      if (!resolvedAppBaseUrl) {
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
        webhook_url: `${resolvedAppBaseUrl}/api/webhook/infinitepay?secret=${this.webhookSecret}`,
        redirect_url: `${resolvedAppBaseUrl}/pagamento-concluido`,
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

      // FIX: A doc confirma que a resposta retorna apenas { url: "..." }
      // gatewayOrderId (invoice_slug) só chega depois via webhook — fica null por ora
      const paymentUrl = body?.url || body?.payment_url || body?.checkout_url || null;

      if (!paymentUrl) {
        throw new Error("Resposta inválida da InfinitePay: url não encontrada");
      }

      return {
        paymentUrl,
        gatewayOrderId: null, // será preenchido quando o webhook chegar com invoice_slug
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export { InfinitePayGateway };
