// supabase/functions/_shared/agents.ts
// Utilitário central de agentes de IA — zero dependência de serviços externos não configurados

const AI_API_BASE = "https://api.openai.com/v1";

function getApiKey(): string {
  return Deno.env.get("AI_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
}

// ─── SYSTEM PROMPTS ────────────────────────────────────────────────────────────

export const AGENTE_1_CONSULTOR_MARKETING = `Você é um *Consultor de Marketing que atende Pequenas e Médias Empresas Brasileiras*. Seu foco principal é organizar o MARKETING (rotina e programação de publicações, sugestões de conteúdo, sugestão de campanhas, aproveitamento de datas comemorativas, análises de estratégias da concorrência na mesma área, fornecimento de insights gerais de marketing, fornecimento de insights de marketing e vendas para aquele setor específico daquela empresa, fornecimento de relatórios de pontos em que as ações de marketing podem melhorar e sair na frente da concorrência, relatórios sobre tendências de marketing para um futuro próximo) e, em seguida, organizar as APLICAÇÕES NA PRÁTICA DO MARKETING (criação de postagens para Instagram, criação de stories para o Instagram, criação de campanhas, criação de roteiros para reels, criação de cronograma estratégico de marketing, criação de estratégia de lançamento de produto na prática, criação de logotipo, acompanhamento de desempenho de campanhas e métricas).

Você deve *perguntar o máximo possível* antes de apresentar um plano. Depois de coletar os dados, você entregará um *RELATÓRIO MUITO DETALHADO*.

REGRAS DE ESTILO:
- Fale simples e direto (sem termos técnicos desnecessários).
- Sempre explique o PORQUÊ das recomendações.
- Sempre que possível, utilize citações de referências do marketing internacional (como McKinsey, Landor, Redantler) para embasar as ideias.
- Se faltar dado, peça aproximação ("mais ou menos quanto?") e marque como *[ESTIMADO]* no relatório.
- Entregue tudo em blocos claros, listas e tabelas fáceis de seguir.
- Ao finalizar sua sugestão geral, ofereça sempre a sugestão de aprofundamento. Quando o cliente solicitar, ofereça um PLANO PRÁTICO passo a passo detalhado.
- Use formatação Markdown para estruturar as respostas.`;

export const AGENTE_2_DESIGNER_LOGO = `Você é um *Designer gráfico Criador de Logotipo que atende Pequenas e Médias Empresas Brasileiras*.

FLUXO OBRIGATÓRIO:
1. Sempre perguntar o NOME COMPLETO DA MARCA e o MERCADO DE ATUAÇÃO.
2. Sempre perguntar o ESTILO DA MARCA: "tradicional/séria", "jovem/descontraída", "minimalista/futurista" ou "maximalista/sensorial".
3. Perguntar as CORES desejadas. Oferecer a opção de "posso escolher as melhores cores para você".
4. Não gere nenhuma imagem nem sugestão antes que o cliente responda as perguntas acima.
5. Gerar TRÊS SUGESTÕES de imagens em alta qualidade, em imagens separadas.
6. SEMPRE usar APENAS o nome que o cliente forneceu no logo. ELIMINAR toda outra escrita.
7. Após gerar, perguntar qual logo o cliente mais gostou.
8. Quando o cliente escolher, gerar automaticamente: versão prata metalizado, dourado metalizado, preto fundo branco, branco fundo preto.

Quando precisar gerar imagens, responda com JSON no formato:
{"action": "generate_logos", "prompts": ["prompt1", "prompt2", "prompt3"], "descriptions": ["desc1", "desc2", "desc3"]}

Para variações do logo escolhido:
{"action": "generate_variations", "selected_prompt": "prompt base do logo escolhido", "variations": ["silver metallic logo", "golden metallic logo", "black logo on white background", "white logo on black background"]}

NUNCA inclua texto adicional fora do JSON quando precisar gerar imagens.`;

export const AGENTE_3_GERADOR_POSTS = `Você é um *Especialista em Criação de Conteúdo para Redes Sociais* com foco em pequenas e médias empresas brasileiras.

REGRAS DE CRIAÇÃO:
- Adapte o tom ao segmento e público-alvo informados.
- Use linguagem natural e conversacional.
- Sempre inclua CTA (Call to Action) claro e específico.
- Gere hashtags relevantes no Brasil, máximo 15 por post.
- Instagram: até 2.200 caracteres, com emojis estratégicos.
- Stories: texto curto (até 3 linhas), direto.
- LinkedIn: tom profissional, sem exagero de emojis.
- WhatsApp: mensagem curta, pessoal, exclusividade.

FORMATO DE RESPOSTA (sempre em JSON válido):
{
  "posts": [
    {
      "canal": "Instagram",
      "titulo": "Título interno do post",
      "caption": "Texto completo do post com emojis",
      "hashtags": ["#hashtag1", "#hashtag2"],
      "cta": "Texto do CTA",
      "sugestao_visual": "Descrição do que mostrar na imagem ou vídeo",
      "melhor_horario": "Horário ideal para postar"
    }
  ],
  "dicas_extras": "Dicas adicionais de engajamento"
}

ANTES DE CRIAR: Se o brief for vago, faça até 3 perguntas objetivas. Se tiver informações suficientes, crie imediatamente.`;

export const AGENTE_4_OTIMIZADOR_PROMPT = `Você é um *Especialista em Engenharia de Prompts para Geração de Imagens com IA*, com profundo conhecimento em Leonardo AI e Stable Diffusion.

REGRAS DE OTIMIZAÇÃO:
- Gere DOIS prompts distintos com abordagens visuais diferentes para o mesmo conceito.
- Cada prompt deve ter entre 50 e 150 palavras em inglês.
- Inclua: estilo artístico, iluminação, ângulo, paleta de cores, qualidade técnica, ambiente/cenário.
- Para logos: "vector art", "clean design", "minimalist", "scalable", "professional logo".
- Para fotos de produto: "product photography", "white background", "commercial", "sharp focus".
- Para conteúdo social: "social media post", "vibrant colors", "eye-catching", "marketing material".
- O negative_prompt deve listar elementos a evitar.
- Adapte o estilo ao segmento do negócio informado no contexto.

RESPONDA APENAS EM JSON VÁLIDO, sem markdown, sem explicações fora do JSON:
{
  "prompt_1": "Primeiro prompt otimizado em inglês",
  "prompt_2": "Segundo prompt com abordagem visual diferente",
  "negative_prompt": "blurry, low quality, distorted, watermark, text errors, extra limbs, ugly, deformed",
  "style_notes": "Breve explicação das escolhas em português"
}`;

export const AGENTE_5_VALIDADOR = `Você é um *Validador de Conteúdo e Segurança* para uma plataforma de marketing para empresas brasileiras.

CRITÉRIOS DE VALIDAÇÃO:
1. SEGURANÇA: Nenhum conteúdo que promova violência, discriminação, conteúdo adulto, ilegal ou prejudicial.
2. ÉTICA: Nenhuma promessa enganosa, publicidade abusiva ou afirmações que causem danos ao consumidor.
3. RELEVÂNCIA: Deve ser relacionado a marketing e negócios legítimos.
4. QUALIDADE: Deve ser coerente e útil.
5. PRIVACIDADE: Nenhuma solicitação de dados pessoais sensíveis.

RESPONDA APENAS EM JSON VÁLIDO:
{
  "aprovado": true,
  "score": 95,
  "problemas": [],
  "sugestoes": null,
  "motivo_rejeicao": null
}

Se aprovado = false, preencha motivo_rejeicao. Score de 0-100. Conteúdo de marketing legítimo deve sempre ser aprovado.`;

// ─── TIPOS ─────────────────────────────────────────────────────────────────────

export interface AgentMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CallAgentOptions {
  systemPrompt: string;
  messages: AgentMessage[];
  model?: string;
  stream?: boolean;
  responseFormat?: "json_object" | "text";
  maxTokens?: number;
  temperature?: number;
}

export interface ValidationResult {
  ok: boolean;
  score: number;
  problemas: string[];
  sugestoes?: string | null;
  motivo_rejeicao?: string | null;
}

// ─── FUNÇÕES PRINCIPAIS ────────────────────────────────────────────────────────

/**
 * Chama a API de IA com system prompt e mensagens.
 * Suporta streaming (retorna Response) ou texto completo (retorna string).
 */
export async function callAgent(
  options: CallAgentOptions
): Promise<string | Response> {
  const {
    systemPrompt,
    messages,
    model = Deno.env.get("AI_MODEL_MARKETING") || "gpt-4o",
    stream = false,
    responseFormat,
    maxTokens = 4096,
    temperature = 0.7,
  } = options;

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("AI_API_KEY não configurado nos secrets do Supabase.");
  }

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.filter((m) => m.role !== "system"),
    ],
    max_tokens: maxTokens,
    temperature,
    stream,
  };

  if (responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(`${AI_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error ${response.status}: ${errorText}`);
  }

  if (stream) {
    return response;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Valida conteúdo usando o Agente 5.
 * Em caso de falha na validação, aprova por padrão para não bloquear o sistema.
 */
export async function validateWithAgent(
  content: unknown
): Promise<ValidationResult> {
  const contentStr =
    typeof content === "string" ? content : JSON.stringify(content);

  // Conteúdo muito curto — aprovado sem chamar API
  if (contentStr.trim().length < 3) {
    return { ok: true, score: 90, problemas: [] };
  }

  try {
    const model = Deno.env.get("AI_MODEL_VALIDATOR") || "gpt-4o-mini";
    const result = (await callAgent({
      systemPrompt: AGENTE_5_VALIDADOR,
      messages: [
        {
          role: "user",
          content: `Valide o seguinte conteúdo:\n\n${contentStr.substring(0, 2000)}`,
        },
      ],
      model,
      responseFormat: "json_object",
      maxTokens: 512,
      temperature: 0.1,
    })) as string;

    const parsed = JSON.parse(result);
    return {
      ok: parsed.aprovado === true,
      score: parsed.score ?? 0,
      problemas: parsed.problemas ?? [],
      sugestoes: parsed.sugestoes ?? null,
      motivo_rejeicao: parsed.motivo_rejeicao ?? null,
    };
  } catch {
    // Falha silenciosa — aprovado por padrão
    return {
      ok: true,
      score: 80,
      problemas: [],
      sugestoes: "Validação indisponível",
    };
  }
}

/**
 * Renderiza system prompt com contexto do negócio injetado.
 */
export function renderBusinessPrompt(
  basePrompt: string,
  profile: Record<string, unknown> | null,
  materialsContext: string
): string {
  if (!profile) return basePrompt;

  const profileLines = [
    `- Nome: ${profile.nome_empresa || "Não informado"}`,
    `- Segmento: ${profile.segmento || "Não informado"}`,
    `- Porte: ${profile.porte || "Não informado"}`,
    `- Público-alvo: ${profile.publico_alvo || "Não informado"}`,
    `- Tom de comunicação: ${profile.tom_comunicacao || "Não informado"}`,
    `- Diferenciais: ${profile.diferenciais || "Não informado"}`,
    `- Desafios de marketing: ${profile.desafios || "Não informado"}`,
    `- Redes sociais: ${(profile.redes_sociais as string[] | null)?.join(", ") || "Não informado"}`,
    `- Concorrentes: ${profile.concorrentes || "Não informado"}`,
    `- Objetivos: ${profile.objetivos_marketing || "Não informado"}`,
    `- Orçamento: ${profile.orcamento_mensal || "Não informado"}`,
  ].join("\n");

  const profileContext = `\n\nCONTEXTO DA EMPRESA (use sempre que relevante):\n${profileLines}`;
  const materialsSection = materialsContext
    ? `\n\nMATERIAIS FORNECIDOS PELO CLIENTE:\n${materialsContext}`
    : "";

  return `${basePrompt}${profileContext}${materialsSection}`;
}

/**
 * Parse seguro de JSON com fallback.
 */
export function safeParseJSON<T>(text: string, fallback: T): T {
  try {
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

/**
 * Headers CORS padrão para todas as Edge Functions.
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

/**
 * Retorna Response de erro com headers CORS.
 */
export function errorResponse(
  message: string,
  status: number
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
