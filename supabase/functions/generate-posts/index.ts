// supabase/functions/generate-posts/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AGENTE_3_GERADOR_POSTS,
  AGENTE_5_VALIDADOR,
  callAgent,
  validateWithAgent,
  safeParseJSON,
  corsHeaders,
} from "../_shared/agents.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  const { brief, tone = "profissional", channels = ["Instagram"], cta } = await req.json();
  const CREDIT_COST = 2;

  const { data: credits } = await supabase
    .from("user_credits").select("credits").eq("user_id", user.id).single();

  if (!credits || credits.credits < CREDIT_COST) {
    return new Response(JSON.stringify({ error: "insufficient_credits" }), {
      status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("nome_empresa, segmento, publico_alvo, tom_de_voz")
    .eq("user_id", user.id).single();

  const validation = await validateWithAgent(AGENTE_5_VALIDADOR, brief);
  if (!validation.ok) {
    return new Response(
      JSON.stringify({ error: "validation_failed", motivo: validation.motivo_rejeicao }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const userPrompt = `
Crie posts para os seguintes canais: ${channels.join(", ")}.

BRIEFING: ${brief}
TOM DE VOZ: ${tone}${profile?.tom_de_voz ? ` (preferência da empresa: ${profile.tom_de_voz})` : ""}
CTA DESEJADO: ${cta || "Não especificado"}
${profile ? `EMPRESA: ${profile.nome_empresa} | SEGMENTO: ${profile.segmento} | PÚBLICO: ${profile.publico_alvo}` : ""}

Gere um post completo para cada canal solicitado.`.trim();

  const model = Deno.env.get("AI_MODEL_MARKETING") || "gpt-4o";
  const result = await callAgent({
    systemPrompt: AGENTE_3_GERADOR_POSTS,
    messages: [{ role: "user", content: userPrompt }],
    model,
    responseFormat: "json_object",
    maxTokens: 2048,
    temperature: 0.85,
  }) as string;

  const parsed = safeParseJSON<{ posts: Record<string,unknown>[]; dicas_extras: string }>(result, {
    posts: [], dicas_extras: "",
  });

  const resultValidation = await validateWithAgent(AGENTE_5_VALIDADOR, result);
  if (!resultValidation.ok) {
    return new Response(
      JSON.stringify({ error: "content_validation_failed", motivo: resultValidation.motivo_rejeicao }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  await supabase.rpc("deduct_credits", {
    p_user_id: user.id,
    p_amount: CREDIT_COST,
    p_reason: "generate_post",
    p_desc: `Geração de posts: ${channels.join(", ")}`,
  });

  // Salva posts gerados
  if (parsed.posts.length > 0) {
    await supabase.from("generated_posts").insert(
      parsed.posts.map((p: any) => ({
        user_id: user.id,
        brief,
        canal: p.canal,
        titulo: p.titulo,
        caption: p.caption,
        hashtags: p.hashtags,
        cta: p.cta,
        sugestao_visual: p.sugestao_visual,
        melhor_horario: p.melhor_horario,
        dicas_extras: parsed.dicas_extras,
        credits_used: CREDIT_COST,
      })),
    );
  }

  return new Response(JSON.stringify(parsed), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
