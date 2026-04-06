import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse } from "../_shared/agents.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    console.log("Webhook recebido:", JSON.stringify(body));

    // Pagar.me webhook format
    const eventType = body.type || body.event;

    if (
      eventType === "order.paid" ||
      eventType === "charge.paid" ||
      body.status === "paid"
    ) {
      const metadata = body.data?.metadata || body.metadata || {};
      const { order_id, user_id, credits } = metadata;

      if (!order_id || !user_id || !credits) {
        console.error("Webhook: metadata incompleto", metadata);
        return new Response("OK", { status: 200 });
      }

      // Check if already processed
      const { data: order } = await supabase
        .from("payment_orders")
        .select("status")
        .eq("id", order_id)
        .single();

      if (order?.status === "paid") {
        return new Response("OK", { status: 200 });
      }

      // Update order status
      await supabase
        .from("payment_orders")
        .update({ status: "paid", updated_at: new Date().toISOString() })
        .eq("id", order_id);

      // Add credits to user
      const { data: currentCredits } = await supabase
        .from("user_credits")
        .select("credits")
        .eq("user_id", user_id)
        .single();

      if (currentCredits) {
        await supabase
          .from("user_credits")
          .update({
            credits: currentCredits.credits + Number(credits),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user_id);
      }

      console.log(
        `Créditos adicionados: user=${user_id}, credits=${credits}, order=${order_id}`
      );
    }

    return new Response("OK", {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("webhook-pagamento error:", err);
    // Always return 200 to prevent gateway retries on our bugs
    return new Response("OK", { status: 200 });
  }
});


