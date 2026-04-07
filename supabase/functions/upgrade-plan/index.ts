import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBearerToken } from "../_shared/auth.ts";
import { errorResponse, jsonResponse, optionsResponse } from "../_shared/cors.ts";

const PLANS: Record<string, { label: string; credits_monthly: number; amount_cents: number }> = {
  free: { label: "Gratuito", credits_monthly: 30, amount_cents: 0 },
  starter: { label: "Starter", credits_monthly: 150, amount_cents: 2990 },
  pro: { label: "Pro", credits_monthly: 500, amount_cents: 7990 },
  business: { label: "Business", credits_monthly: 2000, amount_cents: 19990 },
};

Deno.serve(async (req) => {
  console.log("METHOD:", req.method);
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    const token = getBearerToken(req);
    if (!token) return errorResponse("Unauthorized", 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return errorResponse("Unauthorized", 401);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON", 400);
    }
    const { plan } = body as { plan?: string };
    const planConfig = PLANS[plan];
    if (!planConfig) return errorResponse("Plano inválido", 400);

    if (planConfig.amount_cents === 0) {
      // Downgrade to free
      await supabase
        .from("user_credits")
        .update({ plan: "free", updated_at: new Date().toISOString() })
        .eq("user_id", user.id);

      return jsonResponse({ success: true, plan: "free" });
    }

    const pagarmeKey = Deno.env.get("PAGARME_API_KEY") || "";

    if (!pagarmeKey) {
      // Dev mode
      await supabase
        .from("user_credits")
        .update({
          plan,
          credits: planConfig.credits_monthly,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return jsonResponse({ success: true, plan, dev_mode: true });
    }

    // Create subscription via Pagar.me
    const pagarmeRes = await fetch("https://api.pagar.me/core/v5/subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        Authorization: `Basic ${btoa(pagarmeKey + ":")}`,
      },
      body: JSON.stringify({
        plan_id: plan,
        customer: {
          name: user.email?.split("@")[0] || "Cliente",
          email: user.email,
          type: "individual",
        },
        payment_method: "credit_card",
        metadata: { user_id: user.id, plan },
      }),
    });

    if (!pagarmeRes.ok) {
      return errorResponse("Erro ao criar assinatura", 500);
    }

    const pagarmeData = await pagarmeRes.json();

    await supabase
      .from("user_credits")
      .update({ plan, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return jsonResponse({ success: true, plan, subscription_id: pagarmeData.id });
  } catch (err) {
    console.error("upgrade-plan error:", err);
    return errorResponse("Erro interno", 500);
  } finally {
    console.log("DURATION_MS:", Date.now() - startTime);
  }
});



