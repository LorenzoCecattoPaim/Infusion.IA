import "./payment.types.js";
import { verifyWebhookSignature } from "./webhook.security.js";

/**
 * FIX: removido isReplay() daqui.
 *
 * PROBLEMA ORIGINAL: o replay era checado com o transactionNsu ANTES de buscar
 * o pedido no banco. Se a primeira tentativa falhava (pedido não encontrado),
 * o transactionNsu já estava registrado em webhook_events. Nas tentativas
 * seguintes, o sistema detectava "replay" e descartava — o pagamento nunca
 * era processado.
 *
 * SOLUÇÃO: a idempotência é garantida dentro de processWebhook() por meio de:
 *   1. order.credited_at (campo atômico — preenchido pela stored procedure)
 *   2. order.status === "approved" + transaction_nsu igual
 *   3. updateOrderStatus usa .neq("status", "approved") como lock otimista
 *
 * A tabela webhook_events pode continuar sendo usada para auditoria/debug,
 * mas não como gate de entrada.
 */
function createInfinitePayWebhookHandler({
  webhookSecret,
  getSupabase,
  processWebhook,
  gatewayProvider,
}) {
  return (req, res) => {
    try {
      // Autenticação por query token
      const secret = req.query?.secret;
      if (!secret || secret !== webhookSecret) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const rawBody = req.body;
      const signature = req.headers["x-signature"];

      // Validação de assinatura HMAC (quando disponível)
      if (Buffer.isBuffer(rawBody) && signature) {
        const valid = verifyWebhookSignature(rawBody, signature, webhookSecret);
        if (!valid) {
          console.warn("[WEBHOOK] assinatura inválida");
          return res.status(401).json({ success: false, message: "Invalid signature" });
        }
      }

      const payload = Buffer.isBuffer(rawBody)
        ? JSON.parse(rawBody.toString())
        : rawBody || {};

      const transactionNsu =
        payload?.transaction_nsu ||
        payload?.transactionNsu ||
        payload?.transaction_id ||
        null;

      console.log(
        JSON.stringify({
          event: "webhook.infinitepay_received",
          orderNsu: payload?.order_nsu || null,
          invoiceSlug: payload?.invoice_slug || null,
          transactionNsu,
          hasSignature: Boolean(signature),
        })
      );

      if (!signature) {
        console.warn("[WEBHOOK] webhook sem assinatura HMAC — apenas token de URL ativo");
      }

      // Responde 200 imediatamente para a InfinitePay não retentar por timeout
      res.status(200).json({ success: true, message: null });

      // Processa de forma assíncrona após responder
      setImmediate(async () => {
        try {
          const supabase = getSupabase();

          const result = await processWebhook({
            supabase,
            payload,
            gateway: "infinitepay",
            gatewayProvider,
          });

          if (result && !result.success) {
            console.warn("[WEBHOOK] processamento falhou:", result.message);
          }
        } catch (error) {
          console.error("[WEBHOOK] erro assíncrono:", error);
        }
      });
    } catch (error) {
      console.error("[WEBHOOK ERROR]", error);
      // Mesmo em erro de parse, retorna 200 para evitar retries infinitos
      // da InfinitePay em payloads mal-formados
      return res.status(200).json({
        success: false,
        message: "Erro ao processar webhook",
      });
    }
  };
}

export { createInfinitePayWebhookHandler };
