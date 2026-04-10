import OpenAI from "openai";

const MODELS = {
  FULL: "gpt-5.4",
  MINI: "gpt-5.4-mini",
  NANO: "gpt-5.4-nano",
};

const AGENT_MODEL_MAP = {
  AGENTE_1_CONSULTOR_MARKETING: MODELS.MINI,
  AGENTE_2_DESIGNER_LOGO: MODELS.MINI,
  AGENTE_3_GERADOR_POSTS: MODELS.MINI,
  AGENTE_4_OTIMIZADOR_PROMPT: MODELS.FULL,
  AGENTE_5_VALIDADOR: MODELS.FULL,
  AGENTE_6_GERADOR_TEXTO: MODELS.NANO,
  AGENTE_7_GERADOR_POSTS_IMAGEM: MODELS.MINI,
  AGENTE_LOGO_PROMPT_BUILDER: MODELS.MINI,
};

const JSON_AGENTS = new Set([
  "AGENTE_3_GERADOR_POSTS",
  "AGENTE_4_OTIMIZADOR_PROMPT",
  "AGENTE_5_VALIDADOR",
  "AGENTE_6_GERADOR_TEXTO",
  "AGENTE_7_GERADOR_POSTS_IMAGEM",
  "AGENTE_LOGO_PROMPT_BUILDER",
]);

const IMAGE_AGENTS = new Set([
  "AGENTE_2_DESIGNER_LOGO",
  "AGENTE_4_OTIMIZADOR_PROMPT",
  "AGENTE_7_GERADOR_POSTS_IMAGEM",
  "AGENTE_LOGO_PROMPT_BUILDER",
]);

function getClient() {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw new Error("AI_API_KEY nÃ£o configurado no backend.");
  }
  return new OpenAI({ apiKey });
}

function pickModel(agente, preferHighQuality) {
  if (agente === "AGENTE_7_GERADOR_POSTS_IMAGEM" && preferHighQuality) {
    return MODELS.FULL;
  }
  return AGENT_MODEL_MAP[agente] || MODELS.MINI;
}

function buildMessages(systemPrompt, messages) {
  const base = Array.isArray(messages) ? messages : [];
  return systemPrompt ? [{ role: "system", content: systemPrompt }, ...base] : base;
}

function isIncomplete(content) {
  const text = (content || "").trim();
  if (text.length < 20) return true;
  return text.endsWith("...") || text.endsWith("â€¦");
}

function safeParseJSON(text) {
  try {
    const cleaned = text.replace(/```json\\n?/g, "").replace(/```\\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function hasRequiredFields(obj, fields) {
  if (!obj || typeof obj !== "object") return false;
  return fields.every((key) => obj[key] !== undefined && obj[key] !== null);
}

function schemaValidate(agente, parsed) {
  if (!parsed) return false;

  if (agente === "AGENTE_3_GERADOR_POSTS") {
    const posts = parsed.posts;
    if (!Array.isArray(posts) || posts.length === 0) return false;
    return hasRequiredFields(posts[0], [
      "canal",
      "objetivo",
      "tipo_conteudo",
      "texto_pronto",
      "cta",
      "sugestao_visual",
    ]);
  }

  if (agente === "AGENTE_4_OTIMIZADOR_PROMPT") {
    return hasRequiredFields(parsed, [
      "prompt_1",
      "prompt_2",
      "negative_prompt",
      "style_notes",
    ]);
  }

  if (agente === "AGENTE_5_VALIDADOR") {
    return hasRequiredFields(parsed, ["aprovado", "score", "problemas"]);
  }

  if (agente === "AGENTE_6_GERADOR_TEXTO") {
    return hasRequiredFields(parsed, ["texto", "sugestoes", "prompt"]);
  }

  if (agente === "AGENTE_7_GERADOR_POSTS_IMAGEM") {
    return hasRequiredFields(parsed, ["prompt", "perguntas", "observacoes"]);
  }

  if (agente === "AGENTE_LOGO_PROMPT_BUILDER") {
    if (!Array.isArray(parsed.prompts) || !Array.isArray(parsed.descriptions)) return false;
    return parsed.prompts.length === 3 && parsed.descriptions.length === 3;
  }

  return true;
}

function wordCount(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

function isLowQuality(agente, content, parsed) {
  if (!content || typeof content !== "string") return true;

  if (IMAGE_AGENTS.has(agente)) {
    if (content.trim().length < 120) return true;
  }

  if (agente === "AGENTE_4_OTIMIZADOR_PROMPT" && parsed) {
    const wc1 = wordCount(parsed.prompt_1);
    const wc2 = wordCount(parsed.prompt_2);
    if (wc1 < 45 || wc1 > 170) return true;
    if (wc2 < 45 || wc2 > 170) return true;
  }

  if (agente === "AGENTE_LOGO_PROMPT_BUILDER" && parsed) {
    const tooShort = parsed.prompts.some((p) => wordCount(p) < 12);
    if (tooShort) return true;
  }

  if (agente === "AGENTE_7_GERADOR_POSTS_IMAGEM" && parsed) {
    if (!parsed.perguntas?.length && wordCount(parsed.prompt) < 20) return true;
  }

  return false;
}

function trackUsage({ userId, model, usage }) {
  if (!usage) return;
  if (!userId) return;
  console.log(
    `[AI] usage user=${userId} model=${model} input=${usage.prompt_tokens} output=${usage.completion_tokens}`
  );
}

async function callModel({
  client,
  model,
  systemPrompt,
  messages,
  requireJson,
  temperature,
  maxTokens,
}) {
  const payload = {
    model,
    messages: buildMessages(systemPrompt, messages),
    temperature,
    max_completion_tokens: maxTokens,
  };

  if (requireJson) {
    payload.response_format = { type: "json_object" };
  }

  const response = await client.chat.completions.create(payload);
  const content = response?.choices?.[0]?.message?.content ?? "";
  return { content, usage: response?.usage };
}

export async function executarAgente({
  agente,
  systemPrompt,
  messages,
  requireJson = false,
  temperature = 0.7,
  maxTokens = 4096,
  preferHighQuality = false,
  userId = null,
}) {
  const client = getClient();
  const baseModel = pickModel(agente, preferHighQuality);
  const fallbackModel = MODELS.FULL;
  const needsJson = requireJson || JSON_AGENTS.has(agente);

  console.log(`[AI] model selected agente=${agente} model=${baseModel}`);

  const tryOnce = async (model) => {
    const { content, usage } = await callModel({
      client,
      model,
      systemPrompt,
      messages,
      requireJson: needsJson,
      temperature,
      maxTokens,
    });

    trackUsage({ userId, model, usage });

    if (!content || isIncomplete(content)) {
      return { ok: false, reason: "incomplete", content };
    }

    let parsed = null;
    if (needsJson) {
      parsed = safeParseJSON(content);
      if (!parsed || !schemaValidate(agente, parsed)) {
        return { ok: false, reason: "invalid_json", content };
      }
    }

    if (isLowQuality(agente, content, parsed)) {
      return { ok: false, reason: "low_quality", content };
    }

    return { ok: true, content };
  };

  try {
    const first = await tryOnce(baseModel);
    if (first.ok) return first.content;

    console.warn(
      `[AI] fallback acionado agente=${agente} reason=${first.reason} from=${baseModel} to=${fallbackModel}`
    );

    const second = await tryOnce(fallbackModel);
    if (second.ok) return second.content;

    throw new Error(`AI fallback failed: ${second.reason || "unknown"}`);
  } catch (error) {
    console.error("[AI] router error", error);
    throw error;
  }
}
