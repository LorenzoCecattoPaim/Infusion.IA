import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AGENTE_2_DESIGNER_LOGO,
  AGENTE_LOGO_PROMPT_BUILDER,
  callAgent,
  validateWithAgent,
  safeParseJSON,
  renderBusinessPrompt,
  corsHeaders,
  errorResponse,
} from "../_shared/agents.ts";
import { log, logError } from "../_shared/monitoring.ts";

const CREDIT_COST_PER_MESSAGE = 2;
const CREDIT_COST_PER_IMAGE = 5;

async function generateLogoWithLeonardo(prompt: string): Promise<string> {
  const apiKey = Deno.env.get("LEONARDO_API_KEY") || "";
  if (!apiKey) throw new Error("LEONARDO_API_KEY nÃ£o configurado.");

  const logoPrompt = `${prompt}, professional logo design, vector art style, clean lines, scalable, minimal background, high quality, crisp edges`;
  const negativePrompt =
    "blurry, raster artifacts, low quality, complex busy background, watermark, misspelled text, distorted letters, multiple logos";

  const body = {
    prompt: logoPrompt,
    negative_prompt: negativePrompt,
    modelId: "b24e16ff-06e3-43eb-8d33-4416c2d75876",
    num_images: 1,
    width: 1024,
    height: 1024,
    num_inference_steps: 40,
    guidance_scale: 8,
    public: false,
  };

  const initRes = await fetch(
    "https://cloud.leonardo.ai/api/rest/v1/generations",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }
  );

  if (!initRes.ok) throw new Error(`Leonardo API error ${initRes.status}`);

  const initData = await initRes.json();
  const generationId = initData.sdGenerationJob?.generationId;
  if (!generationId) throw new Error("Leonardo: falha ao iniciar geraÃ§Ã£o de logo");

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(
      `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    const gen = pollData.generations_by_pk;

    if (gen?.status === "COMPLETE") {
      return gen.generated_images?.[0]?.url;
    }
    if (gen?.status === "FAILED") throw new Error("Leonardo: geraÃ§Ã£o de logo falhou");
  }

  throw new Error("Leonardo: timeout na geraÃ§Ã£o de logo");
}

async function buildLogoPrompts(conversation: string): Promise<{ prompts: string[]; descriptions: string[] }> {
  const result = (await callAgent({
    systemPrompt: AGENTE_LOGO_PROMPT_BUILDER,
    messages: [{ role: "user", content: conversation }],
    model: Deno.env.get("AI_MODEL_LOGO") || "gpt-4o",
    responseFormat: "json_object",
    maxTokens: 800,
    temperature: 0.7,
  })) as string;

  return safeParseJSON(result, { prompts: [], descriptions: [] });
}

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

    const { messages, action, selectedPrompt } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return errorResponse("messages Ã© obrigatÃ³rio", 400);
    }

    // Check credits
    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", user.id)
      .single();

    if (!credits || credits.credits < 1) {
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

    if (action === "generate_logos") {
      const cost = 3 * CREDIT_COST_PER_IMAGE;
      if (credits.credits < cost) {
        return errorResponse("insufficient_credits", 402);
      }

      const conversationText = messages
        .map((m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n");

      const promptSet = await buildLogoPrompts(conversationText);
      const prompts = promptSet.prompts?.length ? promptSet.prompts.slice(0, 3) : [];
      const descriptions = promptSet.descriptions?.length ? promptSet.descriptions.slice(0, 3) : [];

      if (prompts.length < 3) {
        return errorResponse("NÃ£o foi possÃ­vel gerar os prompts do logo.", 500);
      }

      const logoUrls = await Promise.all(prompts.map((p) => generateLogoWithLeonardo(p)));
      const logos = logoUrls.map((url, i) => ({
        url,
        description: descriptions[i] || `Logo ${i + 1}`,
        prompt: prompts[i],
      }));

      await supabase.from("generated_logos").insert(
        logos.map((logo) => ({
          user_id: user.id,
          url: logo.url,
          prompt: logo.prompt,
          description: logo.description,
          variation_type: "base",
        }))
      );

      await supabase
        .from("user_credits")
        .update({
          credits: credits.credits - cost,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      log({
        function: "logo-generator",
        user_id: userId,
        action: "generate_logos",
        status: "success",
        credits_used: cost,
        duration_ms: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({ message: "Aqui estÃ£o suas trÃªs sugestÃµes de logo! Qual delas vocÃª mais gostou?", logos }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "generate_variations") {
      if (!selectedPrompt) {
        return errorResponse("selectedPrompt Ã© obrigatÃ³rio", 400);
      }

      const variations = [
        "silver metallic logo",
        "golden metallic logo",
        "black logo on white background",
        "white logo on black background",
      ];

      const cost = variations.length * CREDIT_COST_PER_IMAGE;
      if (credits.credits < cost) {
        return errorResponse("insufficient_credits", 402);
      }

      const variationPrompts = variations.map((v) => `${selectedPrompt}, ${v}`);
      const logoUrls = await Promise.all(
        variationPrompts.map((p) => generateLogoWithLeonardo(p))
      );
      const logos = logoUrls.map((url, i) => ({
        url,
        description: variations[i],
        prompt: variationPrompts[i],
      }));

      await supabase.from("generated_logos").insert(
        logos.map((logo) => ({
          user_id: user.id,
          url: logo.url,
          prompt: logo.prompt,
          description: logo.description,
          variation_type: "variation",
        }))
      );

      await supabase
        .from("user_credits")
        .update({
          credits: credits.credits - cost,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      log({
        function: "logo-generator",
        user_id: userId,
        action: "generate_variations",
        status: "success",
        credits_used: cost,
        duration_ms: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({ message: "Aqui estÃ£o as variaÃ§Ãµes do seu logo!", logos }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate last user message
    const lastMsg = messages
      .filter((m: { role: string }) => m.role === "user")
      .pop();

    if (lastMsg) {
      const validation = await validateWithAgent(lastMsg.content);
      if (!validation.ok) {
        return errorResponse(
          `ConteÃºdo nÃ£o permitido: ${validation.motivo_rejeicao}`,
          400
        );
      }
    }

    const systemPrompt = renderBusinessPrompt(
      AGENTE_2_DESIGNER_LOGO,
      profile as Record<string, unknown> | null,
      ""
    );

    const model = Deno.env.get("AI_MODEL_LOGO") || "gpt-4o";
    const agentText = (await callAgent({
      systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      model,
      maxTokens: 2048,
      temperature: 0.8,
    })) as string;

    await supabase
      .from("user_credits")
      .update({
        credits: credits.credits - CREDIT_COST_PER_MESSAGE,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    log({
      function: "logo-generator",
      user_id: userId,
      action: "message",
      status: "success",
      credits_used: CREDIT_COST_PER_MESSAGE,
      duration_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ message: agentText, logos: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    logError("logo-generator", userId, err);
    return errorResponse(
      err instanceof Error ? err.message : "Erro ao processar logo",
      500
    );
  }
});
