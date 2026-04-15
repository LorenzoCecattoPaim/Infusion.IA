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
      // 🔐 1. Validação do secret (continua usando)
      const secret = req.query?.secret;
      if (!secret || secret !== webhookSecret) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const rawBody = req.body;
      const signature = req.headers["x-signature"];

      // 🔐 2. Assinatura (se existir)
      if (Buffer.isBuffer(rawBody) && signature) {
        const valid = verifyWebhookSignature(
          rawBody,
          signature,
          webhookSecret
        );

        if (!valid) {
          console.warn("[WEBHOOK] assinatura inválida");
          return res.status(401).json({ success: false, message: "Invalid signature" });
        }
      }

      // 📦 3. Parse do payload
      const payload = Buffer.isBuffer(rawBody)
        ? JSON.parse(rawBody.toString())
        : rawBody || {};

      // ⚡ 4. Resposta IMEDIATA (regra da InfinitePay)
      res.status(200).json({ success: true, message: null });

      // 🧠 5. Processamento assíncrono
      setImmediate(async () => {
        try {
          const supabase = getSupabase();

          // 🛡️ 6. Proteção contra replay
          const eventId =
            payload?.transaction_nsu || payload?.invoice_slug;

          if (await isReplay(supabase, eventId)) {
            console.warn("[WEBHOOK] replay detectado", eventId);
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

      // ❗ Aqui precisa seguir padrão da InfinitePay
      return res.status(400).json({
        success: false,
        message: "Erro ao processar webhook",
      });
    }
  };
}

export { createInfinitePayWebhookHandler };