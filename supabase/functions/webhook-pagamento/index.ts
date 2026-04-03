// supabase/functions/webhook-pagamento/index.ts
// Recebe webhooks do Pagar.me e InfinitePay
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/agents.ts";
import { log } from "../_shared/monitoring.ts";

const PAGARME_WEBHOOK_SECRET = Deno.env.get("PAGARME_WEBHOOK_SECRET") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.text();
  const payload = JSON.parse(body);

  log({ function: "webhook-pagamento", action: "received", status: "ok", meta: { type: payload.type, id: payload.id } });

  // ── Pagar.me events ───────────────────────────────────────
  if (payload.type === "order.paid" || payload.type === "charge.paid") {
    const orderId = payload.data?.id;
    const metadata = payload.data?.metadata || {};

    const { data: tx } = await supabase
      .from("transactions")
      .select("*")
      .eq("gateway_tx_id", orderId)
      .single();

    if (tx && tx.status !== "paid") {
      // Atualiza transação
      await supabase
        .from("transactions")
        .update({ status: "paid", gateway_payload: payload.data })
        .eq("id", tx.id);

      // Adiciona créditos
      if (tx.credits_granted > 0) {
        await supabase.rpc("add_credits", {
          p_user_id: tx.user_id,
          p_amount: tx.credits_granted,
          p_reason: "purchase",
          p_ref_id: tx.id,
          p_desc: tx.description,
        });
        log({ function: "webhook-pagamento", action: "credits_granted", status: "ok", meta: { user_id: tx.user_id, credits: tx.credits_granted } });
      }

      // Se é assinatura, atualiza status
      if (tx.subscription_id) {
        await supabase
          .from("subscriptions")
          .update({
            status: "active",
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
          })
          .eq("id", tx.subscription_id);
      }
    }
  }

  if (payload.type === "charge.payment_failed" || payload.type === "order.payment_failed") {
    const orderId = payload.data?.id;
    await supabase
      .from("transactions")
      .update({ status: "failed", gateway_payload: payload.data })
      .eq("gateway_tx_id", orderId);
  }

  if (payload.type === "subscription.canceled") {
    await supabase
      .from("subscriptions")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("gateway_sub_id", payload.data?.id);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
