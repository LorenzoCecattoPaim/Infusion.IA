import { fetchFunctions } from "@/lib/apiBase";

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

export async function generatePosts(
  payload: GeneratePostsPayload
): Promise<GeneratePostsResponse> {
  const res = await fetchFunctions("/generate-posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[AI] generatePosts error", { status: res.status, err });
    if (res.status === 402) throw new Error("Créditos insuficientes.");
    throw new Error(err.error || "Erro ao gerar posts.");
  }

  return res.json();
}

export async function generateText(
  payload: GenerateTextPayload
): Promise<GenerateTextResponse> {
  const res = await fetchFunctions("/generate-text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[AI] generateText error", { status: res.status, err });
    if (res.status === 402) throw new Error("Créditos insuficientes.");
    throw new Error(err.error || "Erro ao gerar texto.");
  }

  return res.json();
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

export async function generatePostPrompt(
  payload: GeneratePostPromptPayload
): Promise<GeneratePostPromptResponse> {
  const res = await fetchFunctions("/generate-post-prompt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[AI] generatePostPrompt error", { status: res.status, err });
    throw new Error(err.error || "Erro ao gerar prompt do post.");
  }

  return res.json();
}

export async function generateImage(payload: {
  prompt: string;
  quality?: "standard" | "premium";
  template?: string | null;
  format?: string;
}) {
  const res = await fetchFunctions("/generate-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[AI] generateImage error", { status: res.status, err });
    if (res.status === 402) throw new Error("Créditos insuficientes.");
    throw new Error(err.error || "Erro ao gerar imagem.");
  }

  return res.json();
}
