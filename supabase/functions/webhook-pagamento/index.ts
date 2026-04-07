import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, optionsResponse } from "../_shared/cors.ts";

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

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON", 400);
    }
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
        return new Response("OK", {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/plain; charset=UTF-8" },
        });
      }

      // Check if already processed
      const { data: order } = await supabase
        .from("payment_orders")
        .select("status")
        .eq("id", order_id)
        .single();

      if (order?.status === "paid") {
        return new Response("OK", {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/plain; charset=UTF-8" },
        });
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
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=UTF-8" },
    });
  } catch (err) {
    console.error("webhook-pagamento error:", err);
    return errorResponse(
      "Erro interno",
      500
    );
  } finally {
    console.log("DURATION_MS:", Date.now() - startTime);
  }
});



