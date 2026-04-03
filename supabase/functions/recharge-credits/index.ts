// supabase/functions/recharge-credits/index.ts
// Chamado internamente (ex: cron) para renovar créditos mensais de assinantes
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/agents.ts";
import { log } from "../_shared/monitoring.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Apenas service_role pode chamar esta função
  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!authHeader || !authHeader.includes(serviceKey.slice(0, 20))) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey,
  );

  // Busca assinaturas ativas cujo período terminou
  const now = new Date().toISOString();
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("*, plans(*), profiles(email)")
    .eq("status", "active")
    .lt("current_period_end", now);

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ renewed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let renewed = 0;

  for (const sub of subs) {
    try {
      const plan = sub.plans as { credits_month: number; name: string };
      if (!plan) continue;

      // Adiciona créditos do mês
      await supabase.rpc("add_credits", {
        p_user_id: sub.user_id,
        p_amount: plan.credits_month,
        p_reason: "subscription_renewal",
        p_ref_id: sub.id,
        p_desc: `Renovação mensal — ${plan.name}`,
      });

      // Atualiza período
      const newEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      await supabase
        .from("subscriptions")
        .update({
          current_period_start: now,
          current_period_end: newEnd,
        })
        .eq("id", sub.id);

      renewed++;
      log({ function: "recharge-credits", action: "renewed", status: "ok", meta: { user_id: sub.user_id, credits: plan.credits_month } });
    } catch (err) {
      log({ function: "recharge-credits", action: "error", status: "error", error: String(err), meta: { sub_id: sub.id } });
    }
  }

  return new Response(JSON.stringify({ renewed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
