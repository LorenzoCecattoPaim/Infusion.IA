import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AGENTE_4_OTIMIZADOR_PROMPT,
  callAgent,
  validateWithAgent,
  safeParseJSON,
} from "../_shared/agents.ts";
import { corsHeaders, errorResponse, jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { log, logError } from "../_shared/monitoring.ts";

const LEONARDO_API_KEY = () => Deno.env.get("LEONARDO_API_KEY") || "";

// Leonardo AI model IDs
const LEONARDO_MODELS = {
  standard: "6bef9f1b-29cb-40c7-b9df-32b51c1f67d3", // Leonardo Creative
  premium: "b24e16ff-06e3-43eb-8d33-4416c2d75876", // Leonardo Diffusion XL
};

async function generateWithLeonardo(
  prompt: string,
  negativePrompt: string,
  quality: "standard" | "premium",
  width: number,
  height: number
): Promise<string> {
  const apiKey = LEONARDO_API_KEY();
  if (!apiKey) throw new Error("LEONARDO_API_KEY nÃ£o configurado.");

  const body = {
    prompt,
    negative_prompt: negativePrompt,
    modelId: LEONARDO_MODELS[quality],
    num_images: 1,
    width,
    height,
    num_inference_steps: quality === "premium" ? 40 : 25,
    guidance_scale: 7,
    public: false,
  };

  const initRes = await fetch(
    "https://cloud.leonardo.ai/api/rest/v1/generations",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }
  );

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Leonardo API error ${initRes.status}: ${err}`);
  }

  const initData = await initRes.json();
  const generationId = initData.sdGenerationJob?.generationId;
  if (!generationId) throw new Error("Leonardo: falha ao iniciar geraÃ§Ã£o");

  // Poll for completion
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(
      `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    const gen = pollData.generations_by_pk;

    if (gen?.status === "COMPLETE") {
      const url = gen.generated_images?.[0]?.url;
      if (!url) throw new Error("Leonardo: URL da imagem nÃ£o encontrada");
      return url;
    }

    if (gen?.status === "FAILED") {
      throw new Error("Leonardo: geraÃ§Ã£o falhou");
    }
  }

  throw new Error("Leonardo: timeout na geraÃ§Ã£o (60s)");
}

Deno.serve(async (req) => {
  console.log("Request recebida:", req.method);
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
    const { prompt, quality = "standard", template, format } = body as {
      prompt?: string;
      quality?: "standard" | "premium";
      template?: string;
      format?: string;
    };

    if (!prompt?.trim()) return errorResponse("prompt Ã© obrigatÃ³rio", 400);

    const creditCost = quality === "premium" ? 10 : 5;

    const formatMap: Record<string, { width: number; height: number }> = {
      youtube_thumbnail: { width: 1024, height: 576 },
      youtube_banner: { width: 1024, height: 576 },
      instagram_1x1: { width: 1024, height: 1024 },
      stories_16x9: { width: 1024, height: 576 },
    };

    const size = formatMap[format as string] || { width: 1024, height: 1024 };

    // Check credits
    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", user.id)
      .single();

    if (!credits || credits.credits < creditCost) {
      return errorResponse("insufficient_credits", 402);
    }

    // Validate prompt
    const validation = await validateWithAgent(prompt);
    if (!validation.ok) {
      return errorResponse(
        `ConteÃºdo nÃ£o permitido: ${validation.motivo_rejeicao}`,
        400
      );
    }

    // Optimize prompt with Agent 4
    const userContent = template
      ? `Otimize este prompt para geraÃ§Ã£o de imagem. Template: ${template}. DescriÃ§Ã£o: ${prompt}`
      : `Otimize este prompt para geraÃ§Ã£o de imagem: ${prompt}`;

    let optimized: {
      prompt_1: string;
      prompt_2: string;
      negative_prompt: string;
      style_notes: string;
    };

    try {
      const optimizedText = (await callAgent({
        systemPrompt: AGENTE_4_OTIMIZADOR_PROMPT,
        messages: [{ role: "user", content: userContent }],
        model: Deno.env.get("AI_MODEL_PROMPT_OPT") || "gpt-4o-mini",
        responseFormat: "json_object",
        maxTokens: 1024,
        temperature: 0.8,
      })) as string;

      optimized = safeParseJSON(optimizedText, {
        prompt_1: `${prompt}, professional quality, detailed, 8k resolution`,
        prompt_2: `${prompt}, artistic style, vibrant colors, high resolution`,
        negative_prompt:
          "blurry, low quality, distorted, watermark, text errors, ugly",
        style_notes: "",
      });
    } catch {
      optimized = {
        prompt_1: `${prompt}, professional quality, detailed, 8k resolution`,
        prompt_2: `${prompt}, artistic style, vibrant colors, high resolution`,
        negative_prompt: "blurry, low quality, distorted, watermark",
        style_notes: "Prompt otimizado com fallback",
      };
    }

    // Generate 2 variations concurrently
    const [url1, url2] = await Promise.all([
      generateWithLeonardo(
        optimized.prompt_1,
        optimized.negative_prompt,
        quality as "standard" | "premium",
        size.width,
        size.height
      ),
      generateWithLeonardo(
        optimized.prompt_2,
        optimized.negative_prompt,
        quality as "standard" | "premium",
        size.width,
        size.height
      ),
    ]);

    // Deduct credits
    await supabase
      .from("user_credits")
      .update({
        credits: credits.credits - creditCost,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    // Save to DB
    const { data: savedImages } = await supabase
      .from("generated_images")
      .insert([
        {
          user_id: user.id,
          url: url1,
          prompt,
          optimized_prompt: optimized.prompt_1,
          negative_prompt: optimized.negative_prompt,
          quality,
        },
        {
          user_id: user.id,
          url: url2,
          prompt,
          optimized_prompt: optimized.prompt_2,
          negative_prompt: optimized.negative_prompt,
          quality,
        },
      ])
      .select();

    log({
      function: "generate-image",
      user_id: userId,
      action: "generate",
      status: "success",
      credits_used: creditCost,
      duration_ms: Date.now() - startTime,
    });

    return jsonResponse({ images: savedImages, style_notes: optimized.style_notes });
  } catch (err) {
    logError("generate-image", userId, err);
    return errorResponse(
      err instanceof Error ? err.message : "Erro ao gerar imagem",
      500
    );
  }
});



