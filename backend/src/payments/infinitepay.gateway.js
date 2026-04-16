import "./payment.types.js";
import { normalizePaymentStatus } from "./payment.utils.js";
import { validateInfinitePayEnv } from "./infinitepay.config.js";

class InfinitePayGateway {
  constructor({ baseUrl, handle, webhookSecret, timeoutMs = 10000 }) {
    this.baseUrl = String(baseUrl || "").trim().replace(/\/$/, "");
    this.handle = String(handle || "")
      .trim()
      .replace(/\$/g, "")
      .replace(/\s+/g, "");
    this.webhookSecret = webhookSecret;
    this.timeoutMs = timeoutMs;
  }

  isApprovedWebhook(payload) {
    if (!payload) return false;
    return normalizePaymentStatus(payload) === "approved";
  }

  /**
   * @param {{ orderId: string, amountCents: number, credits: number, customer: object | null, appBaseUrl?: string }} param0
   * @returns {Promise<{ paymentUrl: string, gatewayOrderId: string | null, invoiceSlug?: string | null, transactionNsu?: string | null, status?: string }>}
   */
  async createPaymentLink({ orderId, amountCents, credits, customer, appBaseUrl }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resolvedAppBaseUrl = appBaseUrl || process.env.APP_BASE_URL;
      const url = `${this.baseUrl}/invoices/public/checkout/links`;
      const envValidation = validateInfinitePayEnv({
        baseUrl: this.baseUrl,
        handle: this.handle,
        webhookSecret: this.webhookSecret,
      });

      if (!envValidation.valid) {
        throw new Error("Configuração inválida da InfinitePay");
      }

      if (!resolvedAppBaseUrl) {
        throw new Error("APP_BASE_URL não definida");
      }

      const payload = {
        handle: envValidation.normalizedHandle,
        order_nsu: orderId,
        items: [
          {
            quantity: 1,
            price: Number(amountCents),
            description: `${credits} créditos`,
          },
        ],
        webhook_url: `${resolvedAppBaseUrl}/api/webhook/infinitepay?secret=${this.webhookSecret}`,
        redirect_url: `${resolvedAppBaseUrl}/pagamento-concluido`,
      };

      console.log("📡 InfinitePay Request:", payload);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await response.text();
      let body = null;

      try {
        body = text ? JSON.parse(text) : null;
      } catch {}

      if (!response.ok) {
        console.error("InfinitePay error response:", body || text || response.statusText);
        const message = body?.message || body?.error || text || "Erro na InfinitePay";
        throw new Error(message);
      }

      console.log("📩 InfinitePay Response:", body);

      const paymentUrl = body?.url || body?.payment_url || body?.checkout_url || null;
      const orderNsu =
        body?.order_nsu ||
        body?.orderNsu ||
        body?.orderNSU ||
        payload.order_nsu ||
        null;
      const invoiceSlug =
        body?.invoice_slug ||
        body?.invoiceSlug ||
        body?.slug ||
        body?.invoice?.slug ||
        null;
      const transactionNsu =
        body?.transaction_nsu ||
        body?.transactionNsu ||
        body?.transaction?.nsu ||
        null;

      if (!paymentUrl) {
        throw new Error("Resposta inválida da InfinitePay: url não encontrada");
      }

      try {
        new URL(paymentUrl);
      } catch {
        throw new Error("Resposta inválida da InfinitePay: url malformada");
      }

      return {
        paymentUrl,
        gatewayOrderId: orderNsu,
        invoiceSlug,
        transactionNsu,
        status: "pending",
      };
    } catch (error) {
      console.error(
        "[InfinitePay] createPaymentLink failed:",
        error?.response?.data || error?.message || error
      );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export { InfinitePayGateway };
