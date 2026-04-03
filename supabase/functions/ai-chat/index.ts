// supabase/functions/ai-chat/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AGENTE_1_CONSULTOR_MARKETING,
  AGENTE_5_VALIDADOR,
  callAgent,
  validateWithAgent,
  renderBusinessPrompt,
  corsHeaders,
} from "../_shared/agents.ts";
import { log, timer } from "../_shared/monitoring.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const elapsed = timer();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // ── Autenticação ─────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    // ── Rate limit ───────────────────────────────────────────
    const { data: rl } = await supabase.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_endpoint: "ai-chat",
      p_max: 60,
    });
    if (rl && !rl.ok) {
      return new Response(
        JSON.stringify({ error: "rate_limit_exceeded" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Créditos ─────────────────────────────────────────────
    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", user.id)
      .single();

    if (!credits || credits.credits < 1) {
      return new Response(
        JSON.stringify({ error: "insufficient_credits" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Payload ──────────────────────────────────────────────
    const { messages, stream = false, lastMessageOverride, session_id } = await req.json();

    const processedMessages = [...messages];
    if (lastMessageOverride && processedMessages.length > 0) {
      const lastIdx = processedMessages.length - 1;
      if (processedMessages[lastIdx].role === "user") {
        processedMessages[lastIdx] = { ...processedMessages[lastIdx], content: lastMessageOverride };
      }
    }

    // ── Perfil e materiais do negócio ─────────────────────────
    const [{ data: profile }, { data: materials }] = await Promise.all([
      supabase.from("business_profiles").select("*").eq("user_id", user.id).single(),
      supabase.from("business_materials").select("content, name").eq("user_id", user.id).limit(5),
    ]);

    const materialsContext = materials?.map((m) => `[${m.name}]:\n${m.content}`).join("\n\n") || "";
    const systemPrompt = renderBusinessPrompt(AGENTE_1_CONSULTOR_MARKETING, profile, materialsContext);

    // ── Validação da mensagem ─────────────────────────────────
    const lastUserMsg = processedMessages.filter((m: {role:string}) => m.role === "user").pop();
    if (lastUserMsg) {
      const validation = await validateWithAgent(AGENTE_5_VALIDADOR, lastUserMsg.content);
      if (!validation.ok) {
        return new Response(
          JSON.stringify({ error: "validation_failed", motivo: validation.motivo_rejeicao }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Deduz crédito via função segura ───────────────────────
    await supabase.rpc("deduct_credits", {
      p_user_id: user.id,
      p_amount: 1,
      p_reason: "chat",
      p_desc: "Mensagem no chat de marketing",
    });

    // ── Salva mensagem do usuário no histórico ────────────────
    if (lastUserMsg && session_id) {
      await supabase.from("chat_history").insert({
        user_id: user.id,
        session_id,
        role: "user",
        content: lastUserMsg.content,
        credits_used: 1,
      });
    }

    // ── Chama o agente ───────────────────────────────────────
    const model = Deno.env.get("AI_MODEL_MARKETING") || "gpt-4o";
    const agentMessages = processedMessages.map((m: {role:string; content:string}) => ({
      role: m.role,
      content: m.content,
    }));

    log({ function: "ai-chat", user_id: user.id, action: "call_agent", status: "ok", meta: { model, stream } });

    if (stream) {
      const aiResponse = await callAgent({ systemPrompt, messages: agentMessages, model, stream: true }) as Response;
      return new Response(aiResponse.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    const text = await callAgent({ systemPrompt, messages: agentMessages, model }) as string;

    // Salva resposta no histórico
    if (session_id) {
      await supabase.from("chat_history").insert({
        user_id: user.id,
        session_id,
        role: "assistant",
        content: text,
        credits_used: 0,
      });
    }

    log({ function: "ai-chat", user_id: user.id, action: "complete", status: "ok", duration_ms: elapsed() });

    return new Response(
      JSON.stringify({ choices: [{ message: { role: "assistant", content: text } }] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    log({ function: "ai-chat", action: "error", status: "error", error: String(err), duration_ms: elapsed() });
    return new Response(
      JSON.stringify({ error: "internal_error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
