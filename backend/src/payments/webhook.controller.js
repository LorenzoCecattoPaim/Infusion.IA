import "./payment.types.js";

function createInfinitePayWebhookHandler({ webhookSecret, getSupabase, processWebhook }) {
  return (req, res) => {
    try {
      const secret = req.query?.secret;
      if (!secret || secret !== webhookSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const payload = req.body || {};

      res.status(200).json({ ok: true });

      setImmediate(async () => {
        try {
          const supabase = getSupabase();
          await processWebhook({ supabase, payload, gateway: "infinitepay" });
        } catch (error) {
          console.error("[WEBHOOK] falha ao processar", error);
        }
      });
    } catch (error) {
      console.error("[WEBHOOK] erro", error);
      return res.status(500).json({ error: "Erro ao processar webhook" });
    }
  };
}

export { createInfinitePayWebhookHandler };
