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
  if (origin.endsWith(".vercel.app") && origin.includes("infusion-ia")) {
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

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // libera qualquer origem da Vercel temporariamente (debug)
  if (origin && origin.includes("vercel.app")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
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
      console.warn("[PLANS] falha ao sincronizar catálogo", error.message);
    } else {
      console.log("[PLANS] catálogo sincronizado");
    }
  } catch (error) {
    console.warn("[PLANS] sincronização ignorada", error?.message || error);
  }
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

async function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return sendError(res, 401, "Unauthorized");

  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) return sendError(res, 401, "Unauthorized");

  req.user = user;
  next();
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

/* -------- AI CHAT -------- */

router.post("/ai-chat", requireAuth, async (req, res) => {
  try {
    const { messages = [] } = req.body || {};

    if (!messages.length) {
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

    const text = await executarAgente({
      agente: "AGENTE_1_CONSULTOR_MARKETING",
      systemPrompt: AGENTE_1_CONSULTOR_MARKETING,
      messages,
    });

    return sendSuccess(res, {
      choices: [{ message: { role: "assistant", content: text } }],
      credits: creditResult.credits,
    });
  } catch (error) {
    console.error("[AI-CHAT]", error);
    return sendError(res, 500, "Erro interno");
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

    const parsed = safeParseJSON(text, {
      texto: "",
      sugestoes: [],
      prompt: null,
    });

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

router.post("/generate-image", requireAuth, async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return sendError(res, 400, "prompt required");

    const supabase = getSupabase();
    const creditResult = await consumeCredits({
      supabase,
      userId: req.user.id,
      amount: CREDIT_COSTS.image,
      reason: "generate-image",
    });

    if (!creditResult.ok) {
      return sendInsufficientCredits(res, creditResult.credits);
    }

    return sendSuccess(res, {
      images: [{ url: "placeholder" }],
      credits: creditResult.credits,
    });
  } catch (error) {
    console.error("[IMAGE]", error);
    return sendError(res, 500, "Erro ao gerar imagem");
  }
});

app.use("/api", router);
app.use("/", router);

app.use("/api", (req, res) => {
  console.log("❌ Rota não encontrada:", req.method, req.originalUrl);
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
