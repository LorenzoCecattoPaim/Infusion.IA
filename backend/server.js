
import express from "express";
import cors from "cors";
import { Readable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import {
  AGENTE_1_CONSULTOR_MARKETING,
  AGENTE_2_DESIGNER_LOGO,
  AGENTE_3_GERADOR_POSTS,
  AGENTE_4_OTIMIZADOR_PROMPT,
  AGENTE_6_GERADOR_TEXTO,
  AGENTE_7_GERADOR_POSTS_IMAGEM,
  AGENTE_LOGO_PROMPT_BUILDER,
  callAgent,
  renderBusinessPrompt,
  safeParseJSON,
  validateWithAgent,
} from "./ai.js";

const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL e SERVICE_ROLE_KEY são obrigatórios");
}

function getSupabase() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["https://infusion-ia.vercel.app"];

const corsConfig = cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

app.use(corsConfig);
app.options("*", corsConfig);
app.use(express.json({ limit: "5mb" }));

function sendSuccess(res, data = {}, status = 200) {
  res.status(status).json({ success: true, ...data });
}

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

async function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    sendError(res, 401, "Unauthorized");
    return;
  }
  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    sendError(res, 401, "Unauthorized");
    return;
  }
  req.user = user;
  next();
}

app.get("/health", (_req, res) => {
  sendSuccess(res, { ok: true });
});
app.get("/credits", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("user_credits")
      .select("credits, plan")
      .eq("user_id", req.user.id)
      .single();
    if (error) throw error;
    return sendSuccess(res, data || { credits: 0, plan: "free" });
  } catch (error) {
    console.error("[CREDITS] error", error);
    return sendError(res, 500, "Erro ao carregar créditos.");
  }
});

app.get("/dashboard-stats", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const [posts, images, logos, credits] = await Promise.all([
      supabase
        .from("generated_posts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", req.user.id),
      supabase
        .from("generated_images")
        .select("id", { count: "exact", head: true })
        .eq("user_id", req.user.id),
      supabase
        .from("generated_logos")
        .select("id", { count: "exact", head: true })
        .eq("user_id", req.user.id),
      supabase
        .from("user_credits")
        .select("credits")
        .eq("user_id", req.user.id)
        .maybeSingle(),
    ]);

    if (posts.error) throw posts.error;
    if (images.error) throw images.error;
    if (logos.error) throw logos.error;
    if (credits.error) throw credits.error;

    return sendSuccess(res, {
      posts_generated: posts.count ?? 0,
      images_generated: images.count ?? 0,
      logos_generated: logos.count ?? 0,
      credits: credits.data?.credits ?? 0,
    });
  } catch (error) {
    console.error("[DASHBOARD] error", error);
    return sendError(res, 500, "Erro ao carregar resumo.");
  }
});

app.get("/generated-images", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("generated_images")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return sendSuccess(res, { images: data || [] });
  } catch (error) {
    console.error("[IMAGES] error", error);
    return sendError(res, 500, "Erro ao carregar imagens.");
  }
});

app.get("/profile", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (error) throw error;
    return sendSuccess(res, { profile: data || null });
  } catch (error) {
    console.error("[PROFILE] error", error);
    return sendError(res, 500, "Erro ao carregar perfil.");
  }
});

app.put("/profile", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const updates = req.body || {};
    const { data: existing, error: existingError } = await supabase
      .from("business_profiles")
      .select("id")
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (existingError) throw existingError;

    let saved;
    if (existing?.id) {
      const { data, error } = await supabase
        .from("business_profiles")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("user_id", req.user.id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabase
        .from("business_profiles")
        .insert({ ...updates, user_id: req.user.id })
        .select("*")
        .single();
      if (error) throw error;
      saved = data;
    }

    return sendSuccess(res, { profile: saved });
  } catch (error) {
    console.error("[PROFILE] update error", error);
    return sendError(res, 500, "Erro ao salvar perfil.");
  }
});

app.get("/chat/conversations", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("chat_conversations")
      .select("id, title, updated_at")
      .eq("user_id", req.user.id)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    return sendSuccess(res, { conversations: data || [] });
  } catch (error) {
    console.error("[CHAT] conversations error", error);
    return sendError(res, 500, "Erro ao carregar conversas.");
  }
});

app.post("/chat/conversations", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { title } = req.body || {};
    const { data, error } = await supabase
      .from("chat_conversations")
      .insert({ user_id: req.user.id, title })
      .select("id")
      .single();
    if (error) throw error;
    return sendSuccess(res, { id: data?.id });
  } catch (error) {
    console.error("[CHAT] create conversation error", error);
    return sendError(res, 500, "Erro ao criar conversa.");
  }
});

app.get("/chat/conversations/:id/messages", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", req.params.id)
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return sendSuccess(res, { messages: data || [] });
  } catch (error) {
    console.error("[CHAT] messages error", error);
    return sendError(res, 500, "Erro ao carregar mensagens.");
  }
});

app.post("/chat/conversations/:id/messages", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { role, content } = req.body || {};
    if (!role || !content) {
      return sendError(res, 400, "role e content são obrigatórios.");
    }
    const { error } = await supabase.from("chat_messages").insert({
      conversation_id: req.params.id,
      user_id: req.user.id,
      role,
      content,
    });
    if (error) throw error;

    await supabase
      .from("chat_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", req.params.id);

    return sendSuccess(res, { ok: true });
  } catch (error) {
    console.error("[CHAT] persist message error", error);
    return sendError(res, 500, "Erro ao salvar mensagem.");
  }
});
app.post("/ai-chat", requireAuth, async (req, res) => {
  const startTime = Date.now();
  try {
    const supabase = getSupabase();
    const { messages = [], stream = false, lastMessageOverride } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return sendError(res, 400, "messages array is required");
    }

    const processedMessages = [...messages];
    if (lastMessageOverride && processedMessages.length > 0) {
      const lastIdx = processedMessages.length - 1;
      if (processedMessages[lastIdx].role === "user") {
        processedMessages[lastIdx] = {
          ...processedMessages[lastIdx],
          content: lastMessageOverride,
        };
      }
    }

    const { data: credits, error: creditsError } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", req.user.id)
      .single();

    if (creditsError || !credits || credits.credits < 1) {
      return sendError(res, 402, "insufficient_credits");
    }

    const { data: profile } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", req.user.id)
      .maybeSingle();

    const { data: materials } = await supabase
      .from("business_materials")
      .select("content, name")
      .eq("user_id", req.user.id)
      .limit(5);

    const materialsContext =
      materials?.map((m) => `[${m.name}]:\n${m.content}`).join("\n\n") || "";

    const systemPrompt = renderBusinessPrompt(
      AGENTE_1_CONSULTOR_MARKETING,
      profile || null,
      materialsContext
    );

    const lastUserMsg = processedMessages.filter((m) => m.role === "user").pop();
    if (lastUserMsg) {
      const validation = await validateWithAgent(lastUserMsg.content);
      if (!validation.ok) {
        return sendError(res, 400, `Conteúdo não permitido: ${validation.motivo_rejeicao}`);
      }
    }

    await supabase
      .from("user_credits")
      .update({ credits: credits.credits - 1, updated_at: new Date().toISOString() })
      .eq("user_id", req.user.id);

    const model = process.env.AI_MODEL_MARKETING || "gpt-4o";
    const agentMessages = processedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (stream) {
      const aiResponse = await callAgent({
        systemPrompt,
        messages: agentMessages,
        model,
        stream: true,
      });

      if (!aiResponse || !aiResponse.body) {
        return sendError(res, 500, "Stream failed");
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      Readable.fromWeb(aiResponse.body).pipe(res);
      return;
    }

    const text = await callAgent({
      systemPrompt,
      messages: agentMessages,
      model,
    });

    return sendSuccess(res, {
      choices: [{ message: { role: "assistant", content: text } }],
    });
  } catch (error) {
    console.error("[AI-CHAT] error", error);
    return sendError(res, 500, "Erro interno");
  } finally {
    console.log("AI-CHAT DURATION_MS:", Date.now() - startTime);
  }
});

app.post("/generate-posts", requireAuth, async (req, res) => {
  const startTime = Date.now();
  try {
    const supabase = getSupabase();
    const body = req.body || {};
    const brief = typeof body.brief === "string" ? body.brief : "";
    const rawChannels = body.channels || (body.canal ? [body.canal] : ["Instagram"]);
    const channels = Array.isArray(rawChannels)
      ? rawChannels.map((c) => String(c)).filter((c) => c.trim())
      : [String(rawChannels)];
    const objetivo = typeof body.objetivo === "string" ? body.objetivo : "Não informado";
    const tipoConteudo =
      typeof body.tipo_conteudo === "string"
        ? body.tipo_conteudo
        : typeof body.tipoConteudo === "string"
        ? body.tipoConteudo
        : "Não informado";

    if (!channels?.length) return sendError(res, 400, "canal é obrigatório");

    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", req.user.id)
      .single();

    if (!credits || credits.credits < 2) {
      return sendError(res, 402, "insufficient_credits");
    }

    const { data: profile } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", req.user.id)
      .maybeSingle();

    const validation = await validateWithAgent(
      [brief, objetivo, tipoConteudo, channels.join(", ")].join(" | ")
    );
    if (!validation.ok) {
      return sendError(res, 400, `Conteúdo não permitido: ${validation.motivo_rejeicao}`);
    }

    const systemPrompt = renderBusinessPrompt(
      AGENTE_3_GERADOR_POSTS,
      profile || null,
      ""
    );

    const userPrompt = `
Canal: ${channels.join(", ")}
Objetivo: ${objetivo}
Tipo de conteúdo: ${tipoConteudo}
Brief: ${brief || "Não informado"}

Gere um post para cada canal solicitado. Responda apenas com JSON válido.`.trim();

    const result = await callAgent({
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      model: process.env.AI_MODEL_MARKETING || "gpt-4o",
      responseFormat: "json_object",
      maxTokens: 2048,
      temperature: 0.85,
    });

    const parsed = safeParseJSON(result, { posts: [] });
    if (!parsed.posts || parsed.posts.length === 0) {
      throw new Error("IA retornou resposta vazia.");
    }

    const resultValidation = await validateWithAgent(result);
    if (!resultValidation.ok) {
      return sendError(res, 400, `Conteúdo gerado não permitido: ${resultValidation.motivo_rejeicao}`);
    }

    if (parsed.posts?.length) {
      await supabase.from("generated_posts").insert(
        parsed.posts.map((post) => ({
          user_id: req.user.id,
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

    await supabase
      .from("user_credits")
      .update({ credits: credits.credits - 2, updated_at: new Date().toISOString() })
      .eq("user_id", req.user.id);

    console.log("generate-posts duration", Date.now() - startTime);
    return sendSuccess(res, parsed);
  } catch (error) {
    console.error("[GENERATE-POSTS] error", error);
    return sendError(res, 500, "Erro ao gerar posts");
  }
});

app.post("/generate-text", requireAuth, async (req, res) => {
  const startTime = Date.now();
  try {
    const supabase = getSupabase();
    const {
      tipo_conteudo,
      descricao,
      publico_alvo,
      tom_voz,
      variation,
      refine_notes,
      previous_text,
    } = req.body || {};

    if (!tipo_conteudo || !descricao?.trim()) {
      return sendError(res, 400, "tipo_conteudo e descricao são obrigatórios");
    }

    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", req.user.id)
      .single();

    if (!credits || credits.credits < 1) {
      return sendError(res, 402, "insufficient_credits");
    }

    const { data: profile } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", req.user.id)
      .maybeSingle();

    const validation = await validateWithAgent(
      [tipo_conteudo, descricao, publico_alvo, tom_voz].join(" | ")
    );
    if (!validation.ok) {
      return sendError(res, 400, `Conteúdo não permitido: ${validation.motivo_rejeicao}`);
    }

    const systemPrompt = renderBusinessPrompt(
      AGENTE_6_GERADOR_TEXTO,
      profile || null,
      ""
    );

    const limites = {
      "Legenda Instagram": 2200,
      "Legenda Facebook": 63206,
      "Legenda LinkedIn": 3000,
    };
    const limite = limites[tipo_conteudo] || 0;

    const userPrompt = `
Tipo de conteúdo: ${tipo_conteudo}
Limite de caracteres (quando aplicável): ${limite || "N/A"}
Descrição: ${descricao}
Público-alvo: ${publico_alvo || "Não informado"}
Tom de voz: ${tom_voz || "Não informado"}
Variação solicitada: ${variation ? "Sim" : "Não"}
Refinamento solicitado: ${refine_notes || "Nenhum"}
Texto anterior (se houver): ${previous_text || "N/A"}

Gere o conteúdo solicitado respeitando o limite quando aplicável. Responda apenas com JSON válido.`.trim();

    const result = await callAgent({
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      model: process.env.AI_MODEL_MARKETING || "gpt-4o",
      responseFormat: "json_object",
      maxTokens: 1200,
      temperature: 0.8,
    });

    const parsed = safeParseJSON(result, { texto: "", sugestoes: [], prompt: null });
    if (
      !parsed.texto?.trim() &&
      !parsed.prompt &&
      (!parsed.sugestoes || parsed.sugestoes.length === 0)
    ) {
      throw new Error("IA retornou resposta vazia.");
    }

    const resultValidation = await validateWithAgent(result);
    if (!resultValidation.ok) {
      return sendError(
        res,
        400,
        `Conteúdo gerado não permitido: ${resultValidation.motivo_rejeicao}`
      );
    }

    await supabase
      .from("user_credits")
      .update({ credits: credits.credits - 1, updated_at: new Date().toISOString() })
      .eq("user_id", req.user.id);

    console.log("generate-text duration", Date.now() - startTime);
    return sendSuccess(res, parsed);
  } catch (error) {
    console.error("[GENERATE-TEXT] error", error);
    return sendError(res, 500, "Erro ao gerar texto");
  }
});

app.post("/generate-post-prompt", requireAuth, async (req, res) => {
  const startTime = Date.now();
  try {
    const supabase = getSupabase();
    const { tipo_post, descricao, formato, estilo, incluir_espaco_logo, logo_presente } =
      req.body || {};

    if (!tipo_post || !descricao?.trim() || !formato || !estilo) {
      return sendError(res, 400, "Campos obrigatórios não preenchidos");
    }

    const validation = await validateWithAgent(
      [tipo_post, descricao, formato, estilo].join(" | ")
    );
    if (!validation.ok) {
      return sendError(res, 400, `Conteúdo não permitido: ${validation.motivo_rejeicao}`);
    }

    const { data: profile } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", req.user.id)
      .maybeSingle();

    const systemPrompt = renderBusinessPrompt(
      AGENTE_7_GERADOR_POSTS_IMAGEM,
      profile || null,
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

    const result = await callAgent({
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      model: process.env.AI_MODEL_MARKETING || "gpt-4o",
      responseFormat: "json_object",
      maxTokens: 900,
      temperature: 0.7,
    });

    const parsed = safeParseJSON(result, { prompt: "", perguntas: [] });
    if (!parsed.prompt?.trim() && (!parsed.perguntas || parsed.perguntas.length === 0)) {
      throw new Error("IA retornou resposta vazia.");
    }

    console.log("generate-post-prompt duration", Date.now() - startTime);
    return sendSuccess(res, parsed);
  } catch (error) {
    console.error("[GENERATE-POST-PROMPT] error", error);
    return sendError(res, 500, "Erro ao gerar prompt");
  }
});
async function generateWithLeonardo(prompt, negativePrompt, quality, width, height) {
  const apiKey = process.env.LEONARDO_API_KEY || "";
  if (!apiKey) throw new Error("LEONARDO_API_KEY não configurado.");

  const models = {
    standard: "6bef9f1b-29cb-40c7-b9df-32b51c1f67d3",
    premium: "b24e16ff-06e3-43eb-8d33-4416c2d75876",
  };

  const body = {
    prompt,
    negative_prompt: negativePrompt,
    modelId: models[quality],
    num_images: 1,
    width,
    height,
    num_inference_steps: quality === "premium" ? 40 : 25,
    guidance_scale: 7,
    public: false,
  };

  const initRes = await fetch("https://cloud.leonardo.ai/api/rest/v1/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Leonardo API error ${initRes.status}: ${err}`);
  }

  const initData = await initRes.json();
  const generationId = initData.sdGenerationJob?.generationId;
  if (!generationId) throw new Error("Leonardo: falha ao iniciar geração");

  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(
      `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    const gen = pollData.generations_by_pk;
    if (gen?.status === "COMPLETE") {
      const url = gen.generated_images?.[0]?.url;
      if (!url) throw new Error("Leonardo: URL da imagem não encontrada");
      return url;
    }
    if (gen?.status === "FAILED") {
      throw new Error("Leonardo: geração falhou");
    }
  }

  throw new Error("Leonardo: timeout na geração (60s)");
}

app.post("/generate-image", requireAuth, async (req, res) => {
  const startTime = Date.now();
  try {
    const supabase = getSupabase();
    const { prompt, quality = "standard", template, format } = req.body || {};
    if (!prompt?.trim()) return sendError(res, 400, "prompt é obrigatório");

    const creditCost = quality === "premium" ? 10 : 5;

    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", req.user.id)
      .single();

    if (!credits || credits.credits < creditCost) {
      return sendError(res, 402, "insufficient_credits");
    }

    const validation = await validateWithAgent(prompt);
    if (!validation.ok) {
      return sendError(res, 400, `Conteúdo não permitido: ${validation.motivo_rejeicao}`);
    }

    const formatMap = {
      youtube_thumbnail: { width: 1024, height: 576 },
      youtube_banner: { width: 1024, height: 576 },
      instagram_1x1: { width: 1024, height: 1024 },
      stories_16x9: { width: 1024, height: 576 },
    };
    const size = formatMap[format] || { width: 1024, height: 1024 };

    const userContent = template
      ? `Otimize este prompt para geração de imagem. Template: ${template}. Descrição: ${prompt}`
      : `Otimize este prompt para geração de imagem: ${prompt}`;

    let optimized;
    try {
      const optimizedText = await callAgent({
        systemPrompt: AGENTE_4_OTIMIZADOR_PROMPT,
        messages: [{ role: "user", content: userContent }],
        model: process.env.AI_MODEL_PROMPT_OPT || "gpt-4o-mini",
        responseFormat: "json_object",
        maxTokens: 1024,
        temperature: 0.8,
      });

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

    const [url1, url2] = await Promise.all([
      generateWithLeonardo(
        optimized.prompt_1,
        optimized.negative_prompt,
        quality,
        size.width,
        size.height
      ),
      generateWithLeonardo(
        optimized.prompt_2,
        optimized.negative_prompt,
        quality,
        size.width,
        size.height
      ),
    ]);

    await supabase
      .from("user_credits")
      .update({ credits: credits.credits - creditCost, updated_at: new Date().toISOString() })
      .eq("user_id", req.user.id);

    const { data: savedImages } = await supabase
      .from("generated_images")
      .insert([
        {
          user_id: req.user.id,
          url: url1,
          prompt,
          optimized_prompt: optimized.prompt_1,
          negative_prompt: optimized.negative_prompt,
          quality,
        },
        {
          user_id: req.user.id,
          url: url2,
          prompt,
          optimized_prompt: optimized.prompt_2,
          negative_prompt: optimized.negative_prompt,
          quality,
        },
      ])
      .select();

    console.log("generate-image duration", Date.now() - startTime);
    return sendSuccess(res, { images: savedImages, style_notes: optimized.style_notes });
  } catch (error) {
    console.error("[GENERATE-IMAGE] error", error);
    return sendError(res, 500, "Erro ao gerar imagem");
  }
});

async function generateLogoWithLeonardo(prompt) {
  const apiKey = process.env.LEONARDO_API_KEY || "";
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

  const initRes = await fetch("https://cloud.leonardo.ai/api/rest/v1/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!initRes.ok) throw new Error(`Leonardo API error ${initRes.status}`);

  const initData = await initRes.json();
  const generationId = initData.sdGenerationJob?.generationId;
  if (!generationId) throw new Error("Leonardo: falha ao iniciar geração de logo");

  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(
      `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    const gen = pollData.generations_by_pk;
    if (gen?.status === "COMPLETE") {
      const url = gen.generated_images?.[0]?.url;
      if (url) return url;
      throw new Error("Leonardo: logo gerado sem URL.");
    }
    if (gen?.status === "FAILED") throw new Error("Leonardo: geração de logo falhou");
  }
  throw new Error("Leonardo: timeout na geração de logo");
}

async function buildLogoPrompts(conversation) {
  const result = await callAgent({
    systemPrompt: AGENTE_LOGO_PROMPT_BUILDER,
    messages: [{ role: "user", content: conversation }],
    model: process.env.AI_MODEL_LOGO || "gpt-4o",
    responseFormat: "json_object",
    maxTokens: 800,
    temperature: 0.7,
  });
  return safeParseJSON(result, { prompts: [], descriptions: [] });
}

app.post("/logo-generator", requireAuth, async (req, res) => {
  const startTime = Date.now();
  try {
    const supabase = getSupabase();
    const { messages, action, selectedPrompt } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return sendError(res, 400, "messages é obrigatório");
    }
    const normalizedMessages = messages
      .map((m) => ({ role: String(m.role || ""), content: String(m.content || "") }))
      .filter((m) => m.role && m.content);
    if (!normalizedMessages.length) {
      return sendError(res, 400, "messages é obrigatório");
    }

    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits")
      .eq("user_id", req.user.id)
      .single();

    if (!credits || credits.credits < 1) {
      return sendError(res, 402, "insufficient_credits");
    }

    const { data: profile } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (action === "generate_logos") {
      const cost = 3 * 5;
      if (credits.credits < cost) {
        return sendError(res, 402, "insufficient_credits");
      }

      const conversationText = normalizedMessages
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n");

      const promptSet = await buildLogoPrompts(conversationText);
      const prompts = promptSet.prompts?.length ? promptSet.prompts.slice(0, 3) : [];
      const descriptions = promptSet.descriptions?.length
        ? promptSet.descriptions.slice(0, 3)
        : [];

      if (prompts.length < 3) {
        return sendError(res, 500, "Não foi possível gerar os prompts do logo.");
      }

      const logoUrls = await Promise.all(prompts.map((p) => generateLogoWithLeonardo(p)));
      const logos = logoUrls.map((url, i) => ({
        url,
        description: descriptions[i] || `Logo ${i + 1}`,
        prompt: prompts[i],
      }));

      await supabase.from("generated_logos").insert(
        logos.map((logo) => ({
          user_id: req.user.id,
          url: logo.url,
          prompt: logo.prompt,
          description: logo.description,
          variation_type: "base",
        }))
      );

      await supabase
        .from("user_credits")
        .update({ credits: credits.credits - cost, updated_at: new Date().toISOString() })
        .eq("user_id", req.user.id);

      return sendSuccess(res, {
        message: "Aqui estão suas três sugestões de logo! Qual delas você mais gostou?",
        logos,
      });
    }

    if (action === "generate_variations") {
      if (!selectedPrompt) {
        return sendError(res, 400, "selectedPrompt é obrigatório");
      }
      const variations = [
        "silver metallic logo",
        "golden metallic logo",
        "black logo on white background",
        "white logo on black background",
      ];
      const cost = variations.length * 5;
      if (credits.credits < cost) {
        return sendError(res, 402, "insufficient_credits");
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
          user_id: req.user.id,
          url: logo.url,
          prompt: logo.prompt,
          description: logo.description,
          variation_type: "variation",
        }))
      );

      await supabase
        .from("user_credits")
        .update({ credits: credits.credits - cost, updated_at: new Date().toISOString() })
        .eq("user_id", req.user.id);

      return sendSuccess(res, { message: "Aqui estão as variações do seu logo!", logos });
    }

    if (action && action !== "chat") {
      return sendError(res, 400, "Ação inválida");
    }

    if (credits.credits < 2) {
      return sendError(res, 402, "insufficient_credits");
    }

    const lastMsg = normalizedMessages.filter((m) => m.role === "user").pop();
    if (lastMsg) {
      const validation = await validateWithAgent(lastMsg.content);
      if (!validation.ok) {
        return sendError(res, 400, `Conteúdo não permitido: ${validation.motivo_rejeicao}`);
      }
    }

    const systemPrompt = renderBusinessPrompt(
      AGENTE_2_DESIGNER_LOGO,
      profile || null,
      ""
    );

    const agentText = await callAgent({
      systemPrompt,
      messages: normalizedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      model: process.env.AI_MODEL_LOGO || "gpt-4o",
      maxTokens: 2048,
      temperature: 0.8,
    });

    await supabase
      .from("user_credits")
      .update({ credits: credits.credits - 2, updated_at: new Date().toISOString() })
      .eq("user_id", req.user.id);

    console.log("logo-generator duration", Date.now() - startTime);
    return sendSuccess(res, { message: agentText, logos: [] });
  } catch (error) {
    console.error("[LOGO] error", error);
    return sendError(res, 500, "Erro ao processar logo");
  }
});

const port = Number(process.env.PORT || 10000);
app.listen(port, () => {
  console.log(`Backend listening on ${port}`);
});
