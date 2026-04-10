import express from "express";
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
  executarAgente,
  renderBusinessPrompt,
  safeParseJSON,
  validateWithAgent,
} from "./ai.js";

const app = express();

/* =========================
   🔥 CORS ULTRA PROFISSIONAL
========================= */

const ALLOWED_ORIGINS = [
  "https://infusion-ia.vercel.app",
  "http://localhost:3000",
];

function isAllowedOrigin(origin) {
  if (!origin) return false;

  if (ALLOWED_ORIGINS.includes(origin)) return true;

  // permite previews da Vercel
  if (origin.endsWith(".vercel.app")) {
    return true;
  }

  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  console.log(`[CORS] ${req.method} ${req.path} | Origin: ${origin}`);

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

/* ========================= */

app.use(express.json({ limit: "5mb" }));

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

function sendSuccess(res, data = {}, status = 200) {
  res.status(status).json({ success: true, ...data });
}

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

const DEFAULT_FREE_CREDITS = 100;
const CREDIT_COSTS = {
  text: 5,
  image: 15,
};

const PLAN_CATALOG = {
  monthly: [
    {
      id: "aprendiz_mensal",
      name: "Aprendiz",
      oldPrice: 129,
      price: 89,
      credits: 100,
      highlight: false,
    },
    {
      id: "avancado_mensal",
      name: "Avançado",
      oldPrice: 239,
      price: 149,
      credits: 250,
      highlight: true,
    },
    {
      id: "profissional_mensal",
      name: "Profissional",
      oldPrice: 499,
      price: 299,
      credits: 1000,
      highlight: false,
    },
  ],
  annual: [
    {
      id: "aprendiz_anual",
      name: "Aprendiz",
      oldPrice: 1079,
      price: 988,
      benefit: "Ganhe 1 mês grátis",
      highlight: false,
    },
    {
      id: "avancado_anual",
      name: "Avançado",
      oldPrice: 1799,
      price: 1649,
      benefit: "Ganhe 1 mês grátis",
      highlight: true,
    },
    {
      id: "profissional_anual",
      name: "Profissional",
      oldPrice: 3588,
      price: 2990,
      benefit: "Ganhe 2 meses grátis",
      highlight: false,
    },
  ],
};

function buildPlanRows() {
  const monthly = PLAN_CATALOG.monthly.map((plan) => ({
    id: plan.id,
    name: plan.name,
    billing_cycle: "mensal",
    price: plan.price,
    old_price: plan.oldPrice,
    credits: plan.credits ?? null,
    benefit: plan.benefit ?? null,
    is_popular: Boolean(plan.highlight),
  }));

  const annual = PLAN_CATALOG.annual.map((plan) => ({
    id: plan.id,
    name: plan.name,
    billing_cycle: "anual",
    price: plan.price,
    old_price: plan.oldPrice,
    credits: plan.credits ?? null,
    benefit: plan.benefit ?? null,
    is_popular: Boolean(plan.highlight),
  }));

  return [...monthly, ...annual];
}

async function syncPlanCatalog() {
  try {
    const supabase = getSupabase();
    const rows = buildPlanRows();
    const { error } = await supabase.from("plans").upsert(rows, {
      onConflict: "id",
    });
    if (error) {
      if (isMissingTableError(error)) {
        console.warn("[PLANS] tabela plans inexistente. Crie a tabela para sincronizar.");
        return;
      }
      console.warn("[PLANS] falha ao sincronizar catálogo", error.message);
    } else {
      console.log("[PLANS] catálogo sincronizado");
    }
  } catch (error) {
    console.warn("[PLANS] sincronização ignorada", error?.message || error);
  }
}

function getBearerToken(req) {
  const raw =
    req.headers.authorization ||
    req.headers.Authorization ||
    req.headers["authorization"];

  if (!raw) return null;

  const header = Array.isArray(raw) ? raw.join(" ") : String(raw);
  const match = header.match(/^\s*Bearer\s+(.+)\s*$/i);
  if (!match) return null;

  const token = match[1].trim();
  return token || null;
}

function isUuid(value) {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function logChatDebug(label, req) {
  if (process.env.NODE_ENV === "production" && !process.env.DEBUG_CHAT_LOGS) {
    return;
  }

  const body = req.body || {};
  const safeBody = {
    contentType: req.headers["content-type"] || null,
    bodyType: typeof req.body,
    keys: Object.keys(body),
    contentLength:
      typeof body.content === "string"
        ? body.content.length
        : typeof body.message === "string"
          ? body.message.length
          : typeof body.text === "string"
            ? body.text.length
            : null,
    role: body.role || body.sender || null,
  };

  const safeUser = req.user
    ? {
        id: req.user.id,
        email: req.user.email ? "[redacted]" : null,
      }
    : null;

  console.log(`[CHAT-DEBUG] ${label}`, {
    params: req.params,
    body: safeBody,
    user: safeUser,
  });
}

function normalizeChatMessages(messages, lastMessageOverride) {
  const raw = Array.isArray(messages) ? messages : [];
  const normalized = raw
    .map((m) => ({
      role: m?.role,
      content: typeof m?.content === "string" ? m.content : null,
    }))
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content);

  if (typeof lastMessageOverride === "string" && lastMessageOverride.trim()) {
    const override = lastMessageOverride.trim();
    for (let i = normalized.length - 1; i >= 0; i -= 1) {
      if (normalized[i].role === "user") {
        normalized[i] = { ...normalized[i], content: override };
        return normalized;
      }
    }
    normalized.push({ role: "user", content: override });
  }

  return normalized;
}

async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return sendError(res, 401, "Token ausente.");
    }

    const supabase = getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return sendError(res, 401, "Token inválido ou expirado.");
    }

    req.user = user;
    return next();
  } catch (err) {
    console.error("[AUTH]", err);
    return sendError(res, 401, "Falha na autenticação.");
  }
}

async function ensureCreditsRow(supabase, userId) {
  const { data, error } = await supabase
    .from("user_credits")
    .select("credits, plan")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: created, error: insertError } = await supabase
      .from("user_credits")
      .insert({ user_id: userId, credits: DEFAULT_FREE_CREDITS, plan: "free" })
      .select("credits, plan")
      .single();
    if (insertError) throw insertError;
    return created;
  }

  return data;
}

async function consumeCredits({ supabase, userId, amount, reason }) {
  const attempts = 2;
  for (let i = 0; i < attempts; i += 1) {
    const current = await ensureCreditsRow(supabase, userId);
    const available = Number(current.credits || 0);

    if (available < amount) {
      return { ok: false, credits: available, plan: current.plan || "free" };
    }

    const next = available - amount;
    const { data, error } = await supabase
      .from("user_credits")
      .update({ credits: next })
      .eq("user_id", userId)
      .eq("credits", available)
      .select("credits, plan")
      .maybeSingle();

    if (error) throw error;

    if (data) {
      console.log(
        `[CREDITS] consumo=${amount} user=${userId} reason=${reason} restante=${data.credits}`
      );
      return { ok: true, credits: data.credits, plan: data.plan || "free" };
    }
  }

  const refreshed = await ensureCreditsRow(supabase, userId);
  return {
    ok: Number(refreshed.credits || 0) >= amount,
    credits: Number(refreshed.credits || 0),
    plan: refreshed.plan || "free",
  };
}

function sendInsufficientCredits(res, credits) {
  res.status(402).json({
    error: "Créditos insuficientes.",
    credits,
  });
}

const CHAT_MESSAGES_TABLES = ["chat_messages", "chat_conversation_messages"];

function isMissingTableError(error) {
  const message = (error?.message || "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("not exist") ||
    message.includes("schema cache") ||
    message.includes("relation")
  );
}

function isMissingColumnError(error) {
  const message = (error?.message || "").toLowerCase();
  return message.includes("column") && message.includes("does not exist");
}

function buildPlaceholderImage(label = "Imagem") {
  const safeLabel = String(label || "Imagem").slice(0, 40);
  const svg = [
    "<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'>",
    "<defs>",
    "<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>",
    "<stop offset='0%' stop-color='#f2f2f2'/>",
    "<stop offset='100%' stop-color='#d9d9d9'/>",
    "</linearGradient>",
    "</defs>",
    "<rect width='1024' height='1024' fill='url(#g)'/>",
    "<rect x='40' y='40' width='944' height='944' rx='48' fill='white' stroke='#cccccc'/>",
    `<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='48' font-family='Arial' fill='#444'>${safeLabel}</text>`,
    "</svg>",
  ].join("");
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function withMessagesTable(handler) {
  let lastError = null;
  for (const table of CHAT_MESSAGES_TABLES) {
    const { data, error } = await handler(table);
    if (!error) return { data, table };
    lastError = error;
    if (!isMissingTableError(error)) {
      return { error };
    }
  }
  return { error: lastError };
}

/* ========================= ROUTES ========================= */

const router = express.Router();

router.get("/health", (_req, res) => {
  sendSuccess(res, { ok: true });
});

router.get("/cors-test", (_req, res) => {
  res.json({ ok: true });
});

router.get("/plans", (_req, res) => {
  sendSuccess(res, {
    monthly: PLAN_CATALOG.monthly,
    annual: PLAN_CATALOG.annual,
    credit_costs: CREDIT_COSTS,
  });
});

/* -------- PROFILE -------- */

router.get("/profile", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return sendSuccess(res, { profile: null });
      }
      throw error;
    }

    return sendSuccess(res, { profile: data ?? null });
  } catch (error) {
    console.error("[PROFILE GET]", error);
    return sendError(res, 500, "Erro ao carregar perfil.");
  }
});

router.put("/profile", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const updates = req.body || {};

    const { data, error } = await supabase
      .from("business_profiles")
      .upsert(
        {
          user_id: req.user.id,
          ...updates,
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .single();

    if (error) throw error;

    return sendSuccess(res, { profile: data });
  } catch (error) {
    console.error("[PROFILE PUT]", error);
    return sendError(res, 500, "Erro ao salvar perfil.");
  }
});
/* -------- CREDITS -------- */

router.get("/credits", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const data = await ensureCreditsRow(supabase, req.user.id);
    return sendSuccess(res, data);
  } catch (error) {
    console.error("[CREDITS]", error);
    return sendError(res, 500, "Erro ao carregar créditos.");
  }
});

/* -------- DASHBOARD -------- */

router.get("/dashboard-stats", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();

    const [posts, images, logos, credits] = await Promise.all([
      supabase.from("generated_posts").select("id", { count: "exact", head: true }).eq("user_id", req.user.id),
      supabase.from("generated_images").select("id", { count: "exact", head: true }).eq("user_id", req.user.id),
      supabase.from("generated_logos").select("id", { count: "exact", head: true }).eq("user_id", req.user.id),
      supabase.from("user_credits").select("credits").eq("user_id", req.user.id).maybeSingle(),
    ]);

    return sendSuccess(res, {
      posts_generated: posts.count ?? 0,
      images_generated: images.count ?? 0,
      logos_generated: logos.count ?? 0,
      credits: credits.data?.credits ?? 0,
    });
  } catch (error) {
    console.error("[DASHBOARD]", error);
    return sendError(res, 500, "Erro ao carregar resumo.");
  }
});

/* -------- GENERATED IMAGES -------- */

router.get("/generated-images", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("generated_images")
      .select("id, url, prompt, optimized_prompt, negative_prompt, quality, created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(24);

    if (error) {
      if (isMissingTableError(error)) {
        return sendSuccess(res, { images: [] });
      }
      throw error;
    }

    return sendSuccess(res, { images: data || [] });
  } catch (error) {
    console.error("[GENERATED-IMAGES]", error);
    return sendError(res, 500, "Erro ao carregar imagens.");
  }
});

/* -------- CHAT -------- */

router.get("/chat/conversations", requireAuth, async (req, res) => {
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
    console.error("[CHAT]", error);
    return sendError(res, 500, "Erro ao carregar conversas.");
  }
});

router.post("/chat/conversations", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { title } = req.body || {};
    const payload = {
      user_id: req.user.id,
      title: typeof title === "string" && title.trim() ? title.trim() : null,
    };

    const { data, error } = await supabase
      .from("chat_conversations")
      .insert(payload)
      .select("id")
      .single();

    if (error) throw error;

    return res.status(201).json({ id: data.id });
  } catch (error) {
    console.error("[CHAT] create conversation", error);
    return sendError(res, 500, "Erro ao criar conversa.");
  }
});

router.get("/chat/conversations/:id/messages", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    logChatDebug("GET messages", req);

    if (!isUuid(id)) {
      return sendError(res, 400, "conversation_id inválido");
    }

    const supabase = getSupabase();

    const { data: convo, error: convoError } = await supabase
      .from("chat_conversations")
      .select("id")
      .eq("id", id)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (convoError) throw convoError;
    if (!convo) return sendError(res, 404, "Conversa não encontrada.");

    const result = await withMessagesTable((table) =>
      supabase
        .from(table)
        .select("id, role, content, created_at")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true })
    );

    if (result.error) {
      if (isMissingTableError(result.error)) {
        console.warn("[CHAT] tabela de mensagens não encontrada");
        return sendSuccess(res, { messages: [] });
      }
      throw result.error;
    }

    return sendSuccess(res, { messages: result.data || [] });
  } catch (error) {
    console.error("[CHAT] list messages", error);
    return sendError(res, 500, "Erro ao carregar mensagens.");
  }
});

router.post("/chat/conversations/:id/messages", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    logChatDebug("POST messages", req);

    if (!req.user) {
      logChatDebug("POST messages missing user", req);
      return sendError(res, 401, "Usuário não autenticado.");
    }

    if (!isUuid(id)) {
      return sendError(res, 400, "conversation_id inválido");
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        logChatDebug("POST messages invalid json", req);
        return sendError(res, 400, "payload inválido");
      }
    }

    if (!body || typeof body !== "object") {
      logChatDebug("POST messages missing body", req);
      return sendError(res, 400, "payload inválido");
    }

    const content =
      typeof body.content === "string"
        ? body.content
        : typeof body.message === "string"
          ? body.message
          : typeof body.text === "string"
            ? body.text
            : null;
    const role = body.role || body.sender || (content ? "user" : null);

    if (role !== "user" && role !== "assistant" && role !== "system") {
      return sendError(res, 400, "role inválido");
    }
    if (!content || typeof content !== "string") {
      return sendError(res, 400, "content inválido");
    }

    const supabase = getSupabase();
    const { data: convo, error: convoError } = await supabase
      .from("chat_conversations")
      .select("id")
      .eq("id", id)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (convoError) throw convoError;
    if (!convo) return sendError(res, 404, "Conversa não encontrada.");

    const insertWithUser = (table) =>
      supabase
        .from(table)
        .insert({
          conversation_id: id,
          role,
          content,
          user_id: req.user.id,
        })
        .select("id")
        .single();

    const insertWithoutUser = (table) =>
      supabase
        .from(table)
        .insert({
          conversation_id: id,
          role,
          content,
        })
        .select("id")
        .single();

    let result = await withMessagesTable(insertWithUser);
    if (result.error && isMissingColumnError(result.error)) {
      result = await withMessagesTable(insertWithoutUser);
    }

    if (result.error) {
      if (isMissingTableError(result.error)) {
        return sendError(res, 503, "Mensagens indisponíveis no momento.");
      }
      throw result.error;
    }

    return res.status(201).json({ id: result.data?.id || null });
  } catch (error) {
    console.error("[CHAT] add message", error);
    return sendError(res, 500, "Erro ao salvar mensagem.");
  }
});

/* -------- AI CHAT -------- */

router.post("/ai-chat", requireAuth, async (req, res) => {
  try {
    let body = req.body || {};
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const { messages, stream, lastMessageOverride } = body || {};
    let normalizedMessages = normalizeChatMessages(messages, lastMessageOverride);

    if (!normalizedMessages.length) {
      const fallbackContent =
        typeof body?.message === "string"
          ? body.message
          : typeof body?.content === "string"
            ? body.content
            : null;
      if (fallbackContent) {
        normalizedMessages = [{ role: "user", content: fallbackContent.trim() }];
      }
    }

    if (!normalizedMessages.length) {
      return sendError(res, 400, "messages required");
    }

    const supabase = getSupabase();
    const creditResult = await consumeCredits({
      supabase,
      userId: req.user.id,
      amount: CREDIT_COSTS.text,
      reason: "ai-chat",
    });

    if (!creditResult.ok) {
      return sendInsufficientCredits(res, creditResult.credits);
    }

    let profile = null;
    try {
      const { data } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("user_id", req.user.id)
        .maybeSingle();
      profile = data || null;
    } catch (error) {
      console.warn("[AI-CHAT] perfil indisponivel", error?.message || error);
    }

    const systemPrompt = renderBusinessPrompt(
      AGENTE_1_CONSULTOR_MARKETING,
      profile,
      null
    );

    const text = await executarAgente({
      agente: "AGENTE_1_CONSULTOR_MARKETING",
      systemPrompt,
      messages: normalizedMessages,
    });

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      const chunks = text.match(/.{1,120}/g) || [""];
      for (const chunk of chunks) {
        const payload = {
          choices: [{ delta: { content: chunk } }],
        };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    return sendSuccess(res, {
      choices: [{ message: { role: "assistant", content: text } }],
      credits: creditResult.credits,
    });
  } catch (error) {
    console.error("[AI-CHAT]", error);
    return sendError(res, 500, "Erro interno");
  }
});

/* -------- LOGO GENERATOR -------- */

router.post("/logo-generator", requireAuth, async (req, res) => {
  try {
    let body = req.body || {};
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const { messages, action, selectedPrompt } = body || {};
    let normalizedMessages = normalizeChatMessages(messages);

    if (!normalizedMessages.length) {
      return sendError(res, 400, "messages required");
    }

    if (selectedPrompt && typeof selectedPrompt === "string") {
      normalizedMessages = [
        ...normalizedMessages,
        {
          role: "user",
          content: `Crie variações com base neste prompt: ${selectedPrompt}`,
        },
      ];
    }

    const supabase = getSupabase();
    const creditResult = await consumeCredits({
      supabase,
      userId: req.user.id,
      amount: CREDIT_COSTS.image,
      reason: `logo-${action || "generator"}`,
    });

    if (!creditResult.ok) {
      return sendInsufficientCredits(res, creditResult.credits);
    }

    const assistantMessage = await executarAgente({
      agente: "AGENTE_2_DESIGNER_LOGO",
      systemPrompt: AGENTE_2_DESIGNER_LOGO,
      messages: normalizedMessages,
      maxTokens: 1200,
      temperature: 0.7,
      debugTag: "logo-generator",
    });

    const promptResponse = await executarAgente({
      agente: "AGENTE_LOGO_PROMPT_BUILDER",
      systemPrompt: AGENTE_LOGO_PROMPT_BUILDER,
      messages: normalizedMessages,
      requireJson: true,
      maxTokens: 1200,
      temperature: 0.6,
      debugTag: "logo-prompts",
    });

    const parsed = safeParseJSON(promptResponse, null);
    const prompts = Array.isArray(parsed?.prompts) ? parsed.prompts : [];
    const descriptions = Array.isArray(parsed?.descriptions) ? parsed.descriptions : [];
    const logos = prompts.slice(0, 3).map((prompt, index) => ({
      url: buildPlaceholderImage(`Logo ${index + 1}`),
      description: descriptions[index] || "",
      prompt,
    }));

    if (logos.length) {
      try {
        const insertPayload = logos.map((logo) => ({
          user_id: req.user.id,
          url: logo.url,
          prompt: logo.prompt,
          description: logo.description,
        }));
        const { error } = await supabase.from("generated_logos").insert(insertPayload);
        if (error && !isMissingTableError(error) && !isMissingColumnError(error)) {
          console.warn("[LOGO] falha ao salvar", error.message);
        }
      } catch (error) {
        console.warn("[LOGO] persistencia ignorada", error?.message || error);
      }
    }

    return res.json({
      message: assistantMessage,
      logos,
      credits: creditResult.credits,
    });
  } catch (error) {
    console.error("[LOGO]", error);
    return sendError(res, 500, "Erro ao gerar logo.");
  }
});

/* -------- GENERATE TEXT -------- */

router.post("/generate-text", requireAuth, async (req, res) => {
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

    if (!tipo_conteudo || !descricao) {
      return sendError(res, 400, "tipo_conteudo e descricao são obrigatórios");
    }

    const supabase = getSupabase();
    const creditResult = await consumeCredits({
      supabase,
      userId: req.user.id,
      amount: CREDIT_COSTS.text,
      reason: "generate-text",
    });

    if (!creditResult.ok) {
      return sendInsufficientCredits(res, creditResult.credits);
    }

    const refinement = variation
      ? "Gere uma variação criativa do texto."
      : refine_notes
        ? `Refine com base nas notas: ${refine_notes}`
        : "";

    const basePrompt = [
      `Tipo de conteúdo: ${tipo_conteudo}`,
      `Descrição: ${descricao}`,
      publico_alvo ? `Público-alvo: ${publico_alvo}` : null,
      tom_voz ? `Tom de voz: ${tom_voz}` : null,
      previous_text ? `Texto anterior: ${previous_text}` : null,
      refinement || null,
    ]
      .filter(Boolean)
      .join("\n");

    const text = await executarAgente({
      agente: "AGENTE_6_GERADOR_TEXTO",
      systemPrompt: AGENTE_6_GERADOR_TEXTO,
      messages: [{ role: "user", content: basePrompt }],
      requireJson: true,
      temperature: 0.7,
      maxTokens: 1200,
      preferHighQuality: true,
      debugTag: "generate-text",
    });

    console.log("[AI RAW RESPONSE]", text);

    let parsed = safeParseJSON(text, null);

    if (!parsed || typeof parsed !== "object") {
      parsed = {
        texto: typeof text === "string" ? text : "",
        sugestoes: [],
        prompt: null,
      };
    }

    return sendSuccess(res, { ...parsed, credits: creditResult.credits });
  } catch (error) {
    console.error("[GENERATE-TEXT]", error);
    return sendError(res, 500, "Erro ao gerar texto.");
  }
});

/* -------- GENERATE POSTS -------- */

router.post("/generate-posts", requireAuth, async (req, res) => {
  try {
    const { objetivo, tipo_conteudo, canal, brief, channels } = req.body || {};

    if (!objetivo || !tipo_conteudo) {
      return sendError(res, 400, "objetivo e tipo_conteudo são obrigatórios");
    }

    const supabase = getSupabase();
    const creditResult = await consumeCredits({
      supabase,
      userId: req.user.id,
      amount: CREDIT_COSTS.text,
      reason: "generate-posts",
    });

    if (!creditResult.ok) {
      return sendInsufficientCredits(res, creditResult.credits);
    }

    const payload = [
      `Objetivo: ${objetivo}`,
      `Tipo de conteúdo: ${tipo_conteudo}`,
      canal ? `Canal: ${canal}` : null,
      channels?.length ? `Canais: ${channels.join(", ")}` : null,
      brief ? `Brief: ${brief}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await executarAgente({
      agente: "AGENTE_3_GERADOR_POSTS",
      systemPrompt: AGENTE_3_GERADOR_POSTS,
      messages: [{ role: "user", content: payload }],
      requireJson: true,
      temperature: 0.7,
      maxTokens: 1400,
      preferHighQuality: true,
      debugTag: "generate-posts",
    });

    const parsed = safeParseJSON(response, { posts: [] });
    return sendSuccess(res, { ...parsed, credits: creditResult.credits });
  } catch (error) {
    console.error("[GENERATE-POSTS]", error);
    return sendError(res, 500, "Erro ao gerar posts.");
  }
});

/* -------- GENERATE POST PROMPT -------- */

router.post("/generate-post-prompt", requireAuth, async (req, res) => {
  try {
    const {
      tipo_post,
      descricao,
      formato,
      estilo,
      incluir_espaco_logo,
      logo_presente,
    } = req.body || {};

    if (!tipo_post || !descricao || !formato || !estilo) {
      return sendError(res, 400, "Dados insuficientes para gerar o prompt.");
    }

    const prompt = [
      `Tipo de post: ${tipo_post}`,
      `Descrição: ${descricao}`,
      `Formato: ${formato}`,
      `Estilo visual: ${estilo}`,
      `Incluir espaço para logo: ${incluir_espaco_logo ? "Sim" : "Não"}`,
      `Logo presente: ${logo_presente ? "Sim" : "Não"}`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await executarAgente({
      agente: "AGENTE_7_GERADOR_POSTS_IMAGEM",
      systemPrompt: AGENTE_7_GERADOR_POSTS_IMAGEM,
      messages: [{ role: "user", content: prompt }],
      requireJson: true,
      temperature: 0.6,
      maxTokens: 1200,
      preferHighQuality: true,
      debugTag: "generate-post-prompt",
    });

    const parsed = safeParseJSON(response, {
      prompt: "",
      perguntas: [],
      observacoes: "",
    });

    return sendSuccess(res, parsed);
  } catch (error) {
    console.error("[POST-PROMPT]", error);
    return sendError(res, 500, "Erro ao gerar prompt do post.");
  }
});

/* -------- GENERATE IMAGE -------- */

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

router.post("/generate-image", requireAuth, async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return sendError(res, 400, "prompt required");

    const supabase = getSupabase();

    // 💳 Consumo de créditos
    const creditResult = await consumeCredits({
      supabase,
      userId: req.user.id,
      amount: CREDIT_COSTS.image,
      reason: "generate-image",
    });

    if (!creditResult.ok) {
      return sendInsufficientCredits(res, creditResult.credits);
    }

    console.log("[IMAGE] Gerando imagem com prompt:", prompt);

    // 🎨 Gerar imagem
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
    });

    console.log("[IMAGE RAW RESPONSE]", JSON.stringify(result, null, 2));

    const imageBase64 = result.data?.[0]?.b64_json;

    if (!imageBase64) {
      throw new Error("Imagem não retornada pela IA");
    }

    // 🔄 Converter base64 → buffer
    const buffer = Buffer.from(imageBase64, "base64");

    // 🧠 Nome único do arquivo
    const fileName = `${req.user.id}/${Date.now()}.png`;

    // ☁️ Upload no Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("generated-images")
      .upload(fileName, buffer, {
        contentType: "image/png",
      });

    if (uploadError) {
      console.error("[IMAGE UPLOAD ERROR]", uploadError);
      throw uploadError;
    }

    // 🌐 URL pública
    const { data: publicUrlData } = supabase.storage
      .from("generated-images")
      .getPublicUrl(fileName);

    const imageUrl = publicUrlData.publicUrl;

    console.log("[IMAGE URL]", imageUrl);

    // 💾 Salvar no banco
    try {
      const { error } = await supabase.from("generated_images").insert({
        user_id: req.user.id,
        url: imageUrl,
        prompt,
        optimized_prompt: null,
        negative_prompt: null,
        quality: "standard",
      });

      if (
        error &&
        !isMissingTableError(error) &&
        !isMissingColumnError(error)
      ) {
        console.warn("[IMAGE] falha ao salvar", error.message);
      }
    } catch (error) {
      console.warn("[IMAGE] persistencia ignorada", error?.message || error);
    }

    // ✅ Resposta final
    return sendSuccess(res, {
      images: [{ url: imageUrl }],
      credits: creditResult.credits,
    });

  } catch (error) {
    console.error("[IMAGE ERROR]", error);
    return sendError(res, 500, "Erro ao gerar imagem");
  }
});

/* -------- ROTAS -------- */

app.use("/api", router);

const LEGACY_ROUTE_PREFIXES = [
  "/health",
  "/cors-test",
  "/plans",
  "/profile",
  "/credits",
  "/dashboard-stats",
  "/generated-images",
  "/chat",
  "/ai-chat",
  "/generate-text",
  "/generate-posts",
  "/generate-post-prompt",
  "/generate-image",
  "/logo-generator",
];

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();

  const shouldRedirect = LEGACY_ROUTE_PREFIXES.some(
    (prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`)
  );

  if (!shouldRedirect) return next();

  return res.redirect(307, `/api${req.path}`);
});

app.use((req, res) => {
  console.log("❌ 404:", req.method, req.originalUrl);
  res.status(404).json({ error: "Not found" });
});
/* -------- ERROR HANDLER -------- */

app.use((err, req, res, _next) => {
  console.error("[GLOBAL ERROR]", err);

  res.setHeader("Access-Control-Allow-Credentials", "true");

  res.status(500).json({
    error: "Internal server error",
    message: err?.message || "Unexpected error",
  });
});

/* -------- START -------- */

const port = Number(process.env.PORT || 10000);


app.listen(port, () => {
  console.log(`🚀 Backend rodando na porta ${port}`);
});

(async () => {
  try {
    await syncPlanCatalog();
    console.log(" Planos sincronizados");
  } catch (err) {
    console.error(" Falha ao sincronizar planos:", err);
  }
})();
