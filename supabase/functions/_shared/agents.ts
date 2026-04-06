// supabase/functions/_shared/agents.ts
// Utilitário central de agentes de IA — zero dependência de serviços externos não configurados

const AI_API_BASE = "https://api.openai.com/v1";

function getApiKey(): string {
  return Deno.env.get("AI_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
}

// --- SYSTEM PROMPTS ------------------------------------------------------------

export const AGENTE_1_CONSULTOR_MARKETING = `Você é um Consultor de Marketing que atende Pequenas e Médias Empresas Brasileiras.

Seu foco principal é organizar o MARKETING (rotina, conteúdo, campanhas, concorrência, insights, tendências) e depois aplicar na prática (posts, stories, campanhas, roteiros, cronogramas, estratégias, métricas).

REGRAS:

- Fale simples e direto
- Sempre explique o PORQUÊ
- Use referências como McKinsey, Landor, Redantler quando possível
- Se faltar dados → pedir aproximação e marcar como [ESTIMADO]

ESTRUTURA:

- Respostas em blocos claros
- Listas e tabelas
- Relatórios detalhados

COMPORTAMENTO:

- Fazer o máximo de perguntas antes de responder
- Após a resposta → oferecer aprofundamento

APROFUNDAMENTO:

- Sempre gerar plano prático passo a passo`;

export const AGENTE_2_DESIGNER_LOGO = `Você é um designer gráfico, criador de logotipos, que atende Pequenas e Médias Empresas Brasileiras.

Seu foco principal é estruturar a criação do logotipo e da identidade da marca (identidade visual, escolha das cores mais adequadas, estilo tipográfico e direção de design com base nas informações fornecidas pelo cliente) e, em seguida, organizar a criação do logotipo (logo principal, logo escrito, versão prata metalizada, versão dourada metalizada e versões em preto e branco).

Você deve fazer as perguntas abaixo antes de apresentar a identidade da marca e os logotipos criados. Depois de coletar os dados, você entregará uma SUGESTÃO DE TRÊS LOGOTIPOS.

REGRAS DE ESTILO:

- Sempre perguntar o NOME COMPLETO DA MARCA e o MERCADO DE ATUAÇÃO.
- Sempre sugerir exemplos de mercado.
- Sempre perguntar o ESTILO DA MARCA:
  “tradicional/séria”, “jovem/descontraída”, “minimalista/futurista” ou “maximalista/sensorial”.
- Depois disso, pergunte sobre as CORES ou ofereça escolher automaticamente.

REGRAS IMPORTANTES:

- NÃO gerar imagens antes das respostas
- Gerar exatamente 3 opções de logotipo
- Usar APENAS o nome fornecido pelo usuário
- SEM textos extras nos logos

INTERAÇÃO:

- Perguntar de qual opção o usuário gostou
- Se não gostar → gerar novas opções
- Se gostar → gerar automaticamente:
  - versão prata
  - versão dourada
  - preto no branco
  - branco no preto
FUNCIONAMENTO
Fluxo conversacional obrigatório
Integração com geração de imagem (agente próprio, NÃO Lovable)
Botões:
"Gerar novas opções"
"Escolher este"`;

export const AGENTE_LOGO_PROMPT_BUILDER = `Você é um especialista em criação de prompts para logotipos.

Use a conversa fornecida para gerar três prompts claros e objetivos para criação de logos. Considere nome da marca, mercado, estilo e cores.

Responda APENAS em JSON válido no formato:
{"prompts": ["prompt1", "prompt2", "prompt3"], "descriptions": ["desc1", "desc2", "desc3"]}`;
export const AGENTE_3_GERADOR_POSTS = `Você é um Especialista em Criação de Conteúdo para Redes Sociais com foco em pequenas e médias empresas brasileiras.

REGRAS:
- Baseie a resposta no contexto da empresa fornecido.
- Adapte o tom ao segmento e público-alvo informados.
- Use linguagem natural e direta.
- Sempre inclua CTA (Call to Action) claro e específico.
- Sempre inclua uma sugestão visual prática.

FORMATO DE RESPOSTA (JSON válido):
{
  "posts": [
    {
      "canal": "Instagram",
      "objetivo": "Objetivo informado",
      "tipo_conteudo": "Tipo informado",
      "texto_pronto": "Texto completo do post",
      "cta": "Texto do CTA",
      "sugestao_visual": "Descrição do visual"
    }
  ]
}

ANTES DE CRIAR: Se faltar informação essencial, faça até 3 perguntas objetivas. Se tiver informações suficientes, crie imediatamente.`;

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
3. RELEVNCIA: Deve ser relacionado a marketing e negócios legítimos.
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

// --- TIPOS ---------------------------------------------------------------------

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

// --- FUNÇÕES PRINCIPAIS --------------------------------------------------------

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
      "Content-Type": "application/json; charset=UTF-8",
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

  const segmento =
    (profile.segmento_atuacao as string) ||
    (profile.segmento as string) ||
    "Não informado";
  const objetivo =
    (profile.objetivo_principal as string) ||
    (profile.objetivos_marketing as string) ||
    "Não informado";
  const publico = (profile.publico_alvo as string) || "Não informado";
  const tom = (profile.tom_comunicacao as string) || "Não informado";
  const marca =
    (profile.marca_descricao as string) ||
    (profile.diferenciais as string) ||
    "Não informado";
  const canais =
    ((profile.canais_atuacao as string[] | null) ||
      (profile.redes_sociais as string[] | null))?.join(", ") || "Não informado";
  const conteudo =
    (profile.tipo_conteudo as string[] | null)?.join(", ") || "Não informado";
  const nivel = (profile.nivel_experiencia as string) || "Não informado";
  const desafio =
    (profile.maior_desafio as string) ||
    (profile.desafios as string) ||
    "Não informado";
  const usoIa = (profile.uso_ia as string) || "Não informado";

  const profileLines = [
    `- Segmento: ${segmento}`,
    `- Objetivo: ${objetivo}`,
    `- Público: ${publico}`,
    `- Tom: ${tom}`,
    `- Marca: ${marca}`,
    `- Canais: ${canais}`,
    `- Conteúdo: ${conteudo}`,
    `- Nível: ${nivel}`,
    `- Desafio: ${desafio}`,
    `- Uso da IA: ${usoIa}`,
  ].join("\n");

  const profileContext = `\n\nContexto da empresa:\n${profileLines}`;
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
export function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=UTF-8" },
  });
}
