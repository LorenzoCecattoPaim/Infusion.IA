import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AGENTE_3_GERADOR_POSTS,
  callAgent,
  validateWithAgent,
  safeParseJSON,
  corsHeaders,
  errorResponse,
} from "../_shared/agents.ts";
import { log, logError } from "../_shared/monitoring.ts";

const CREDIT_COST = 2;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let userId = "anonymous";

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401);

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) return errorResponse("Unauthorized", 401);

    userId = user.id;

    const {
      brief,
      tone = "profissional",
      channels = ["Instagram"],
      cta,
    } = await req.json();

    if (!brief?.trim()) return errorResponse("brief é obrigatório", 400);

    // Check credits
    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", user.id)
      .single();

    if (!credits || credits.credits < CREDIT_COST) {
      return errorResponse("insufficient_credits", 402);
    }

    // Fetch business profile for context
    const { data: profile } = await supabase
      .from("business_profiles")
      .select("nome_empresa, segmento, publico_alvo, tom_comunicacao")
      .eq("user_id", user.id)
      .maybeSingle();

    // Validate brief
    const validation = await validateWithAgent(brief);
    if (!validation.ok) {
      return errorResponse(
        `Conteúdo não permitido: ${validation.motivo_rejeicao}`,
        400
      );
    }

    const userPrompt = `
Crie posts para os seguintes canais: ${channels.join(", ")}.

BRIEFING: ${brief}
TOM DE VOZ: ${tone}
CTA DESEJADO: ${cta || "Não especificado"}
${
  profile
    ? `EMPRESA: ${profile.nome_empresa || "Não informado"} | SEGMENTO: ${profile.segmento || "Não informado"} | PÚBLICO: ${profile.publico_alvo || "Não informado"} | TOM: ${profile.tom_comunicacao || tone}`
    : ""
}

Gere um post completo para cada canal solicitado. Responda apenas com JSON válido.`.trim();

    const model = Deno.env.get("AI_MODEL_MARKETING") || "gpt-4o";

    const result = (await callAgent({
      systemPrompt: AGENTE_3_GERADOR_POSTS,
      messages: [{ role: "user", content: userPrompt }],
      model,
      responseFormat: "json_object",
      maxTokens: 2048,
      temperature: 0.85,
    })) as string;

    const parsed = safeParseJSON<{ posts: unknown[]; dicas_extras: string }>(
      result,
      { posts: [], dicas_extras: "" }
    );

    // Validate generated content
    const resultValidation = await validateWithAgent(result);
    if (!resultValidation.ok) {
      return errorResponse(
        `Conteúdo gerado não permitido: ${resultValidation.motivo_rejeicao}`,
        400
      );
    }

    // Deduct credits
    await supabase
      .from("user_credits")
      .update({
        credits: credits.credits - CREDIT_COST,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    log({
      function: "generate-posts",
      user_id: userId,
      action: "generate",
      status: "success",
      credits_used: CREDIT_COST,
      duration_ms: Date.now() - startTime,
    });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    logError("generate-posts", userId, err);
    return errorResponse(
      err instanceof Error ? err.message : "Erro ao gerar posts",
      500
    );
  }
});
