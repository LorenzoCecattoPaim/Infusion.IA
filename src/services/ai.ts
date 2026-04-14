import { fetchFunctions } from "@/lib/apiBase";

const AI_REQUEST_TIMEOUT_MS = 15000;
const AI_TIMEOUT_MESSAGE =
  "A IA está demorando mais do que o esperado. Tente novamente em instantes.";
const aiResponseCache = new Map<string, string>();

function buildCacheKey(path: string, payload: unknown) {
  return `${path}:${JSON.stringify(payload)}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function parseErrorResponse(res: Response, fallbackMessage: string) {
  const err = await res.json().catch(() => ({}));
  if (res.status === 402) {
    throw new Error("Créditos insuficientes.");
  }
  throw new Error(err.error || fallbackMessage);
}

async function requestAi<T>(
  path: string,
  payload: unknown,
  fallbackMessage: string
): Promise<T> {
  const cacheKey = buildCacheKey(path, payload);
  const cached = aiResponseCache.get(cacheKey);

  if (cached) {
    return cloneJson(JSON.parse(cached) as T);
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetchFunctions(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      await parseErrorResponse(res, fallbackMessage);
    }

    const data = (await res.json()) as T;
    aiResponseCache.set(cacheKey, JSON.stringify(data));
    return cloneJson(data);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(AI_TIMEOUT_MESSAGE);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export interface GeneratePostsPayload {
  canal?: string;
  objetivo: string;
  tipo_conteudo: string;
  brief?: string;
  channels?: string[];
}

export interface GeneratedPost {
  canal: string;
  objetivo?: string;
  tipo_conteudo?: string;
  texto_pronto: string;
  cta: string;
  sugestao_visual: string;
}

export interface GeneratePostsResponse {
  posts: GeneratedPost[];
}

export interface GenerateTextPayload {
  tipo_conteudo: string;
  descricao: string;
  publico_alvo?: string;
  tom_voz?: string;
  variation?: boolean;
  refine_notes?: string;
  previous_text?: string;
}

export interface GenerateTextResponse {
  texto: string;
  sugestoes: string[];
  prompt?: string | null;
}

export interface LogoGeneratorMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LogoGeneratorPayload {
  messages: LogoGeneratorMessage[];
  action?: string;
  selectedPrompt?: string;
}

export interface LogoGeneratorItem {
  url: string;
  description: string;
  prompt: string;
}

export interface LogoGeneratorResponse {
  message: string;
  logos: LogoGeneratorItem[];
  credits?: number;
  phase: "collecting_inputs" | "generating" | "done";
}

export async function generatePosts(
  payload: GeneratePostsPayload
): Promise<GeneratePostsResponse> {
  try {
    const enhancedPayload = {
      ...payload,
      descricao: `
${payload.brief || ""}

IMPORTANT RULES:
- Do NOT include readable text inside the image
- Represent content using icons, UI elements or visual metaphors
- Focus on visual composition, not written content
- Create a professional marketing-style image
`,
    };

    return await requestAi<GeneratePostsResponse>(
      "/generate-posts",
      enhancedPayload,
      "Erro ao gerar posts."
    );
  } catch (error) {
    console.error("[generatePosts] error:", error);
    throw error;
  }
}

export async function generateText(
  payload: GenerateTextPayload
): Promise<GenerateTextResponse> {
  try {
    return await requestAi<GenerateTextResponse>(
      "/generate-text",
      payload,
      "Erro ao gerar texto."
    );
  } catch (error) {
    console.error("[AI] generateText error", error);
    throw error;
  }
}

export interface GeneratePostPromptPayload {
  tipo_post: string;
  descricao: string;
  formato: string;
  estilo: string;
  incluir_espaco_logo: boolean;
  logo_presente: boolean;
}

export interface GeneratePostPromptResponse {
  prompt: string;
  perguntas?: string[];
  observacoes?: string;
}

export interface GenerateImageItem {
  id?: string | number;
  url: string;
  prompt?: string;
  optimized_prompt?: string | null;
  negative_prompt?: string | null;
}

export interface GenerateImageResponse {
  images: GenerateImageItem[];
  credits?: number;
}

export async function generatePostPrompt(
  payload: GeneratePostPromptPayload
): Promise<GeneratePostPromptResponse> {
  const data = await requestAi<GeneratePostPromptResponse>(
    "/generate-post-prompt",
    payload,
    "Erro ao gerar prompt do post."
  );

  if (data.prompt) {
    data.prompt = `${data.prompt},
professional advertising poster,
premium design,
balanced composition,
modern layout,
high contrast,
cinematic lighting,
depth of field,
soft shadows,
ultra realistic,
4k, highly detailed,
sharp focus`;
  }

  return data;
}

export async function generateImage(payload: {
  prompt: string;
  quality?: "standard" | "premium";
  template?: string | null;
  format?: string;
  style?: string | null;
  incluir_espaco_logo?: boolean;
}): Promise<GenerateImageResponse> {
  try {
    return await requestAi<GenerateImageResponse>(
      "/generate-image",
      payload,
      "Erro ao gerar imagem."
    );
  } catch (error) {
    console.error("[AI] generateImage error", error);
    throw error;
  }
}

export async function callLogoGenerator(
  payload: LogoGeneratorPayload
): Promise<LogoGeneratorResponse> {
  try {
    return await requestAi<LogoGeneratorResponse>(
      "/logo-generator",
      payload,
      "Erro ao processar a geração de logos."
    );
  } catch (error) {
    console.error("[AI] logoGenerator error", error);
    throw error;
  }
}
