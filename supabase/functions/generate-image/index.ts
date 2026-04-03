// supabase/functions/generate-image/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AGENTE_4_OTIMIZADOR_PROMPT,
  AGENTE_5_VALIDADOR,
  callAgent,
  validateWithAgent,
  safeParseJSON,
  corsHeaders,
} from "../_shared/agents.ts";
import { log, timer } from "../_shared/monitoring.ts";

const LEONARDO_API_KEY = Deno.env.get("LEONARDO_API_KEY") || "";
const LEONARDO_BASE = "https://cloud.leonardo.ai/api/rest/v1";

// Modelos Leonardo
const MODELS = {
  premium: "b24e16ff-06e3-43eb-8d33-4416c2d75876", // Leonardo Diffusion XL
  standard: "6bef9f1b-29cb-40c7-b9df-32b51c1f67d3", // Leonardo Creative
};

async function generateWithLeonardo(
  prompt: string,
  negativePrompt: string,
  quality: string,
): Promise<string> {
  const modelId = quality === "premium" ? MODELS.premium : MODELS.standard;

  const initRes = await fetch(`${LEONARDO_BASE}/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LEONARDO_API_KEY}`,
    },
    body: JSON.stringify({
      prompt,
      negative_prompt: negativePrompt,
      modelId,
      num_images: 1,
      width: 1024,
      height: 1024,
      num_inference_steps: quality === "premium" ? 40 : 25,
      guidance_scale: 7,
      public: false,
    }),
  });

  if (!initRes.ok) throw new Error(`Leonardo init error: ${initRes.status}`);

  const initData = await initRes.json();
  const generationId = initData.sdGenerationJob?.generationId;
  if (!generationId) throw new Error("Leonardo: falha ao iniciar geração");

  // Poll por até 60 segundos
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`${LEONARDO_BASE}/generations/${generationId}`, {
      headers: { Authorization: `Bearer ${LEONARDO_API_KEY}` },
    });
    const pollData = await pollRes.json();
    const gen = pollData.generations_by_pk;
    if (gen?.status === "COMPLETE") return gen.generated_images?.[0]?.url;
    if (gen?.status === "FAILED") throw new Error("Leonardo: geração falhou");
  }
  throw new Error("Leonardo: timeout na geração");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const elapsed = timer();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const { prompt, quality = "standard", template } = await req.json();
    const creditCost = quality === "premium" ? 6 : 3;

    // Verifica créditos
    const { data: credits } = await supabase
      .from("user_credits").select("credits").eq("user_id", user.id).single();

    if (!credits || credits.credits < creditCost) {
      return new Response(
        JSON.stringify({ error: "insufficient_credits" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Valida o prompt
    const validation = await validateWithAgent(AGENTE_5_VALIDADOR, prompt);
    if (!validation.ok) {
      return new Response(
        JSON.stringify({ error: "validation_failed", motivo: validation.motivo_rejeicao }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Otimiza o prompt com Agente 4
    const userContent = template
      ? `Otimize este prompt para geração de imagem. Template: ${template}. Descrição do usuário: ${prompt}`
      : `Otimize este prompt para geração de imagem: ${prompt}`;

    let optimized: { prompt_1: string; prompt_2: string; negative_prompt: string; style_notes: string };

    try {
      const optimizedText = await callAgent({
        systemPrompt: AGENTE_4_OTIMIZADOR_PROMPT,
        messages: [{ role: "user", content: userContent }],
        model: Deno.env.get("AI_MODEL_PROMPT_OPT") || "gpt-4o-mini",
        responseFormat: "json_object",
        maxTokens: 1024,
        temperature: 0.8,
      }) as string;

      optimized = safeParseJSON(optimizedText, {
        prompt_1: `${prompt}, professional quality, detailed, 8k`,
        prompt_2: `${prompt}, artistic style, vibrant colors, high resolution`,
        negative_prompt: "blurry, low quality, distorted, watermark",
        style_notes: "",
      });
    } catch {
      optimized = {
        prompt_1: `${prompt}, professional quality, detailed, 8k`,
        prompt_2: `${prompt}, artistic style, vibrant colors, high resolution`,
        negative_prompt: "blurry, low quality, distorted, watermark",
        style_notes: "",
      };
    }

    log({ function: "generate-image", user_id: user.id, action: "generating", status: "ok", meta: { quality } });

    // Gera 2 variações em paralelo
    const [url1, url2] = await Promise.all([
      generateWithLeonardo(optimized.prompt_1, optimized.negative_prompt, quality),
      generateWithLeonardo(optimized.prompt_2, optimized.negative_prompt, quality),
    ]);

    // Deduz créditos
    await supabase.rpc("deduct_credits", {
      p_user_id: user.id,
      p_amount: creditCost,
      p_reason: "generate_image",
      p_desc: `Geração de imagem ${quality} (2 variações)`,
    });

    // Salva no banco
    const { data: savedImages } = await supabase
      .from("generated_images")
      .insert([
        {
          user_id: user.id, url: url1, prompt,
          optimized_prompt: optimized.prompt_1,
          negative_prompt: optimized.negative_prompt,
          quality, template, credits_used: creditCost,
        },
        {
          user_id: user.id, url: url2, prompt,
          optimized_prompt: optimized.prompt_2,
          negative_prompt: optimized.negative_prompt,
          quality, template, credits_used: 0,
        },
      ])
      .select();

    log({ function: "generate-image", user_id: user.id, action: "complete", status: "ok", duration_ms: elapsed() });

    return new Response(
      JSON.stringify({ images: savedImages, style_notes: optimized.style_notes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    log({ function: "generate-image", action: "error", status: "error", error: String(err), duration_ms: elapsed() });
    return new Response(
      JSON.stringify({ error: "internal_error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
