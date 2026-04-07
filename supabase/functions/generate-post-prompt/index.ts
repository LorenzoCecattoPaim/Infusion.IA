import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AGENTE_7_GERADOR_POSTS_IMAGEM,
  callAgent,
  validateWithAgent,
  safeParseJSON,
  renderBusinessPrompt,
} from "../_shared/agents.ts";
import { corsHeaders, errorResponse, jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { log, logError } from "../_shared/monitoring.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
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

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    const {
      tipo_post,
      descricao,
      formato,
      estilo,
      incluir_espaco_logo,
      logo_presente,
    } = body as {
      tipo_post?: string;
      descricao?: string;
      formato?: string;
      estilo?: string;
      incluir_espaco_logo?: boolean;
      logo_presente?: boolean;
    };

    if (!tipo_post || !descricao?.trim() || !formato || !estilo) {
      return errorResponse("Campos obrigatÃ³rios nÃ£o preenchidos", 400);
    }

    const validation = await validateWithAgent(
      [tipo_post, descricao, formato, estilo].join(" | ")
    );
    if (!validation.ok) {
      return errorResponse(
        `ConteÃºdo nÃ£o permitido: ${validation.motivo_rejeicao}`,
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
DescriÃ§Ã£o: ${descricao}
Formato da imagem: ${formato}
Estilo visual: ${estilo}
Logo fornecida: ${logo_presente ? "Sim" : "NÃ£o"}
Incluir espaÃ§o para logotipo no canto inferior direito: ${
      incluir_espaco_logo ? "Sim" : "NÃ£o"
    }

Crie um prompt objetivo e pronto para geraÃ§Ã£o de imagem. Se precisar de detalhes adicionais, faÃ§a atÃ© 3 perguntas diretas. Responda apenas com JSON vÃ¡lido.`.trim();

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

    return jsonResponse(parsed);
  } catch (err) {
    logError("generate-post-prompt", userId, err);
    return errorResponse(
      err instanceof Error ? err.message : "Erro ao gerar prompt",
      500
    );
  }
});
