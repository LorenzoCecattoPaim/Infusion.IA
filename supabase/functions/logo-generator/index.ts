import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AGENTE_2_DESIGNER_LOGO,
  callAgent,
  validateWithAgent,
  safeParseJSON,
  corsHeaders,
  errorResponse,
} from "../_shared/agents.ts";
import { log, logError } from "../_shared/monitoring.ts";

const CREDIT_COST_PER_MESSAGE = 2;
const CREDIT_COST_PER_IMAGE = 2;

async function generateLogoWithLeonardo(prompt: string): Promise<string> {
  const apiKey = Deno.env.get("LEONARDO_API_KEY") || "";
  if (!apiKey) throw new Error("LEONARDO_API_KEY não configurado.");

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
  if (!generationId) throw new Error("Leonardo: falha ao iniciar geração de logo");

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
    if (gen?.status === "FAILED") throw new Error("Leonardo: geração de logo falhou");
  }

  throw new Error("Leonardo: timeout na geração de logo");
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

    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return errorResponse("messages é obrigatório", 400);
    }

    // Check credits
    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", user.id)
      .single();

    if (!credits || credits.credits < CREDIT_COST_PER_MESSAGE) {
      return errorResponse("insufficient_credits", 402);
    }

    // Validate last user message
    const lastMsg = messages
      .filter((m: { role: string }) => m.role === "user")
      .pop();

    if (lastMsg) {
      const validation = await validateWithAgent(lastMsg.content);
      if (!validation.ok) {
        return errorResponse(
          `Conteúdo não permitido: ${validation.motivo_rejeicao}`,
          400
        );
      }
    }

    // Call Agent 2
    const model = Deno.env.get("AI_MODEL_LOGO") || "gpt-4o";
    const agentText = (await callAgent({
      systemPrompt: AGENTE_2_DESIGNER_LOGO,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      model,
      maxTokens: 2048,
      temperature: 0.8,
    })) as string;

    // Check if agent wants to generate images
    let logos: Array<{ url: string; description: string; prompt: string }> = [];
    let responseText = agentText;
    let imagesGenerated = 0;

    const jsonMatch = agentText.match(/\{[\s\S]*?"action"[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = safeParseJSON<{
        action: string;
        prompts?: string[];
        descriptions?: string[];
        selected_prompt?: string;
        variations?: string[];
      }>(jsonMatch[0], { action: "none" });

      if (
        parsed.action === "generate_logos" &&
        parsed.prompts?.length &&
        credits.credits >= CREDIT_COST_PER_MESSAGE + parsed.prompts.length * CREDIT_COST_PER_IMAGE
      ) {
        const logoUrls = await Promise.all(
          parsed.prompts.map((p) => generateLogoWithLeonardo(p))
        );
        logos = logoUrls.map((url, i) => ({
          url,
          description: parsed.descriptions?.[i] || `Logo ${i + 1}`,
          prompt: parsed.prompts![i],
        }));
        responseText =
          "Aqui estão suas três sugestões de logo! Qual delas você mais gostou? 😊";
        imagesGenerated = parsed.prompts.length;
      }

      if (
        parsed.action === "generate_variations" &&
        parsed.selected_prompt &&
        parsed.variations?.length
      ) {
        const variationPrompts = parsed.variations.map(
          (v) => `${parsed.selected_prompt}, ${v}`
        );
        const logoUrls = await Promise.all(
          variationPrompts.map((p) => generateLogoWithLeonardo(p))
        );
        logos = logoUrls.map((url, i) => ({
          url,
          description: parsed.variations![i] || `Variação ${i + 1}`,
          prompt: variationPrompts[i],
        }));
        responseText = "Aqui estão as variações do seu logo! ✨ Baixe as que preferir.";
        imagesGenerated = parsed.variations.length;
      }
    }

    // Deduct credits
    const creditsToDeduct =
      CREDIT_COST_PER_MESSAGE + imagesGenerated * CREDIT_COST_PER_IMAGE;

    await supabase
      .from("user_credits")
      .update({
        credits: credits.credits - creditsToDeduct,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    log({
      function: "logo-generator",
      user_id: userId,
      action: "generate",
      status: "success",
      credits_used: creditsToDeduct,
      duration_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ message: responseText, logos }),
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
