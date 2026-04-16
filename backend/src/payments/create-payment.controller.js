import { validateInfinitePayEnv } from "./infinitepay.config.js";

function normalizeJsonBody(body) {
  if (typeof body === "string") {
    return JSON.parse(body);
  }

  return body;
}

function createPaymentCreateHandler({
  getSupabase,
  getBaseUrl,
  gatewayProvider,
  createPayment,
  planCatalog,
  env,
}) {
  return async function handleCreatePayment(req, res) {
    try {
      console.log("[PAYMENTS] create request received", {
        userId: req.user?.id || null,
        bodyKeys: req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? Object.keys(req.body)
          : [],
      });

      let body = req.body || {};
      try {
        body = normalizeJsonBody(body);
      } catch {
        console.error("[PAYMENTS] create invalid JSON body");
        return res.status(400).json({ error: "payload inválido" });
      }

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "payload inválido" });
      }

      const parsedCredits = Number(body.credits);
      if (!Number.isFinite(parsedCredits) || parsedCredits <= 0) {
        console.error("[PAYMENTS] create invalid credits", { credits: body.credits ?? null });
        return res.status(400).json({ error: "credits inválido" });
      }

      const credits = Math.trunc(parsedCredits);
      const plan = (Array.isArray(planCatalog?.monthly) ? planCatalog.monthly : []).find(
        (entry) => Number(entry?.credits) === credits
      );

      if (!plan) {
        console.error("[PAYMENTS] create monthly plan not found", { credits });
        return res.status(400).json({ error: "Plano mensal não encontrado para os créditos informados." });
      }

      const amountCents = Number(plan.price);
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        console.error("[PAYMENTS] create invalid plan price", {
          credits,
          planId: plan.id || null,
          price: plan.price ?? null,
        });
        return res.status(500).json({ error: "Plano configurado com valor inválido." });
      }

      const envValidation = validateInfinitePayEnv(env);
      if (!envValidation.valid) {
        console.error("[PAYMENTS] create invalid InfinitePay env");
      }

      console.log("[PAYMENTS] create plan found", {
        planId: plan.id,
        credits,
        amount_cents: amountCents,
      });
      console.log("[PAYMENTS] create amount_cents", { amount_cents: amountCents });

      const supabase = getSupabase();
      const baseUrl = getBaseUrl(req);
      const result = await createPayment({
        supabase,
        gatewayProvider,
        userId: req.user.id,
        credits,
        amountCents: Math.trunc(amountCents),
        customer: null,
        appBaseUrl: baseUrl,
      });

      const checkoutUrl = result.paymentUrl;
      if (!checkoutUrl) {
        console.error("[PAYMENTS] create missing checkout url", {
          orderId: result.orderId || null,
        });
        return res.status(500).json({ error: "Checkout não retornado pela InfinitePay." });
      }

      console.log("[PAYMENTS] create success", {
        orderId: result.orderId,
        checkoutUrl,
        status: result.status,
      });

      return res.status(200).json({
        checkoutUrl,
        payment_url: checkoutUrl,
        order_id: result.orderId,
        status: result.status,
      });
    } catch (error) {
      console.error("[PAYMENTS] create", error);
      return res.status(500).json({ error: "Erro ao criar pagamento." });
    }
  };
}

export { createPaymentCreateHandler };
