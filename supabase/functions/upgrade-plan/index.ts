// supabase/functions/upgrade-plan/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/agents.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  const { plan_slug, payment_method, card_token } = await req.json();

  const { data: plan } = await supabase
    .from("plans").select("*").eq("slug", plan_slug).eq("active", true).single();

  if (!plan) {
    return new Response(JSON.stringify({ error: "plan_not_found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: profile } = await supabase
    .from("profiles").select("email, full_name").eq("id", user.id).single();

  // Cria transação
  const { data: tx } = await supabase.from("transactions").insert({
    user_id: user.id,
    type: "subscription",
    status: "pending",
    amount_brl: plan.price_brl,
    credits_granted: plan.credits_month,
    gateway: "pagarme",
    description: `Assinatura ${plan.name}`,
  }).select().single();

  // Pagar.me — cria assinatura recorrente
  const PAGARME_API_KEY = Deno.env.get("PAGARME_API_KEY") || "";

  const pagarmeRes = await fetch("https://api.pagar.me/core/v5/subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(PAGARME_API_KEY + ":")}`,
    },
    body: JSON.stringify({
      plan_id: plan.slug, // deve existir no Pagar.me
      customer: {
        name: profile?.full_name || user.email,
        email: user.email,
        type: "individual",
      },
      payment_method,
      card_token,
      metadata: { transaction_id: tx?.id, user_id: user.id, plan_slug },
    }),
  });

  const pagarmeData = await pagarmeRes.json();

  // Cria ou atualiza assinatura local
  const { data: sub } = await supabase.from("subscriptions").upsert({
    user_id: user.id,
    plan_id: plan.id,
    status: pagarmeData.status === "active" ? "active" : "incomplete",
    gateway: "pagarme",
    gateway_sub_id: pagarmeData.id,
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  }, { onConflict: "user_id" }).select().single();

  // Atualiza transação
  await supabase.from("transactions").update({
    subscription_id: sub?.id,
    gateway_tx_id: pagarmeData.id,
    gateway_payload: pagarmeData,
    status: pagarmeData.status === "active" ? "paid" : "pending",
  }).eq("id", tx?.id);

  // Atualiza plano do perfil
  if (pagarmeData.status === "active") {
    await supabase.from("profiles").update({ plan: plan_slug }).eq("id", user.id);
    await supabase.rpc("add_credits", {
      p_user_id: user.id,
      p_amount: plan.credits_month,
      p_reason: "subscription_renewal",
      p_ref_id: tx?.id,
      p_desc: `Créditos do plano ${plan.name}`,
    });
  }

  return new Response(JSON.stringify({
    subscription_id: sub?.id,
    status: pagarmeData.status,
    plan: plan_slug,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
