import "./payment.types.js";

function createInfinitePayWebhookHandler({ webhookSecret, getSupabase, processWebhook, gatewayProvider }) {
  return (req, res) => {
    // FIX: valida o secret antes de qualquer coisa
    const secret = req.query?.secret;
    if (!secret || secret !== webhookSecret) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const payload = req.body || {};

    // FIX: formato de resposta correto conforme documentação da InfinitePay:
    // { success: true, message: null } para 200
    // { success: false, message: "..." } para 400 (faz a InfinitePay retentar)
    // Responde imediatamente para garantir < 1 segundo conforme doc
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
          console.warn("[WEBHOOK] processamento retornou falha:", result.message);
        }
      } catch (error) {
        console.error("[WEBHOOK] falha ao processar", error);
      }
    });
  };
}

export { createInfinitePayWebhookHandler };
