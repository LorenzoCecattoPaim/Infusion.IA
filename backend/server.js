import express from "express";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  AGENTE_1_CONSULTOR_MARKETING,
  AGENTE_2_DESIGNER_LOGO,
  AGENTE_3_GERADOR_POSTS,
  AGENTE_4_OTIMIZADOR_PROMPT,
  AGENTE_6_GERADOR_TEXTO,
  AGENTE_7_GERADOR_POSTS_IMAGEM,
  AGENTE_LOGO_PROMPT_BUILDER,
  AGENTE_LOGO_READY_CHECK,
  executarAgente,
  renderBusinessPrompt,
  safeParseJSON,
  validateWithAgent,
} from "./ai.js";
import { buildImagePrompt } from "./lib/imagePromptBuilder.js";
import OpenAI from "openai";
import {
  ensureCreditsRow,
  consumeCredits,
} from "./src/payments/credits.service.js";
import { InfinitePayGateway } from "./src/payments/infinitepay.gateway.js";
import {
  createPayment,
  getPaymentStatus,
  processWebhook,
  verifyPayment,
  retryPayment,
} from "./src/payments/payment.service.js";
import { createInfinitePayWebhookHandler } from "./src/payments/webhook.controller.js";
import { buildRequireAuth } from "./src/auth/auth.middleware.js";
import { loadProjectEnv } from "./src/config/env.js";
import { toFile } from "openai";

loadProjectEnv();

const app = express();
app.set("trust proxy", 1);

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
  if (origin.endsWith(".vercel.app")) return true;
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
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use("/api/webhook/infinitepay", express.raw({ type: "*/*" }));
app.use(express.json({ limit: "10mb" }));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;
const INFINITEPAY_HANDLE = process.env.INFINITEPAY_HANDLE;
const INFINITEPAY_BASE_URL = process.env.INFINITEPAY_BASE_URL;
const INFINITEPAY_WEBHOOK_SECRET = process.env.INFINITEPAY_WEBHOOK_SECRET;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL e SERVICE_ROLE_KEY são obrigatórios");
}

if (!INFINITEPAY_HANDLE || !INFINITEPAY_BASE_URL || !INFINITEPAY_WEBHOOK_SECRET) {
  throw new Error(
    "INFINITEPAY_HANDLE, INFINITEPAY_BASE_URL e INFINITEPAY_WEBHOOK_SECRET são obrigatórios"
  );
}

function getSupabase() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getBaseUrl(req) {
  const explicit = process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

function sendSuccess(res, data = {}, status = 200) {
  res.status(status).json({ success: true, ...data });
}

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

const CREDIT_COSTS = {
  text: 5,
  image: 15,
};
const AI_TIMEOUT_MS = 30000; // aumentado para edição de imagem que é mais lenta
const AI_TIMEOUT_USER_MESSAGE =
  "A IA está demorando mais do que o esperado. Tente novamente em instantes.";

const PLAN_CATALOG = {
  monthly: [
    { id: "aprendiz_mensal", name: "Aprendiz", oldPrice: 129, price: 89, credits: 100, highlight: false },
    { id: "avancado_mensal", name: "Avançado", oldPrice: 239, price: 149, credits: 250, highlight: true },
    { id: "profissional_mensal", name: "Profissional", oldPrice: 499, price: 299, credits: 1000, highlight: false },
  ],
  annual: [
    { id: "aprendiz_anual", name: "Aprendiz", oldPrice: 1079, price: 988, benefit: "Ganhe 1 mês grátis", highlight: false },
    { id: "avancado_anual", name: "Avançado", oldPrice: 1799, price: 1649, benefit: "Ganhe 1 mês grátis", highlight: true },
    { id: "profissional_anual", name: "Profissional", oldPrice: 3588, price: 2990, benefit: "Ganhe 2 meses grátis", highlight: false },
  ],
};

const infinitePayGateway = new InfinitePayGateway({
  baseUrl: INFINITEPAY_BASE_URL,
  handle: INFINITEPAY_HANDLE,
  webhookSecret: INFINITEPAY_WEBHOOK_SECRET,
  timeoutMs: 10000,
});

const infinitePayWebhookHandler = createInfinitePayWebhookHandler({
  webhookSecret: INFINITEPAY_WEBHOOK_SECRET,
  getSupabase,
  processWebhook,
  gatewayProvider: infinitePayGateway,
});

const requireAuth = buildRequireAuth({ getSupabase, sendError });

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
    const { error } = await supabase.from("plans").upsert(rows, { onConflict: "id" });
    if (error) {
      if (isMissingTableError(error)) {
        console.warn("[PLANS] tabela plans inexistente.");
        return false;
      }
      console.warn("[PLANS] falha ao sincronizar catálogo", error.message);
      return false;
    } else {
      console.log("[PLANS] catálogo sincronizado");
      return true;
    }
  } catch (error) {
    console.warn("[PLANS] sincronização ignorada", error?.message || error);
    return false;
  }
}

function isUuid(value) {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function logChatDebug(label, req) {
  if (process.env.NODE_ENV === "production" && !process.env.DEBUG_CHAT_LOGS) return;
  const body = req.body || {};
  const safeBody = {
    contentType: req.headers["content-type"] || null,
    bodyType: typeof req.body,
    keys: Object.keys(body),
    contentLength:
      typeof body.content === "string" ? body.content.length :
      typeof body.message === "string" ? body.message.length :
      typeof body.text === "string" ? body.text.length : null,
    role: body.role || body.sender || null,
  };
  const safeUser = req.user ? { id: req.user.id, email: req.user.email ? "[redacted]" : null } : null;
  console.log(`[CHAT-DEBUG] ${label}`, { params: req.params, body: safeBody, user: safeUser });
}

function normalizeChatMessages(messages, lastMessageOverride) {
  const raw = Array.isArray(messages) ? messages : [];
  const normalized = raw
    .map((m) => ({ role: m?.role, content: typeof m?.content === "string" ? m.content : null }))
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

function sendInsufficientCredits(res, credits) {
  res.status(402).json({ error: "Créditos insuficientes.", credits });
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

async function loadBusinessProfile(supabase, userId) {
  if (!userId) return null;
  try {
    const { data } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return data || null;
  } catch (error) {
    console.warn("[PROFILE] perfil indisponivel", error?.message || error);
    return null;
  }
}

function buildPlaceholderImage(label = "Imagem") {
  const safeLabel = String(label || "Imagem").slice(0, 40);
  const svg = [
    "<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'>",
    "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>",
    "<stop offset='0%' stop-color='#f2f2f2'/>",
    "<stop offset='100%' stop-color='#d9d9d9'/>",
    "</linearGradient></defs>",
    "<rect width='1024' height='1024' fill='url(#g)'/>",
    "<rect x='40' y='40' width='944' height='944' rx='48' fill='white' stroke='#cccccc'/>",
    `<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='48' font-family='Arial' fill='#444'>${safeLabel}</text>`,
    "</svg>",
  ].join("");
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function isAiTimeoutError(error) {
  return error?.code === "AI_TIMEOUT" || error?.message === "AI_TIMEOUT";
}

/* ─────────────────────────────────────────
   🖼️  HELPERS DE IMAGEM
───────────────────────────────────────── */

/**
 * Converte uma data URL base64 em um objeto File compatível com a SDK da OpenAI.
 * Funciona para PNG, JPEG e WEBP.
 */
async function dataUrlToOpenAIFile(dataUrl, filename = "image.png") {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error("dataUrl inválida");
  const mimeType = match[1];
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, "base64");
  return await toFile(buffer, filename, { type: mimeType });
}

/**
 * Gera imagem usando /images/generate (sem imagem de referência).
 */
async function generateImageWithTimeout(params) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    return await openai.images.generate(params, { signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("AI_TIMEOUT");
      timeoutError.code = "AI_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Edita/transforma imagem usando /images/edit (com imagem de referência).
 * Aceita product_image e/ou logo_image como base64 data URLs.
 */
async function editImageWithTimeout({ prompt, productImageDataUrl, logoImageDataUrl }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    // A API de edição aceita um array de imagens de referência
    const imageFiles = [];

    if (productImageDataUrl) {
      console.log("[IMAGE EDIT] Usando imagem do produto como referência");
      imageFiles.push(await dataUrlToOpenAIFile(productImageDataUrl, "product.png"));
    }

    if (logoImageDataUrl) {
      console.log("[IMAGE EDIT] Usando logo como referência");
      imageFiles.push(await dataUrlToOpenAIFile(logoImageDataUrl, "logo.png"));
    }

    // Se só há uma imagem, passa diretamente; se há múltiplas, passa array
    const imageParam = imageFiles.length === 1 ? imageFiles[0] : imageFiles;

    return await openai.images.edit(
      {
        model: "gpt-image-1",
        image: imageParam,
        prompt,
        size: "1024x1024",
      },
      { signal: controller.signal }
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("AI_TIMEOUT");
      timeoutError.code = "AI_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function withMessagesTable(handler) {
  let lastError = null;
  for (const table of CHAT_MESSAGES_TABLES) {
    const { data, error } = await handler(table);
    if (!error) return { data, table };
    lastError = error;
    if (!isMissingTableError(error)) return { error };
  }
  return { error: lastError };
}

/* ========================= ROUTES ========================= */

const router = express.Router();

router.get("/health", (_req, res) => sendSuccess(res, { ok: true }));
router.get("/cors-test", (_req, res) => res.json({ ok: true }));
router.get("/plans", (_req, res) =>
  sendSuccess(res, {
    monthly: PLAN_CATALOG.monthly,
    annual: PLAN_CATALOG.annual,
    credit_costs: CREDIT_COSTS,
  })
);

/* -------- WEBHOOKS -------- */
router.post("/webhook/infinitepay", infinitePayWebhookHandler);

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
      if (isMissingTableError(error)) return sendSuccess(res, { profile: null });
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
      .upsert({ user_id: req.user.id, ...updates }, { onConflict: "user_id" })
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

/* -------- PAYMENTS -------- */

router.post("/payments/create", requireAuth, async (req, res) => {
  try {
    const { credits, amount_cents, customer } = req.body || {};
    const parsedCredits = Number(credits);
    const parsedAmount = Number(amount_cents);
    if (!Number.isFinite(parsedCredits) || parsedCredits <= 0) return sendError(res, 400, "credits inválido");
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return sendError(res, 400, "amount_cents inválido");
    const supabase = getSupabase();
    const baseUrl = getBaseUrl(req);
    const result = await createPayment({
      supabase,
      gatewayProvider: infinitePayGateway,
      userId: req.user.id,
      credits: Math.trunc(parsedCredits),
      amountCents: Math.trunc(parsedAmount),
      customer: customer || null,
      appBaseUrl: baseUrl,
    });
    return res.status(201).json({
      payment_url: result.paymentUrl,
      order_id: result.orderId,
      status: result.status,
    });
  } catch (error) {
    console.error("[PAYMENTS] create", error);
    return sendError(res, 500, "Erro ao criar pagamento.");
  }
});

router.get("/payments/:id/status", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, 400, "order_id inválido");
    const supabase = getSupabase();
    const status = await getPaymentStatus({ supabase, orderId: id, userId: req.user.id });
    if (!status) return sendError(res, 404, "Pedido não encontrado.");
    return sendSuccess(res, { status });
  } catch (error) {
    console.error("[PAYMENTS] status", error);
    return sendError(res, 500, "Erro ao consultar pagamento.");
  }
});

router.get("/verify-payment/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, 400, "order_nsu inválido");

    const supabase = getSupabase();
    const result = await verifyPayment({
      supabase,
      orderId: id,
      userId: req.user.id,
      query: req.query || {},
      gatewayProvider: infinitePayGateway,
    });

    if (!result) return sendError(res, 404, "Pedido não encontrado.");

    return sendSuccess(res, {
      order_id: result.orderId,
      status: result.status,
      payment_url: result.paymentUrl,
      credits: result.credits,
    });
  } catch (error) {
    console.error("[PAYMENTS] verify", error);
    return sendError(res, 500, "Erro ao verificar pagamento.");
  }
});

router.post("/payments/:id/retry", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, 400, "order_id inválido");
    const supabase = getSupabase();
    const baseUrl = getBaseUrl(req);
    const result = await retryPayment({
      supabase,
      gatewayProvider: infinitePayGateway,
      orderId: id,
      userId: req.user.id,
      appBaseUrl: baseUrl,
    });
    if (!result) return sendError(res, 404, "Pedido não encontrado.");
    return sendSuccess(res, { status: result.status, payment_url: result.paymentUrl });
  } catch (error) {
    console.error("[PAYMENTS] retry", error);
    return sendError(res, 500, "Erro ao recriar pagamento.");
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
      if (isMissingTableError(error)) return sendSuccess(res, { images: [] });
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
    if (!isUuid(id)) return sendError(res, 400, "conversation_id inválido");
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
      if (isMissingTableError(result.error)) return sendSuccess(res, { messages: [] });
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
    if (!req.user) return sendError(res, 401, "Usuário não autenticado.");
    if (!isUuid(id)) return sendError(res, 400, "conversation_id inválido");
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { return sendError(res, 400, "payload inválido"); }
    }
    if (!body || typeof body !== "object") return sendError(res, 400, "payload inválido");
    const content =
      typeof body.content === "string" ? body.content :
      typeof body.message === "string" ? body.message :
      typeof body.text === "string" ? body.text : null;
    const role = body.role || body.sender || (content ? "user" : null);
    if (role !== "user" && role !== "assistant" && role !== "system") return sendError(res, 400, "role inválido");
    if (!content || typeof content !== "string") return sendError(res, 400, "content inválido");
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
      supabase.from(table).insert({ conversation_id: id, role, content, user_id: req.user.id }).select("id").single();
    const insertWithoutUser = (table) =>
      supabase.from(table).insert({ conversation_id: id, role, content }).select("id").single();
    let result = await withMessagesTable(insertWithUser);
    if (result.error && isMissingColumnError(result.error)) {
      result = await withMessagesTable(insertWithoutUser);
    }
    if (result.error) {
      if (isMissingTableError(result.error)) return sendError(res, 503, "Mensagens indisponíveis no momento.");
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
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const { messages, stream, lastMessageOverride } = body || {};
    let normalizedMessages = normalizeChatMessages(messages, lastMessageOverride);
    if (!normalizedMessages.length) {
      const fallbackContent =
        typeof body?.message === "string" ? body.message :
        typeof body?.content === "string" ? body.content : null;
      if (fallbackContent) normalizedMessages = [{ role: "user", content: fallbackContent.trim() }];
    }
    if (!normalizedMessages.length) return sendError(res, 400, "messages required");
    const supabase = getSupabase();
    const [creditResult, profile] = await Promise.all([
      consumeCredits({ supabase, userId: req.user.id, amount: CREDIT_COSTS.text, reason: "ai-chat" }),
      loadBusinessProfile(supabase, req.user.id),
    ]);
    if (!creditResult.ok) return sendInsufficientCredits(res, creditResult.credits);
    const systemPrompt = renderBusinessPrompt(AGENTE_1_CONSULTOR_MARKETING, profile, null);
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
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
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
    return sendError(res, isAiTimeoutError(error) ? 504 : 500, isAiTimeoutError(error) ? AI_TIMEOUT_USER_MESSAGE : "Erro interno");
  }
});

/* -------- LOGO GENERATOR -------- */

router.post("/logo-generator", requireAuth, async (req, res) => {
  try {
    let body = req.body || {};
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const { messages, action, selectedPrompt } = body || {};
    let normalizedMessages = normalizeChatMessages(messages);
    if (!normalizedMessages.length) return sendError(res, 400, "messages required");
    if (selectedPrompt && typeof selectedPrompt === "string") {
      normalizedMessages = [...normalizedMessages, { role: "user", content: `Crie variações com base neste prompt: ${selectedPrompt}` }];
    }
    const supabase = getSupabase();
    const profile = await loadBusinessProfile(supabase, req.user.id);
    const designerPrompt = renderBusinessPrompt(AGENTE_2_DESIGNER_LOGO, profile, null);
    const [assistantMessage, readyCheck] = await Promise.all([
      executarAgente({ agente: "AGENTE_2_DESIGNER_LOGO", systemPrompt: designerPrompt, messages: normalizedMessages, maxTokens: 700, temperature: 0.7, debugTag: "logo-generator" }),
      executarAgente({ agente: "AGENTE_LOGO_READY_CHECK", systemPrompt: AGENTE_LOGO_READY_CHECK, messages: normalizedMessages, requireJson: true, maxTokens: 180, temperature: 0.1, debugTag: "logo-ready-check" }),
    ]);
    const readiness = safeParseJSON(readyCheck, { ready: false, missing: [] });
    const shouldGenerate = action === "generate_logos" || action === "generate_variations" || readiness?.ready === true;
    if (!shouldGenerate) {
      return res.json({ message: assistantMessage, logos: [], phase: "collecting_inputs" });
    }
    const creditResult = await consumeCredits({ supabase, userId: req.user.id, amount: CREDIT_COSTS.image, reason: `logo-${action || "generator"}` });
    if (!creditResult.ok) return sendInsufficientCredits(res, creditResult.credits);
    const promptBuilderPrompt = renderBusinessPrompt(AGENTE_LOGO_PROMPT_BUILDER, profile, null);
    const promptResponse = await executarAgente({
      agente: "AGENTE_LOGO_PROMPT_BUILDER",
      systemPrompt: promptBuilderPrompt,
      messages: normalizedMessages,
      requireJson: true,
      maxTokens: 700,
      temperature: 0.6,
      debugTag: "logo-prompts",
    });
    const parsed = safeParseJSON(promptResponse, null);
    const prompts = Array.isArray(parsed?.prompts) ? parsed.prompts : [];
    const descriptions = Array.isArray(parsed?.descriptions) ? parsed.descriptions : [];
    const promptsToUse = prompts.slice(0, 3);
    const logos = await Promise.all(
      promptsToUse.map(async (rawPrompt, index) => {
        const { optimizedPrompt } = buildImagePrompt({ prompt: rawPrompt, quality: "premium", businessProfile: profile, purpose: "logo" });
        const result = await generateImageWithTimeout({ model: "gpt-image-1", prompt: optimizedPrompt, size: "1024x1024" });
        const imageBase64 = result.data?.[0]?.b64_json;
        const imageUrl = imageBase64 ? `data:image/png;base64,${imageBase64}` : buildPlaceholderImage(`Logo ${index + 1}`);
        return { url: imageUrl, description: descriptions[index] || "", prompt: optimizedPrompt };
      })
    );
    if (logos.length) {
      try {
        const { error } = await supabase.from("generated_logos").insert(logos.map((logo) => ({ user_id: req.user.id, url: logo.url, prompt: logo.prompt, description: logo.description })));
        if (error && !isMissingTableError(error) && !isMissingColumnError(error)) {
          console.warn("[LOGO] falha ao salvar", error.message);
        }
      } catch (error) {
        console.warn("[LOGO] persistencia ignorada", error?.message || error);
      }
    }
    return res.json({ message: assistantMessage, logos, credits: creditResult.credits, phase: "done" });
  } catch (error) {
    console.error("[LOGO]", error);
    return sendError(res, isAiTimeoutError(error) ? 504 : 500, isAiTimeoutError(error) ? AI_TIMEOUT_USER_MESSAGE : "Erro ao gerar logo.");
  }
});

/* -------- GENERATE TEXT -------- */

router.post("/generate-text", requireAuth, async (req, res) => {
  try {
    const { tipo_conteudo, descricao, publico_alvo, tom_voz, variation, refine_notes, previous_text } = req.body || {};
    if (!tipo_conteudo || !descricao) return sendError(res, 400, "tipo_conteudo e descricao são obrigatórios");
    const supabase = getSupabase();
    const [creditResult, profile] = await Promise.all([
      consumeCredits({ supabase, userId: req.user.id, amount: CREDIT_COSTS.text, reason: "generate-text" }),
      loadBusinessProfile(supabase, req.user.id),
    ]);
    if (!creditResult.ok) return sendInsufficientCredits(res, creditResult.credits);
    const refinement = variation ? "Gere uma variação criativa do texto." : refine_notes ? `Refine com base nas notas: ${refine_notes}` : "";
    const basePrompt = [
      `Tipo de conteúdo: ${tipo_conteudo}`,
      `Descrição: ${descricao}`,
      publico_alvo ? `Público-alvo: ${publico_alvo}` : null,
      tom_voz ? `Tom de voz: ${tom_voz}` : null,
      previous_text ? `Texto anterior: ${previous_text}` : null,
      refinement || null,
    ].filter(Boolean).join("\n");
    const systemPrompt = renderBusinessPrompt(AGENTE_6_GERADOR_TEXTO, profile, null);
    const text = await executarAgente({
      agente: "AGENTE_6_GERADOR_TEXTO",
      systemPrompt,
      messages: [{ role: "user", content: basePrompt }],
      requireJson: true,
      temperature: 0.7,
      maxTokens: 700,
      preferHighQuality: true,
      debugTag: "generate-text",
    });
    console.log("[AI RAW RESPONSE]", text);
    let parsed = safeParseJSON(text, null);
    if (!parsed || typeof parsed !== "object") {
      parsed = { texto: typeof text === "string" ? text : "", sugestoes: [], prompt: null };
    }
    return sendSuccess(res, { ...parsed, credits: creditResult.credits });
  } catch (error) {
    console.error("[GENERATE-TEXT]", error);
    return sendError(res, isAiTimeoutError(error) ? 504 : 500, isAiTimeoutError(error) ? AI_TIMEOUT_USER_MESSAGE : "Erro ao gerar texto.");
  }
});

/* -------- GENERATE POSTS -------- */

router.post("/generate-posts", requireAuth, async (req, res) => {
  try {
    const { objetivo, tipo_conteudo, canal, brief, channels } = req.body || {};
    if (!objetivo || !tipo_conteudo) return sendError(res, 400, "objetivo e tipo_conteudo são obrigatórios");
    const supabase = getSupabase();
    const [creditResult, profile] = await Promise.all([
      consumeCredits({ supabase, userId: req.user.id, amount: CREDIT_COSTS.text, reason: "generate-posts" }),
      loadBusinessProfile(supabase, req.user.id),
    ]);
    if (!creditResult.ok) return sendInsufficientCredits(res, creditResult.credits);
    const payload = [
      `Objetivo: ${objetivo}`,
      `Tipo de conteúdo: ${tipo_conteudo}`,
      canal ? `Canal: ${canal}` : null,
      channels?.length ? `Canais: ${channels.join(", ")}` : null,
      brief ? `Brief: ${brief}` : null,
    ].filter(Boolean).join("\n");
    const systemPrompt = renderBusinessPrompt(AGENTE_3_GERADOR_POSTS, profile, null);
    const response = await executarAgente({
      agente: "AGENTE_3_GERADOR_POSTS",
      systemPrompt,
      messages: [{ role: "user", content: payload }],
      requireJson: true,
      temperature: 0.7,
      maxTokens: 900,
      preferHighQuality: true,
      debugTag: "generate-posts",
    });
    const parsed = safeParseJSON(response, { posts: [] });
    return sendSuccess(res, { ...parsed, credits: creditResult.credits });
  } catch (error) {
    console.error("[GENERATE-POSTS]", error);
    return sendError(res, isAiTimeoutError(error) ? 504 : 500, isAiTimeoutError(error) ? AI_TIMEOUT_USER_MESSAGE : "Erro ao gerar posts.");
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
      product_image_presente, // <- novo campo
    } = req.body || {};

    if (!tipo_post || !descricao || !formato || !estilo) {
      return sendError(res, 400, "Dados insuficientes para gerar o prompt.");
    }

    const supabase = getSupabase();
    const prompt = [
      `Tipo de post: ${tipo_post}`,
      `Descrição: ${descricao}`,
      `Formato: ${formato}`,
      `Estilo visual: ${estilo}`,
      `Incluir espaço para logo: ${incluir_espaco_logo ? "Sim" : "Não"}`,
      `Logo presente: ${logo_presente ? "Sim" : "Não"}`,
      // Instrui o agente a considerar a imagem do produto na composição
      product_image_presente
        ? "Imagem do produto fornecida: Sim — o prompt deve descrever como o produto deve ser featured como elemento visual central do post."
        : "Imagem do produto fornecida: Não",
    ].filter(Boolean).join("\n");

    const profile = await loadBusinessProfile(supabase, req.user.id);
    const systemPrompt = renderBusinessPrompt(AGENTE_7_GERADOR_POSTS_IMAGEM, profile, null);

    const response = await executarAgente({
      agente: "AGENTE_7_GERADOR_POSTS_IMAGEM",
      systemPrompt,
      messages: [{ role: "user", content: prompt }],
      requireJson: true,
      temperature: 0.6,
      maxTokens: 500,
      preferHighQuality: true,
      debugTag: "generate-post-prompt",
    });

    const parsed = safeParseJSON(response, { prompt: "", perguntas: [], observacoes: "" });
    return sendSuccess(res, parsed);
  } catch (error) {
    console.error("[POST-PROMPT]", error);
    return sendError(res, isAiTimeoutError(error) ? 504 : 500, isAiTimeoutError(error) ? AI_TIMEOUT_USER_MESSAGE : "Erro ao gerar prompt do post.");
  }
});

/* -------- GENERATE IMAGE -------- */

const openai = new OpenAI({ apiKey: process.env.AI_API_KEY });

router.post("/generate-image", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const {
      prompt,
      quality = "standard",
      template = null,
      format = null,
      incluir_espaco_logo = false,
      product_image = null,  // base64 data URL da imagem do produto
      logo_image = null,     // base64 data URL da logo
    } = body;
    const style = body.style ?? body.estilo ?? null;

    if (!prompt) return sendError(res, 400, "prompt required");

    const supabase = getSupabase();
    const [profile, creditResult] = await Promise.all([
      loadBusinessProfile(supabase, req.user.id),
      consumeCredits({ supabase, userId: req.user.id, amount: CREDIT_COSTS.image, reason: "generate-image" }),
    ]);

    if (!creditResult.ok) return sendInsufficientCredits(res, creditResult.credits);

    const { optimizedPrompt, negativePrompt } = buildImagePrompt({
      prompt,
      template,
      format,
      style,
      quality,
      businessProfile: profile,
      includeLogoSpace: Boolean(incluir_espaco_logo),
      purpose: "image",
    });

    const hasReferenceImage = Boolean(product_image || logo_image);
    console.log(`[IMAGE] Modo: ${hasReferenceImage ? "edit (com imagem de referência)" : "generate"}`);
    console.log("[IMAGE] Prompt:", optimizedPrompt);

    let result;

    if (hasReferenceImage) {
      // 🎨 Usa /images/edit quando há imagem do produto ou logo
      result = await editImageWithTimeout({
        prompt: optimizedPrompt,
        productImageDataUrl: product_image || null,
        logoImageDataUrl: logo_image || null,
      });
    } else {
      // 🎨 Usa /images/generate quando só há prompt textual
      result = await generateImageWithTimeout({
        model: "gpt-image-1",
        prompt: optimizedPrompt,
        size: "1024x1024",
      });
    }

    console.log("[IMAGE RAW RESPONSE]", JSON.stringify(result, null, 2));

    const imageBase64 = result.data?.[0]?.b64_json;
    if (!imageBase64) throw new Error("Imagem não retornada pela IA");

    const buffer = Buffer.from(imageBase64, "base64");
    const fileName = `${req.user.id}/${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("generated-images")
      .upload(fileName, buffer, { contentType: "image/png" });

    if (uploadError) {
      console.error("[IMAGE UPLOAD ERROR]", uploadError);
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from("generated-images")
      .getPublicUrl(fileName);

    const imageUrl = publicUrlData.publicUrl;
    console.log("[IMAGE URL]", imageUrl);

    try {
      const { error } = await supabase.from("generated_images").insert({
        user_id: req.user.id,
        url: imageUrl,
        prompt,
        optimized_prompt: optimizedPrompt,
        negative_prompt: negativePrompt,
        quality,
      });
      if (error && !isMissingTableError(error) && !isMissingColumnError(error)) {
        console.warn("[IMAGE] falha ao salvar", error.message);
      }
    } catch (error) {
      console.warn("[IMAGE] persistencia ignorada", error?.message || error);
    }

    return sendSuccess(res, {
      images: [{ url: imageUrl, optimized_prompt: optimizedPrompt, negative_prompt: negativePrompt }],
      credits: creditResult.credits,
    });

  } catch (error) {
    console.error("[IMAGE ERROR]", error);
    return sendError(res, isAiTimeoutError(error) ? 504 : 500, isAiTimeoutError(error) ? AI_TIMEOUT_USER_MESSAGE : "Erro ao gerar imagem");
  }
});

/* -------- ROTAS LEGADAS -------- */

app.use("/api", router);

const LEGACY_ROUTE_PREFIXES = [
  "/health", "/cors-test", "/plans", "/payments", "/webhook", "/profile",
  "/credits", "/dashboard-stats", "/generated-images", "/chat", "/ai-chat",
  "/generate-text", "/generate-posts", "/generate-post-prompt", "/generate-image", "/logo-generator",
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

app.use((err, req, res, _next) => {
  console.error("[GLOBAL ERROR]", err);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.status(500).json({ error: "Internal server error", message: err?.message || "Unexpected error" });
});

const port = Number(process.env.PORT || 10000);
let serverInstance = null;

async function syncStartupTasks() {
  try {
    const synced = await syncPlanCatalog();
    if (synced) {
      console.log("✅ Planos sincronizados");
    }
  } catch (err) {
    console.error("❌ Falha ao sincronizar planos:", err);
  }
}

async function startServer() {
  if (serverInstance) {
    return serverInstance;
  }

  await syncStartupTasks();

  serverInstance = await new Promise((resolve) => {
    const server = app.listen(port, () => {
      const address = server.address();
      const activePort = typeof address === "object" && address ? address.port : port;
      console.log(`🚀 Backend rodando na porta ${activePort}`);
      resolve(server);
    });
  });

  return serverInstance;
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectExecution()) {
  startServer().catch((error) => {
    console.error("❌ Falha no startup do backend:", error);
    process.exitCode = 1;
  });
}

export { app, startServer, syncStartupTasks };
