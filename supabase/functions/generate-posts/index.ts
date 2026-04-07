import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AGENTE_3_GERADOR_POSTS,
  callAgent,
  validateWithAgent,
  safeParseJSON,
  renderBusinessPrompt,
} from "../_shared/agents.ts";
import { corsHeaders, errorResponse, jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { log, logError } from "../_shared/monitoring.ts";

const CREDIT_COST = 2;

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

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    const brief = body.brief || "";
    const channels = body.channels || (body.canal ? [body.canal] : ["Instagram"]);
    const objetivo = body.objetivo || "NÃ£o informado";
    const tipoConteudo = body.tipo_conteudo || body.tipoConteudo || "NÃ£o informado";

    if (!channels?.length) return errorResponse("canal Ã© obrigatÃ³rio", 400);

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
      .select(
        "segmento, segmento_atuacao, objetivo_principal, publico_alvo, tom_comunicacao, marca_descricao, canais_atuacao, tipo_conteudo, nivel_experiencia, maior_desafio, uso_ia, contexto_json"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    // Validate inputs
    const validation = await validateWithAgent(
      [brief, objetivo, tipoConteudo, channels.join(", ")].join(" | ")
    );
    if (!validation.ok) {
      return errorResponse(
        `ConteÃºdo nÃ£o permitido: ${validation.motivo_rejeicao}`,
        400
      );
    }

    const systemPrompt = renderBusinessPrompt(
      AGENTE_3_GERADOR_POSTS,
      profile as Record<string, unknown> | null,
      ""
    );

    const userPrompt = `
Canal: ${channels.join(", ")}
Objetivo: ${objetivo}
Tipo de conteÃºdo: ${tipoConteudo}
Brief: ${brief || "NÃ£o informado"}

Gere um post para cada canal solicitado. Responda apenas com JSON vÃ¡lido.`.trim();

    const model = Deno.env.get("AI_MODEL_MARKETING") || "gpt-4o";

    const result = (await callAgent({
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      model,
      responseFormat: "json_object",
      maxTokens: 2048,
      temperature: 0.85,
    })) as string;

    const parsed = safeParseJSON<{ posts: Array<Record<string, unknown>> }>(
      result,
      { posts: [] }
    );

    if (!parsed.posts || parsed.posts.length === 0) {
      throw new Error("IA retornou resposta vazia.");
    }

    // Validate generated content
    const resultValidation = await validateWithAgent(result);
    if (!resultValidation.ok) {
      return errorResponse(
        `ConteÃºdo gerado nÃ£o permitido: ${resultValidation.motivo_rejeicao}`,
        400
      );
    }

    // Persist generated posts
    if (parsed.posts?.length) {
      await supabase.from("generated_posts").insert(
        parsed.posts.map((post) => ({
          user_id: user.id,
          canal: String(post.canal || channels[0]),
          objetivo: String(post.objetivo || objetivo),
          tipo_conteudo: String(post.tipo_conteudo || tipoConteudo),
          texto_pronto: String(post.texto_pronto || post.texto || ""),
          cta: String(post.cta || ""),
          sugestao_visual: String(post.sugestao_visual || ""),
          payload_json: post,
        }))
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

    return jsonResponse(parsed);
  } catch (err) {
    logError("generate-posts", userId, err);
    return errorResponse(
      err instanceof Error ? err.message : "Erro ao gerar posts",
      500
    );
  }
});
