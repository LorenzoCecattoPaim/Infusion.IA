import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AGENTE_1_CONSULTOR_MARKETING,
  callAgent,
  validateWithAgent,
  renderBusinessPrompt,
} from "../_shared/agents.ts";
import { getBearerToken } from "../_shared/auth.ts";
import { corsHeaders, errorResponse, jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { log, logError } from "../_shared/monitoring.ts";

Deno.serve(async (req) => {
  console.log("METHOD:", req.method);
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const startTime = Date.now();
  let userId = "anonymous";

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

    userId = user.id;

    // Check credits
    const { data: credits, error: creditsError } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", user.id)
      .single();

    if (creditsError || !credits || credits.credits < 1) {
      return errorResponse("insufficient_credits", 402);
    }

    let body: { messages?: unknown; stream?: boolean; lastMessageOverride?: string };
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON", 400);
    }
    const { messages = [], stream = false, lastMessageOverride } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return errorResponse("messages array is required", 400);
    }

    // Apply override on last user message
    const processedMessages = [...messages];
    if (lastMessageOverride && processedMessages.length > 0) {
      const lastIdx = processedMessages.length - 1;
      if (processedMessages[lastIdx].role === "user") {
        processedMessages[lastIdx] = {
          ...processedMessages[lastIdx],
          content: lastMessageOverride,
        };
      }
    }

    // Fetch business profile
    const { data: profile } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // Fetch business materials (stored in DB)
    const { data: materials } = await supabase
      .from("business_materials")
      .select("content, name")
      .eq("user_id", user.id)
      .limit(5);

    const materialsContext =
      materials?.map((m: { name: string; content: string }) => `[${m.name}]:\n${m.content}`).join("\n\n") || "";

    // Build system prompt with context
    const systemPrompt = renderBusinessPrompt(
      AGENTE_1_CONSULTOR_MARKETING,
      profile as Record<string, unknown> | null,
      materialsContext
    );

    // Validate last user message
    const lastUserMsg = processedMessages
      .filter((m: { role: string }) => m.role === "user")
      .pop();

    if (lastUserMsg) {
      const validation = await validateWithAgent(lastUserMsg.content);
      if (!validation.ok) {
        return errorResponse(
          `Conteúdo não permitido: ${validation.motivo_rejeicao}`,
          400
        );
      }
    }

    // Deduct credit
    await supabase
      .from("user_credits")
      .update({ credits: credits.credits - 1, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    const model = Deno.env.get("AI_MODEL_MARKETING") || "gpt-4o";
    const agentMessages = processedMessages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    if (stream) {
      const aiResponse = (await callAgent({
        systemPrompt,
        messages: agentMessages,
        model,
        stream: true,
      })) as Response;

      if (!aiResponse || !aiResponse.body) {
        return errorResponse("Stream failed", 500);
      }

      log({
        function: "ai-chat",
        user_id: userId,
        action: "stream",
        status: "success",
        credits_used: 1,
        duration_ms: Date.now() - startTime,
      });

      return new Response(aiResponse.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const text = (await callAgent({
      systemPrompt,
      messages: agentMessages,
      model,
    })) as string;

    log({
      function: "ai-chat",
      user_id: userId,
      action: "complete",
      status: "success",
      credits_used: 1,
      duration_ms: Date.now() - startTime,
    });

    return jsonResponse({
      choices: [{ message: { role: "assistant", content: text } }],
    });
  } catch (err) {
    logError("ai-chat", userId, err);
    return errorResponse("Erro interno", 500);
  } finally {
    console.log("DURATION_MS:", Date.now() - startTime);
  }
});



