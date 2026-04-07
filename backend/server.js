
import express from "express";
import cors from "cors";
import { Readable } from "node:stream";
import { query } from "./db.js";
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
import { hashPassword, requireAuth, signToken, verifyPassword } from "./auth.js";

const app = express();

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

async function getUserByEmail(email) {
  const { rows } = await query("SELECT id, email, password_hash FROM users WHERE email = $1", [
    email,
  ]);
  return rows[0] || null;
}

async function getUserById(id) {
  const { rows } = await query("SELECT id, email FROM users WHERE id = $1", [id]);
  return rows[0] || null;
}

async function ensureCreditsRow(userId) {
  const { rows } = await query(
    "SELECT credits, plan FROM user_credits WHERE user_id = $1",
    [userId]
  );
  if (rows[0]) return rows[0];
  const { rows: inserted } = await query(
    "INSERT INTO user_credits (user_id, credits, plan, updated_at) VALUES ($1, $2, $3, NOW()) RETURNING credits, plan",
    [userId, 10, "free"]
  );
  return inserted[0];
}

async function getProfile(userId) {
  const { rows } = await query("SELECT * FROM business_profiles WHERE user_id = $1", [
    userId,
  ]);
  return rows[0] || null;
}

async function upsertProfile(userId, updates) {
  const payload = JSON.stringify(updates ?? {});
  const current = await getProfile(userId);
  if (current?.id) {
    const { rows } = await query(
      "UPDATE business_profiles SET data = data || $1::jsonb, updated_at = NOW() WHERE user_id = $2 RETURNING *",
      [payload, userId]
    );
    return rows[0];
  }
  const { rows } = await query(
    "INSERT INTO business_profiles (user_id, data, created_at, updated_at) VALUES ($1, $2::jsonb, NOW(), NOW()) RETURNING *",
    [userId, payload]
  );
  return rows[0];
}

function flattenProfile(row) {
  if (!row) return null;
  if (row.data) return { id: row.id, user_id: row.user_id, ...row.data };
  return row;
}

app.get("/health", (_req, res) => {
  sendSuccess(res, { ok: true });
});
app.post("/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return sendError(res, 400, "E-mail e senha são obrigatórios.");
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return sendError(res, 409, "Este e-mail já está cadastrado.");
    }

    const passwordHash = await hashPassword(password);
    const { rows } = await query(
      "INSERT INTO users (email, password_hash, created_at) VALUES ($1, $2, NOW()) RETURNING id, email",
      [email, passwordHash]
    );
    const user = rows[0];
    await ensureCreditsRow(user.id);
    const token = signToken(user);
    return sendSuccess(res, { token, user });
  } catch (error) {
    console.error("[AUTH] register error", error);
    return sendError(res, 500, "Erro ao registrar usuário.");
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return sendError(res, 400, "E-mail e senha são obrigatórios.");
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return sendError(res, 401, "E-mail ou senha inválidos.");
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return sendError(res, 401, "E-mail ou senha inválidos.");
    }

    const token = signToken(user);
    return sendSuccess(res, { token, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error("[AUTH] login error", error);
    return sendError(res, 500, "Erro ao autenticar.");
  }
});

app.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return sendError(res, 401, "Unauthorized");
    }
    return sendSuccess(res, { user });
  } catch (error) {
    console.error("[AUTH] me error", error);
    return sendError(res, 500, "Erro ao carregar sessão.");
  }
});

app.post("/auth/logout", (_req, res) => {
  sendSuccess(res, { ok: true });
});

app.get("/credits", requireAuth, async (req, res) => {
  try {
    const credits = await ensureCreditsRow(req.user.id);
    return sendSuccess(res, credits);
  } catch (error) {
    console.error("[CREDITS] error", error);
    return sendError(res, 500, "Erro ao carregar créditos.");
  }
});

app.get("/dashboard-stats", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [posts, images, logos, credits] = await Promise.all([
      query("SELECT COUNT(*)::int AS count FROM generated_posts WHERE user_id = $1", [
        userId,
      ]),
      query("SELECT COUNT(*)::int AS count FROM generated_images WHERE user_id = $1", [
        userId,
      ]),
      query("SELECT COUNT(*)::int AS count FROM generated_logos WHERE user_id = $1", [
        userId,
      ]),
      query("SELECT credits FROM user_credits WHERE user_id = $1", [userId]),
    ]);

    return sendSuccess(res, {
      posts_generated: posts.rows[0]?.count ?? 0,
      images_generated: images.rows[0]?.count ?? 0,
      logos_generated: logos.rows[0]?.count ?? 0,
      credits: credits.rows[0]?.credits ?? 0,
    });
  } catch (error) {
    console.error("[DASHBOARD] error", error);
    return sendError(res, 500, "Erro ao carregar resumo.");
  }
});

app.get("/generated-images", requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT id, url, prompt, optimized_prompt, negative_prompt, quality, created_at FROM generated_images WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.user.id]
    );
    return sendSuccess(res, { images: rows });
  } catch (error) {
    console.error("[IMAGES] error", error);
    return sendError(res, 500, "Erro ao carregar imagens.");
  }
});

app.get("/profile", requireAuth, async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);
    return sendSuccess(res, { profile: flattenProfile(profile) });
  } catch (error) {
    console.error("[PROFILE] error", error);
    return sendError(res, 500, "Erro ao carregar perfil.");
  }
});

app.put("/profile", requireAuth, async (req, res) => {
  try {
    const updates = req.body || {};
    const updated = await upsertProfile(req.user.id, updates);
    return sendSuccess(res, { profile: flattenProfile(updated) });
  } catch (error) {
    console.error("[PROFILE] update error", error);
    return sendError(res, 500, "Erro ao salvar perfil.");
  }
});

app.get("/chat/conversations", requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT id, title, updated_at FROM chat_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 5",
      [req.user.id]
    );
    return sendSuccess(res, { conversations: rows });
  } catch (error) {
    console.error("[CHAT] conversations error", error);
    return sendError(res, 500, "Erro ao carregar conversas.");
  }
});

app.post("/chat/conversations", requireAuth, async (req, res) => {
  try {
    const { title } = req.body || {};
    const { rows } = await query(
      "INSERT INTO chat_conversations (user_id, title, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING id",
      [req.user.id, title || null]
    );
    return sendSuccess(res, { id: rows[0]?.id });
  } catch (error) {
    console.error("[CHAT] create conversation error", error);
    return sendError(res, 500, "Erro ao criar conversa.");
  }
});

app.get("/chat/conversations/:id/messages", requireAuth, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const { rows } = await query(
      "SELECT id, role, content, created_at FROM chat_messages WHERE conversation_id = $1 AND user_id = $2 ORDER BY created_at ASC",
      [conversationId, req.user.id]
    );
    return sendSuccess(res, { messages: rows });
  } catch (error) {
    console.error("[CHAT] messages error", error);
    return sendError(res, 500, "Erro ao carregar mensagens.");
  }
});

app.post("/chat/conversations/:id/messages", requireAuth, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const { role, content } = req.body || {};
    if (!role || !content) {
      return sendError(res, 400, "role e content são obrigatórios.");
    }
    await query(
      "INSERT INTO chat_messages (conversation_id, user_id, role, content, created_at) VALUES ($1, $2, $3, $4, NOW())",
      [conversationId, req.user.id, role, content]
    );
    await query(
      "UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1 AND user_id = $2",
      [conversationId, req.user.id]
    );
    return sendSuccess(res, { ok: true });
  } catch (error) {
    console.error("[CHAT] persist message error", error);
    return sendError(res, 500, "Erro ao salvar mensagem.");
  }
});
app.post("/ai-chat", requireAuth, async (req, res) => {
  const startTime = Date.now();
  const userId = req.user.id;
  try {
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

    const creditsRes = await query(
      "SELECT credits FROM user_credits WHERE user_id = $1",
      [userId]
    );
    const credits = creditsRes.rows[0];
    if (!credits || credits.credits < 1) {
      return sendError(res, 402, "insufficient_credits");
    }

    const profile = await getProfile(userId);
    const { rows: materials } = await query(
      "SELECT content, name FROM business_materials WHERE user_id = $1 LIMIT 5",
      [userId]
    );
    const materialsContext =
      materials?.map((m) => `[${m.name}]:\n${m.content}`).join("\n\n") || "";

    const systemPrompt = renderBusinessPrompt(
      AGENTE_1_CONSULTOR_MARKETING,
      flattenProfile(profile),
      materialsContext
    );

    const lastUserMsg = processedMessages.filter((m) => m.role === "user").pop();
    if (lastUserMsg) {
      const validation = await validateWithAgent(lastUserMsg.content);
      if (!validation.ok) {
        return sendError(res, 400, `Conteúdo não permitido: ${validation.motivo_rejeicao}`);
      }
    }

    await query(
      "UPDATE user_credits SET credits = credits - 1, updated_at = NOW() WHERE user_id = $1",
      [userId]
    );

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
  const userId = req.user.id;
  try {
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

    const { rows: creditRows } = await query(
      "SELECT credits FROM user_credits WHERE user_id = $1",
      [userId]
    );
    if (!creditRows[0] || creditRows[0].credits < 2) {
      return sendError(res, 402, "insufficient_credits");
    }

    const profile = await getProfile(userId);

    const validation = await validateWithAgent(
      [brief, objetivo, tipoConteudo, channels.join(", ")].join(" | ")
    );
    if (!validation.ok) {
      return sendError(res, 400, `Conteúdo não permitido: ${validation.motivo_rejeicao}`);
    }

    const systemPrompt = renderBusinessPrompt(
      AGENTE_3_GERADOR_POSTS,
      flattenProfile(profile),
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
      const inserts = parsed.posts.map((post) => ({
        user_id: userId,
        canal: String(post.canal || channels[0]),
        objetivo: String(post.objetivo || objetivo),
        tipo_conteudo: String(post.tipo_conteudo || tipoConteudo),
        texto_pronto: String(post.texto_pronto || post.texto || ""),
        cta: String(post.cta || ""),
        sugestao_visual: String(post.sugestao_visual || ""),
        payload_json: post,
      }));

      for (const item of inserts) {
        await query(
          "INSERT INTO generated_posts (user_id, canal, objetivo, tipo_conteudo, texto_pronto, cta, sugestao_visual, payload_json, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())",
          [
            item.user_id,
            item.canal,
            item.objetivo,
            item.tipo_conteudo,
            item.texto_pronto,
            item.cta,
            item.sugestao_visual,
            item.payload_json,
          ]
        );
      }
    }

    await query(
      "UPDATE user_credits SET credits = credits - 2, updated_at = NOW() WHERE user_id = $1",
      [userId]
    );

    console.log("generate-posts duration", Date.now() - startTime);
    return sendSuccess(res, parsed);
  } catch (error) {
    console.error("[GENERATE-POSTS] error", error);
    return sendError(res, 500, "Erro ao gerar posts");
  }
});

app.post("/generate-text", requireAuth, async (req, res) => {
  const startTime = Date.now();
  const userId = req.user.id;
  try {
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

    const { rows: creditRows } = await query(
      "SELECT credits FROM user_credits WHERE user_id = $1",
      [userId]
    );
    if (!creditRows[0] || creditRows[0].credits < 1) {
      return sendError(res, 402, "insufficient_credits");
    }

    const profile = await getProfile(userId);

    const validation = await validateWithAgent(
      [tipo_conteudo, descricao, publico_alvo, tom_voz].join(" | ")
    );
    if (!validation.ok) {
      return sendError(res, 400, `Conteúdo não permitido: ${validation.motivo_rejeicao}`);
    }

    const systemPrompt = renderBusinessPrompt(
      AGENTE_6_GERADOR_TEXTO,
      flattenProfile(profile),
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

    await query(
      "UPDATE user_credits SET credits = credits - 1, updated_at = NOW() WHERE user_id = $1",
      [userId]
    );

    console.log("generate-text duration", Date.now() - startTime);
    return sendSuccess(res, parsed);
  } catch (error) {
    console.error("[GENERATE-TEXT] error", error);
    return sendError(res, 500, "Erro ao gerar texto");
  }
});

app.post("/generate-post-prompt", requireAuth, async (req, res) => {
  const startTime = Date.now();
  const userId = req.user.id;
  try {
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

    const profile = await getProfile(userId);
    const systemPrompt = renderBusinessPrompt(
      AGENTE_7_GERADOR_POSTS_IMAGEM,
      flattenProfile(profile),
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
  const userId = req.user.id;
  try {
    const { prompt, quality = "standard", template, format } = req.body || {};
    if (!prompt?.trim()) return sendError(res, 400, "prompt é obrigatório");

    const creditCost = quality === "premium" ? 10 : 5;

    const { rows: creditRows } = await query(
      "SELECT credits FROM user_credits WHERE user_id = $1",
      [userId]
    );
    if (!creditRows[0] || creditRows[0].credits < creditCost) {
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

    await query(
      "UPDATE user_credits SET credits = credits - $1, updated_at = NOW() WHERE user_id = $2",
      [creditCost, userId]
    );

    const { rows: savedImages } = await query(
      "INSERT INTO generated_images (user_id, url, prompt, optimized_prompt, negative_prompt, quality, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()), ($1, $7, $3, $8, $5, $6, NOW()) RETURNING id, url, prompt, optimized_prompt, negative_prompt, quality, created_at",
      [
        userId,
        url1,
        prompt,
        optimized.prompt_1,
        optimized.negative_prompt,
        quality,
        url2,
        optimized.prompt_2,
      ]
    );

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
  const userId = req.user.id;
  try {
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

    const { rows: creditRows } = await query(
      "SELECT credits FROM user_credits WHERE user_id = $1",
      [userId]
    );
    if (!creditRows[0] || creditRows[0].credits < 1) {
      return sendError(res, 402, "insufficient_credits");
    }

    const profile = await getProfile(userId);

    if (action === "generate_logos") {
      const cost = 3 * 5;
      if (creditRows[0].credits < cost) {
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

      for (const logo of logos) {
        await query(
          "INSERT INTO generated_logos (user_id, url, prompt, description, variation_type, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
          [userId, logo.url, logo.prompt, logo.description, "base"]
        );
      }

      await query(
        "UPDATE user_credits SET credits = credits - $1, updated_at = NOW() WHERE user_id = $2",
        [cost, userId]
      );

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
      if (creditRows[0].credits < cost) {
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

      for (const logo of logos) {
        await query(
          "INSERT INTO generated_logos (user_id, url, prompt, description, variation_type, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
          [userId, logo.url, logo.prompt, logo.description, "variation"]
        );
      }

      await query(
        "UPDATE user_credits SET credits = credits - $1, updated_at = NOW() WHERE user_id = $2",
        [cost, userId]
      );

      return sendSuccess(res, { message: "Aqui estão as variações do seu logo!", logos });
    }

    if (action && action !== "chat") {
      return sendError(res, 400, "Ação inválida");
    }

    if (creditRows[0].credits < 2) {
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
      flattenProfile(profile),
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

    await query(
      "UPDATE user_credits SET credits = credits - 2, updated_at = NOW() WHERE user_id = $1",
      [userId]
    );

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
