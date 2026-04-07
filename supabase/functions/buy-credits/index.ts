import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBearerToken } from "../_shared/auth.ts";
import { errorResponse, jsonResponse, optionsResponse } from "../_shared/cors.ts";

const PLANS: Record<string, { credits: number; amount_cents: number; label: string }> = {
  starter: { credits: 100, amount_cents: 1990, label: "Starter - 100 créditos" },
  pro: { credits: 300, amount_cents: 4990, label: "Pro - 300 créditos" },
  business: { credits: 1000, amount_cents: 12990, label: "Business - 1.000 créditos" },
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

    // Auth
    const token = getBearerToken(req);
    if (!token) return errorResponse("Unauthorized", 401);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
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

    const pagarmeKey = Deno.env.get("PAGARME_API_KEY") || "";

    // Create payment order in DB first
    const { data: order } = await supabase
      .from("payment_orders")
      .insert({
        user_id: user.id,
        credits: planConfig.credits,
        amount_cents: planConfig.amount_cents,
        status: "pending",
        gateway: "pagarme",
      })
      .select()
      .single();

    if (!order) return errorResponse("Erro ao criar pedido", 500);

    if (!pagarmeKey) {
      // Dev mode - simulate payment URL
      return jsonResponse({
        payment_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/recharge-credits?order_id=${order.id}&credits=${planConfig.credits}&user_id=${user.id}`,
        order_id: order.id,
        dev_mode: true,
      });
    }

    // Pagar.me API call
    const pagarmeRes = await fetch("https://api.pagar.me/core/v5/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        Authorization: `Basic ${btoa(pagarmeKey + ":")}`,
      },
      body: JSON.stringify({
        items: [
          {
            amount: planConfig.amount_cents,
            description: planConfig.label,
            quantity: 1,
            code: plan,
          },
        ],
        customer: {
          name: user.email?.split("@")[0] || "Cliente",
          email: user.email,
          type: "individual",
        },
        payments: [
          {
            payment_method: "checkout",
            checkout: {
              expires_in: 120,
              billing_address_editable: false,
              customer_editable: true,
              accepted_payment_methods: ["credit_card", "pix", "boleto"],
              success_url: `${Deno.env.get("FRONTEND_URL") || "https://infusion-ia.app"}/`,
            },
          },
        ],
        metadata: {
          order_id: order.id,
          user_id: user.id,
          credits: planConfig.credits,
        },
      }),
    });

    if (!pagarmeRes.ok) {
      const err = await pagarmeRes.text();
      console.error("Pagar.me error:", err);
      return errorResponse("Erro ao criar pagamento", 500);
    }

    const pagarmeData = await pagarmeRes.json();
    const paymentUrl =
      pagarmeData.checkouts?.[0]?.payment_url || pagarmeData.payment_url;

    // Update order with gateway info
    await supabase
      .from("payment_orders")
      .update({
        gateway_order_id: pagarmeData.id,
        gateway_payment_url: paymentUrl,
      })
      .eq("id", order.id);

    return jsonResponse({ payment_url: paymentUrl, order_id: order.id });
  } catch (err) {
    console.error("buy-credits error:", err);
    return errorResponse("Erro interno", 500);
  } finally {
    console.log("DURATION_MS:", Date.now() - startTime);
  }
});



