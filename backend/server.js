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
  callAgent,
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

/* ========================= ROUTES ========================= */

app.get("/health", (_req, res) => {
  sendSuccess(res, { ok: true });
});

app.get("/cors-test", (_req, res) => {
  res.json({ ok: true });
});

/* -------- CREDITS -------- */

app.get("/credits", requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("user_credits")
      .select("credits, plan")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const { data: created } = await supabase
        .from("user_credits")
        .insert({ user_id: req.user.id, credits: 100, plan: "free" })
        .select("credits, plan")
        .single();

      return sendSuccess(res, created);
    }

    return sendSuccess(res, data);
  } catch (error) {
    console.error("[CREDITS]", error);
    return sendError(res, 500, "Erro ao carregar créditos.");
  }
});

/* -------- DASHBOARD -------- */

app.get("/dashboard-stats", requireAuth, async (req, res) => {
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
    console.error("[CHAT]", error);
    return sendError(res, 500, "Erro ao carregar conversas.");
  }
});

/* -------- AI CHAT -------- */

app.post("/ai-chat", requireAuth, async (req, res) => {
  try {
    const { messages = [] } = req.body || {};

    if (!messages.length) {
      return sendError(res, 400, "messages required");
    }

    const text = await callAgent({
      systemPrompt: AGENTE_1_CONSULTOR_MARKETING,
      messages,
      model: process.env.AI_MODEL_MARKETING || "gpt-4o",
    });

    return sendSuccess(res, {
      choices: [{ message: { role: "assistant", content: text } }],
    });
  } catch (error) {
    console.error("[AI-CHAT]", error);
    return sendError(res, 500, "Erro interno");
  }
});

/* -------- GENERATE IMAGE -------- */

app.post("/generate-image", requireAuth, async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return sendError(res, 400, "prompt required");

    return sendSuccess(res, {
      images: [{ url: "placeholder" }],
    });
  } catch (error) {
    console.error("[IMAGE]", error);
    return sendError(res, 500, "Erro ao gerar imagem");
  }
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