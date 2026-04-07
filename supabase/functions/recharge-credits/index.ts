import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, optionsResponse } from "../_shared/cors.ts";

// Dev-only endpoint to manually add credits for testing
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const orderId = url.searchParams.get("order_id");
    const credits = Number(url.searchParams.get("credits") || 0);
    const userId = url.searchParams.get("user_id");

    if (!orderId || !credits || !userId) {
      return errorResponse("ParÃ¢metros invÃ¡lidos", 400);
    }

    // Only allow in dev
    const isDev = Deno.env.get("ENVIRONMENT") !== "production";
    if (!isDev) {
      return errorResponse("Endpoint disponÃ­vel apenas em desenvolvimento", 403);
    }

    const { data: order } = await supabase
      .from("payment_orders")
      .select("status")
      .eq("id", orderId)
      .single();

    if (order?.status === "paid") {
      return new Response(
        `<html><body><h1>CrÃ©ditos jÃ¡ adicionados!</h1><a href="/">Voltar</a></body></html>`,
        { headers: { ...corsHeaders, "Content-Type": "text/html; charset=UTF-8" } }
      );
    }

    await supabase
      .from("payment_orders")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("id", orderId);

    const { data: currentCredits } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", userId)
      .single();

    if (currentCredits) {
      await supabase
        .from("user_credits")
        .update({
          credits: currentCredits.credits + credits,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }

    return new Response(
      `<html><body><h1>âœ… ${credits} crÃ©ditos adicionados (DEV MODE)!</h1><a href="/">Voltar ao app</a></body></html>`,
      { headers: { ...corsHeaders, "Content-Type": "text/html; charset=UTF-8" } }
    );
  } catch (err) {
    return errorResponse(String(err), 500);
  }
});
