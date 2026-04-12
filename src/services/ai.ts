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

    const res = await fetchFunctions("/generate-posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(enhancedPayload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 402) throw new Error("Créditos insuficientes.");
      throw new Error(err.error || "Erro ao gerar posts.");
    }

    return res.json();
  } catch (error) {
    console.error("[generatePosts] error:", error);
    throw error;
  }
}

IMPORTANT RULES:
- Do NOT include readable text inside the image
- Represent content using icons, UI elements or visual metaphors
- Focus on visual composition, not written content
- Create a professional marketing-style image

STYLE: ${payload.estilo}
FORMAT: ${payload.formato}
      `,
    };

    console.log("📦 Payload enviado:", enhancedPayload);

    const res = await fetchFunctions("/generate-posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(enhancedPayload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[AI] generatePosts error", { status: res.status, err });

      if (res.status === 402) {
        throw new Error("Créditos insuficientes.");
      }

      throw new Error(err.error || "Erro ao gerar posts.");
    }

    const data = await res.json();

    // 🔥 2. PÓS-PROCESSAMENTO (GARANTIR QUALIDADE)
    if (data.prompt) {
      data.prompt = `${data.prompt},
professional composition,
depth of field,
soft shadows,
ultra realistic,
4k, highly detailed,
sharp focus, cinematic lighting`;
    }

    return data;
  } catch (error) {
    console.error("[generatePosts] error:", error);
    throw error;
  }
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
  style?: string | null;
  incluir_espaco_logo?: boolean;
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
