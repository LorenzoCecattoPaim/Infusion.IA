// supabase/functions/logo-generator/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AGENTE_2_DESIGNER_LOGO,
  AGENTE_5_VALIDADOR,
  callAgent,
  validateWithAgent,
  safeParseJSON,
  corsHeaders,
} from "../_shared/agents.ts";
import { log, timer } from "../_shared/monitoring.ts";

const LEONARDO_API_KEY = Deno.env.get("LEONARDO_API_KEY") || "";
const CREDIT_COST_PER_MESSAGE = 2;
const CREDIT_COST_PER_IMAGE = 4;

async function generateLogoWithLeonardo(prompt: string): Promise<string> {
  const logoPrompt = `${prompt}, professional logo design, vector art style, clean, scalable, white background, high quality, no text errors`;

  const initRes = await fetch("https://cloud.leonardo.ai/api/rest/v1/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LEONARDO_API_KEY}`,
    },
    body: JSON.stringify({
      prompt: logoPrompt,
      negative_prompt: "blurry, raster, low quality, complex background, watermark, text errors, distorted letters, extra elements",
      modelId: "b24e16ff-06e3-43eb-8d33-4416c2d75876",
      num_images: 1,
      width: 1024,
      height: 1024,
      num_inference_steps: 40,
      guidance_scale: 8,
      public: false,
    }),
  });

  if (!initRes.ok) throw new Error(`Leonardo logo init error: ${initRes.status}`);

  const initData = await initRes.json();
  const generationId = initData.sdGenerationJob?.generationId;
  if (!generationId) throw new Error("Leonardo: falha ao iniciar geração de logo");

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`, {
      headers: { Authorization: `Bearer ${LEONARDO_API_KEY}` },
    });
    const pollData = await pollRes.json();
    const gen = pollData.generations_by_pk;
    if (gen?.status === "COMPLETE") return gen.generated_images?.[0]?.url;
    if (gen?.status === "FAILED") throw new Error("Leonardo: geração de logo falhou");
  }
  throw new Error("Leonardo: timeout na geração de logo");
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

    const { messages } = await req.json();

    const { data: credits } = await supabase
      .from("user_credits").select("credits").eq("user_id", user.id).single();

    if (!credits || credits.credits < CREDIT_COST_PER_MESSAGE) {
      return new Response(
        JSON.stringify({ error: "insufficient_credits" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const lastMsg = messages.filter((m: { role: string }) => m.role === "user").pop();
    if (lastMsg) {
      const validation = await validateWithAgent(AGENTE_5_VALIDADOR, lastMsg.content);
      if (!validation.ok) {
        return new Response(
          JSON.stringify({ error: "validation_failed", motivo: validation.motivo_rejeicao }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const model = Deno.env.get("AI_MODEL_LOGO") || "gpt-4o";
    const agentText = await callAgent({
      systemPrompt: AGENTE_2_DESIGNER_LOGO,
      messages: messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      model,
      maxTokens: 2048,
      temperature: 0.8,
    }) as string;

    let logos: Array<{ url: string; description: string; prompt: string }> = [];
    let responseText = agentText;

    const jsonMatch = agentText.match(/\{[\s\S]*"action"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = safeParseJSON<{
        action: string;
        prompts?: string[];
        descriptions?: string[];
        selected_prompt?: string;
        variations?: string[];
      }>(jsonMatch[0], { action: "none" });

      if (parsed.action === "generate_logos" && parsed.prompts?.length) {
        const logoUrls = await Promise.all(parsed.prompts.map(generateLogoWithLeonardo));
        logos = logoUrls.map((url, i) => ({
          url,
          description: parsed.descriptions?.[i] || `Logo ${i + 1}`,
          prompt: parsed.prompts![i],
        }));
        responseText = "Aqui estão suas três sugestões de logo! Qual delas você mais gostou? 😊";
      }

      if (parsed.action === "generate_variations" && parsed.selected_prompt) {
        const variationPrompts = (parsed.variations || []).map(
          (v) => `${parsed.selected_prompt}, ${v}`,
        );
        const logoUrls = await Promise.all(variationPrompts.map(generateLogoWithLeonardo));
        logos = logoUrls.map((url, i) => ({
          url,
          description: parsed.variations![i] || `Variação ${i + 1}`,
          prompt: variationPrompts[i],
        }));
        responseText = "Aqui estão as variações do seu logo escolhido! ✨";
      }
    }

    const creditsToDeduct = CREDIT_COST_PER_MESSAGE + (logos.length * CREDIT_COST_PER_IMAGE);

    await supabase.rpc("deduct_credits", {
      p_user_id: user.id,
      p_amount: creditsToDeduct,
      p_reason: "generate_logo",
      p_desc: `Logo creator: mensagem + ${logos.length} imagens`,
    });

    // Salva logos gerados
    if (logos.length > 0) {
      await supabase.from("generated_logos").insert(
        logos.map((l) => ({
          user_id: user.id,
          url: l.url,
          prompt: l.prompt,
          description: l.description,
          credits_used: CREDIT_COST_PER_IMAGE,
        })),
      );
    }

    log({ function: "logo-generator", user_id: user.id, action: "complete", status: "ok", duration_ms: elapsed() });

    return new Response(
      JSON.stringify({ message: responseText, logos }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    log({ function: "logo-generator", action: "error", status: "error", error: String(err), duration_ms: elapsed() });
    return new Response(
      JSON.stringify({ error: "internal_error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
