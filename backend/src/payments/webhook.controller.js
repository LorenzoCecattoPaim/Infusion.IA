import "./payment.types.js";
import { isReplay } from "./webhook.replay.js";
import { verifyWebhookSignature } from "./webhook.security.js";

function createInfinitePayWebhookHandler({
  webhookSecret,
  getSupabase,
  processWebhook,
  gatewayProvider,
}) {
  return (req, res) => {
    try {
      const secret = req.query?.secret;
      if (!secret || secret !== webhookSecret) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const rawBody = req.body;
      const signature = req.headers["x-signature"];

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
          transactionNsu: payload?.transaction_nsu || null,
          hasSignature: Boolean(signature),
        })
      );

      if (!signature) {
        console.warn("[WEBHOOK] webhook sem assinatura ativa");
      }

      res.status(200).json({ success: true, message: null });

      setImmediate(async () => {
        try {
          const supabase = getSupabase();
          if (transactionNsu && (await isReplay(supabase, transactionNsu))) {
            console.warn("[WEBHOOK] replay detectado", transactionNsu);
            return;
          }

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
      return res.status(400).json({
        success: false,
        message: "Erro ao processar webhook",
      });
    }
  };
}

export { createInfinitePayWebhookHandler };
