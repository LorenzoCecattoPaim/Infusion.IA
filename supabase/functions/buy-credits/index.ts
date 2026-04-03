// supabase/functions/buy-credits/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/agents.ts";

const PAGARME_API_KEY = Deno.env.get("PAGARME_API_KEY") || "";
const PAGARME_BASE = "https://api.pagar.me/core/v5";

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

  const { pack_id, payment_method, card_token, installments = 1 } = await req.json();

  // Busca o pack
  const { data: pack } = await supabase
    .from("credit_packs")
    .select("*")
    .eq("id", pack_id)
    .eq("active", true)
    .single();

  if (!pack) {
    return new Response(
      JSON.stringify({ error: "pack_not_found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: profile } = await supabase
    .from("profiles").select("email, full_name").eq("id", user.id).single();

  // Cria transação no banco (pending)
  const { data: tx } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      type: "credit_pack",
      status: "pending",
      amount_brl: pack.price_brl,
      credits_granted: pack.credits,
      gateway: "pagarme",
      description: `Pack ${pack.name} — ${pack.credits} créditos`,
    })
    .select()
    .single();

  // Chama Pagar.me
  try {
    const pagarmeBody: Record<string, unknown> = {
      customer: {
        name: profile?.full_name || user.email,
        email: user.email,
        type: "individual",
      },
      items: [{
        amount: Math.round(pack.price_brl * 100), // centavos
        description: `${pack.name} — ${pack.credits} créditos Infusion.IA`,
        quantity: 1,
        code: pack.id,
      }],
      payments: [{
        payment_method,
        ...(payment_method === "credit_card" ? {
          credit_card: {
            installments,
            statement_descriptor: "INFUSION.IA",
            card_token,
          },
        } : {}),
        ...(payment_method === "pix" ? { pix: { expires_in: 3600 } } : {}),
        ...(payment_method === "boleto" ? { boleto: { due_at: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString() } } : {}),
      }],
      metadata: {
        transaction_id: tx?.id,
        user_id: user.id,
        pack_id,
      },
    };

    const pagarmeRes = await fetch(`${PAGARME_BASE}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(PAGARME_API_KEY + ":")}`,
      },
      body: JSON.stringify(pagarmeBody),
    });

    const pagarmeData = await pagarmeRes.json();

    // Atualiza transação com ID do gateway
    await supabase
      .from("transactions")
      .update({
        gateway_tx_id: pagarmeData.id,
        gateway_payload: pagarmeData,
        status: pagarmeData.status === "paid" ? "paid" : "pending",
      })
      .eq("id", tx?.id);

    // Se pagamento imediato (cartão aprovado na hora)
    if (pagarmeData.status === "paid") {
      await supabase.rpc("add_credits", {
        p_user_id: user.id,
        p_amount: pack.credits,
        p_reason: "purchase",
        p_ref_id: tx?.id,
        p_desc: `Compra aprovada: ${pack.name}`,
      });
    }

    return new Response(
      JSON.stringify({
        order_id: pagarmeData.id,
        status: pagarmeData.status,
        pix_qr_code: pagarmeData.charges?.[0]?.last_transaction?.qr_code,
        pix_qr_code_url: pagarmeData.charges?.[0]?.last_transaction?.qr_code_url,
        boleto_url: pagarmeData.charges?.[0]?.last_transaction?.pdf,
        credits_granted: pagarmeData.status === "paid" ? pack.credits : 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    await supabase.from("transactions").update({ status: "failed" }).eq("id", tx?.id);
    return new Response(
      JSON.stringify({ error: "payment_error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
