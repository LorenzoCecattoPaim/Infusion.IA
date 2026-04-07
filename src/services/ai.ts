import { supabase } from "@/integrations/supabase/client";
import { getFunctionsBaseUrl } from "@/lib/apiBase";

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

function getBaseUrl(): string {
  return getFunctionsBaseUrl();
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

export async function generatePosts(
  payload: GeneratePostsPayload
): Promise<GeneratePostsResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error("Usuário não autenticado");

  const res = await fetch(`${getBaseUrl()}/functions/v1/generate-posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 402) throw new Error("Créditos insuficientes.");
    throw new Error(err.error || "Erro ao gerar posts.");
  }

  return res.json();
}

export async function generateText(
  payload: GenerateTextPayload
): Promise<GenerateTextResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error("Usuário não autenticado");

  const res = await fetch(`${getBaseUrl()}/functions/v1/generate-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
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
  const token = await getAuthToken();
  if (!token) throw new Error("Usuário não autenticado");

  const res = await fetch(`${getBaseUrl()}/functions/v1/generate-post-prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
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
  const token = await getAuthToken();
  if (!token) throw new Error("Usuário não autenticado");

  const res = await fetch(`${getBaseUrl()}/functions/v1/generate-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 402) throw new Error("Créditos insuficientes.");
    throw new Error(err.error || "Erro ao gerar imagem.");
  }

  return res.json();
}


