import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AGENTE_7_GERADOR_POSTS_IMAGEM,
  callAgent,
  validateWithAgent,
  safeParseJSON,
  renderBusinessPrompt,
  corsHeaders,
  errorResponse,
} from "../_shared/agents.ts";
import { log, logError } from "../_shared/monitoring.ts";

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
      tipo_post,
      descricao,
      formato,
      estilo,
      incluir_espaco_logo,
      logo_presente,
    } = await req.json();

    if (!tipo_post || !descricao?.trim() || !formato || !estilo) {
      return errorResponse("Campos obrigatórios não preenchidos", 400);
    }

    const validation = await validateWithAgent(
      [tipo_post, descricao, formato, estilo].join(" | ")
    );
    if (!validation.ok) {
      return errorResponse(
        `Conteúdo não permitido: ${validation.motivo_rejeicao}`,
        400
      );
    }

    const { data: profile } = await supabase
      .from("business_profiles")
      .select(
        "segmento, segmento_atuacao, objetivo_principal, publico_alvo, tom_comunicacao, marca_descricao, canais_atuacao, tipo_conteudo, nivel_experiencia, maior_desafio, uso_ia, contexto_json"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    const systemPrompt = renderBusinessPrompt(
      AGENTE_7_GERADOR_POSTS_IMAGEM,
      profile as Record<string, unknown> | null,
      ""
    );

    const userPrompt = `
Tipo de post: ${tipo_post}
Descrição: ${descricao}
Formato da imagem: ${formato}
Estilo visual: ${estilo}
Logo fornecida: ${logo_presente ? "Sim" : "Não"}
Incluir espaço para logotipo no canto inferior direito: ${
      incluir_espaco_logo ? "Sim" : "Não"
    }

Crie um prompt objetivo e pronto para geração de imagem. Se precisar de detalhes adicionais, faça até 3 perguntas diretas. Responda apenas com JSON válido.`.trim();

    const model = Deno.env.get("AI_MODEL_MARKETING") || "gpt-4o";

    const result = (await callAgent({
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      model,
      responseFormat: "json_object",
      maxTokens: 900,
      temperature: 0.7,
    })) as string;

    const parsed = safeParseJSON<{
      prompt: string;
      perguntas: string[];
      observacoes?: string;
    }>(result, { prompt: "", perguntas: [] });

    if (!parsed.prompt?.trim() && (!parsed.perguntas || parsed.perguntas.length === 0)) {
      throw new Error("IA retornou resposta vazia.");
    }

    log({
      function: "generate-post-prompt",
      user_id: userId,
      action: "generate",
      status: "success",
      duration_ms: Date.now() - startTime,
    });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=UTF-8" },
    });
  } catch (err) {
    logError("generate-post-prompt", userId, err);
    return errorResponse(
      err instanceof Error ? err.message : "Erro ao gerar prompt",
      500
    );
  }
});
