import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AGENTE_6_GERADOR_TEXTO,
  callAgent,
  validateWithAgent,
  safeParseJSON,
  renderBusinessPrompt,
  corsHeaders,
  errorResponse,
} from "../_shared/agents.ts";
import { log, logError } from "../_shared/monitoring.ts";

const CREDIT_COST = 1;

const LIMITES: Record<string, number> = {
  "Legenda Instagram": 2200,
  "Legenda Facebook": 63206,
  "Legenda LinkedIn": 3000,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let userId = "anonymous";

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

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
      tipo_conteudo,
      descricao,
      publico_alvo,
      tom_voz,
      variation,
      refine_notes,
      previous_text,
    } = await req.json();

    if (!tipo_conteudo || !descricao?.trim()) {
      return errorResponse("tipo_conteudo e descricao sÃ£o obrigatÃ³rios", 400);
    }

    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", user.id)
      .single();

    if (!credits || credits.credits < CREDIT_COST) {
      return errorResponse("insufficient_credits", 402);
    }

    const { data: profile } = await supabase
      .from("business_profiles")
      .select(
        "segmento, segmento_atuacao, objetivo_principal, publico_alvo, tom_comunicacao, marca_descricao, canais_atuacao, tipo_conteudo, nivel_experiencia, maior_desafio, uso_ia, contexto_json"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    const validation = await validateWithAgent(
      [tipo_conteudo, descricao, publico_alvo, tom_voz].join(" | ")
    );
    if (!validation.ok) {
      return errorResponse(
        `ConteÃºdo nÃ£o permitido: ${validation.motivo_rejeicao}`,
        400
      );
    }

    const systemPrompt = renderBusinessPrompt(
      AGENTE_6_GERADOR_TEXTO,
      profile as Record<string, unknown> | null,
      ""
    );

    const limite = LIMITES[tipo_conteudo as string] || 0;

    const userPrompt = `
Tipo de conteÃºdo: ${tipo_conteudo}
Limite de caracteres (quando aplicÃ¡vel): ${limite || "N/A"}
DescriÃ§Ã£o: ${descricao}
PÃºblico-alvo: ${publico_alvo || "NÃ£o informado"}
Tom de voz: ${tom_voz || "NÃ£o informado"}
VariaÃ§Ã£o solicitada: ${variation ? "Sim" : "NÃ£o"}
Refinamento solicitado: ${refine_notes || "Nenhum"}
Texto anterior (se houver): ${previous_text || "N/A"}

Gere o conteÃºdo solicitado respeitando o limite quando aplicÃ¡vel. Responda apenas com JSON vÃ¡lido.`.trim();

    const model = Deno.env.get("AI_MODEL_MARKETING") || "gpt-4o";

    const result = (await callAgent({
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      model,
      responseFormat: "json_object",
      maxTokens: 1200,
      temperature: 0.8,
    })) as string;

    const parsed = safeParseJSON<{
      texto: string;
      sugestoes: string[];
      prompt: string | null;
    }>(result, { texto: "", sugestoes: [], prompt: null });

    const resultValidation = await validateWithAgent(result);
    if (!resultValidation.ok) {
      return errorResponse(
        `ConteÃºdo gerado nÃ£o permitido: ${resultValidation.motivo_rejeicao}`,
        400
      );
    }

    await supabase
      .from("user_credits")
      .update({
        credits: credits.credits - CREDIT_COST,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    log({
      function: "generate-text",
      user_id: userId,
      action: "generate",
      status: "success",
      credits_used: CREDIT_COST,
      duration_ms: Date.now() - startTime,
    });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=UTF-8" },
    });
  } catch (err) {
    logError("generate-text", userId, err);
    return errorResponse(
      err instanceof Error ? err.message : "Erro ao gerar texto",
      500
    );
  }
});
