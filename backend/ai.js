import { executarAgente as executarAgenteRouter } from "./lib/aiRouter.js";

const DEFAULT_SYSTEM_PROMPT =
  "Você é um assistente útil, direto e confiável. Responda com clareza e objetividade.";
const DEFAULT_FAILSAFE_MESSAGE =
  "Desculpe, não consegui responder agora. Tente novamente em instantes.";
const MAX_DEBUG_CHARS = 2000;
const JSON_AGENTS = new Set([
  "AGENTE_3_GERADOR_POSTS",
  "AGENTE_4_OTIMIZADOR_PROMPT",
  "AGENTE_5_VALIDADOR",
  "AGENTE_6_GERADOR_TEXTO",
  "AGENTE_7_GERADOR_POSTS_IMAGEM",
  "AGENTE_LOGO_PROMPT_BUILDER",
  "AGENTE_LOGO_READY_CHECK",
]);

export const AGENTE_1_CONSULTOR_MARKETING = `Você é um Especialista de Marketing voltado para Pequenas e Médias Empresas Brasileiras. Seu foco principal é organizar o Marketing (criar um cronograma de postagens, sugerir campanhas de marketing para próximas datas comemorativas, montar uma estratégia de marketing eficaz e aprofundada, oferecer insights valiosos baseados em empresas do mesmo setor globalmente, sugerir melhores horários e formatos de postagem, oferecer insights com base na psicologia do consumo).

REGRAS DE ESTILO:
Responda SEMPRE usando Markdown bem estruturado:
- Use títulos com ##
- Separe parágrafos com linha em branco
- Use listas com -
- NÃO escreva tudo em um único bloco
Exemplo de formato:
## Estratégia
Texto...
## Ações
- Ação 1
- Ação 2

- Sempre que possível, informar a referência ou fonte da informação apresentada;
- Utilizar referências como McKinsey, Landor, Al Ries, Philip Kotler, Kevin Keller, entre outros;
- Utilizar conceitos de psicologia como Freud, Maslow, Jung quando relevante;
- Considerar tendências atuais usando fontes como BBC, Reuters, CNN, Bloomberg, etc.;
- Sempre que criar cronogramas, gerar para 7, 15 ou 30 dias.`;

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

export const AGENTE_LOGO_READY_CHECK = `Você é um verificador de fluxo para criação de logos.

Analise a conversa entre usuário e assistente e determine se TODAS as informações essenciais para criar o logo já foram coletadas:
- Nome completo da marca
- Mercado/segmento de atuação
- Estilo da marca (tradicional/séria, jovem/descontraída, minimalista/futurista, maximalista/sensorial)
- Cores desejadas (ou autorização para escolher automaticamente)

Responda APENAS em JSON válido:
{"ready": true, "missing": []}

Se faltar algo, ready deve ser false e missing deve listar os itens faltantes (ex.: ["cores", "estilo"]).`;

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

export const AGENTE_6_GERADOR_TEXTO = `Você é um Gerente de Redes Sociais para Pequenas e Médias Empresas Brasileiras. Seu foco principal é organizar a Criação de Legendas de Posts e Criar Prompts para IA (criação de legendas para postagens nas redes sociais com CTA, criação de prompts para geração de imagens IA, criação de descrições, criação de títulos para postagens).

REGRAS DE ESTILO:
- Ser extremamente objetivo e prático em suas respostas;
- Sempre oferecer sugestões de melhoria ou alteração de estilo de resposta ao entregar os resultados gerados;
- Ao gerar prompts, fazê-los PRONTOS para que possam ser copiados e colados diretamente em uma IA de geração de imagens ou vídeos;
- Durante a criação de legendas para redes sociais, respeitar o limite de caracteres das plataformas.

FORMATO DE RESPOSTA (JSON válido):
{
  "texto": "Texto principal gerado",
  "sugestoes": ["Sugestão 1", "Sugestão 2", "Sugestão 3"],
  "prompt": "Prompt pronto para IA (quando aplicável)"
}

Se o tipo de conteúdo for "Prompt para IA", use "texto" como um resumo da ideia e coloque o prompt completo em "prompt". Caso contrário, "prompt" deve ser null.`;

export const AGENTE_7_GERADOR_POSTS_IMAGEM = `Você é um Agente de Social Media para Pequenas e Médias Empresas Brasileiras. Seu foco principal é criar IMAGENS para produtos e posts (imagens promocionais, imagens de produto com fundo clean, imagens para redes sociais, imagens para campanhas de datas comemorativas, imagens para divulgação do negócio).

Você deve, sempre que necessário, fazer perguntas para esclarecer as necessidades do cliente.

REGRAS DE ESTILO:
- Produza sempre imagens de alta qualidade, estilo 4K FULL HD.
- Sempre adapte as imagens de acordo com o estilo escolhido pelo cliente nas respostas fornecidas.
- Perguntar se o cliente deseja deixar espaço vago para a inserção de logotipo no canto inferior direito. Caso sim, deixar espaço em branco.
- Produzir as imagens no formato escolhido pelo cliente.

RESPONDA APENAS EM JSON válido.
NÃO inclua nenhum texto antes ou depois do JSON.
NÃO use markdown:
{
  "prompt": "Prompt final pronto para geração de imagem",
  "perguntas": ["Pergunta 1", "Pergunta 2"],
  "observacoes": "Notas rápidas sobre escolhas visuais"
}

Se houver perguntas essenciais, preencha "perguntas" (até 3) e deixe "prompt" como string vazia.`;

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

function normalizeSystemPrompt(prompt) {
  const cleaned = (prompt ?? "").trim();
  if (!cleaned) {
    console.warn("[AI] system prompt vazio. Usando fallback.");
    return DEFAULT_SYSTEM_PROMPT;
  }
  return cleaned;
}

function interpolatePrompt(prompt, vars) {
  if (!vars) return prompt;
  let result = prompt;
  for (const [key, value] of Object.entries(vars)) {
    const safeValue = value ?? "";
    result = result
      .replaceAll(`\${${key}}`, safeValue)
      .replaceAll(`{${key}}`, safeValue);
  }
  return result;
}

function normalizeMessages(messages) {
  const filtered = (messages || []).filter(
    (m) => m && (m.role === "user" || m.role === "assistant") && m.content
  );
  if (!filtered.some((m) => m.role === "user")) {
    console.warn("[AI] Nenhuma mensagem de usuário encontrada. Inserindo fallback.");
    filtered.unshift({
      role: "user",
      content: "Por favor, continue com base no contexto fornecido.",
    });
  }
  return filtered;
}

function toDebugText(value, maxChars = MAX_DEBUG_CHARS) {
  const raw = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (raw.length <= maxChars) return raw;
  return `${raw.substring(0, maxChars)}...`;
}

export async function executarAgente(options) {
  const {
    agente,
    systemPrompt,
    messages,
    requireJson = false,
    maxTokens = 4096,
    temperature = 0.7,
    promptVars,
    debugTag = "callAgent",
    failSafeMessage = DEFAULT_FAILSAFE_MESSAGE,
    preferHighQuality = false,
  } = options;

  const interpolatedPrompt = interpolatePrompt(systemPrompt, promptVars);
  const finalPrompt = normalizeSystemPrompt(interpolatedPrompt);
  const normalizedMessages = normalizeMessages(messages);
  const effectiveRequireJson = requireJson || JSON_AGENTS.has(agente);
  const finalFailSafeMessage =
    effectiveRequireJson && failSafeMessage === DEFAULT_FAILSAFE_MESSAGE
      ? "{}"
      : failSafeMessage;

  console.log(`[AI] ${debugTag} prompt`, toDebugText(finalPrompt));
  console.log(
    `[AI] ${debugTag} messages`,
    toDebugText([{ role: "system", content: finalPrompt }, ...normalizedMessages])
  );

  try {
    const content = await executarAgenteRouter({
      agente,
      systemPrompt: finalPrompt,
      messages: normalizedMessages,
      requireJson: effectiveRequireJson,
      maxTokens,
      temperature,
      preferHighQuality,
    });
    return content;
  } catch (error) {
    console.error(`[AI] ${debugTag} exception`, error);
    return finalFailSafeMessage;
  }
}

export async function validateWithAgent(content) {
  const contentStr = typeof content === "string" ? content : JSON.stringify(content);

  if (contentStr.trim().length < 3) {
    return { ok: true, score: 90, problemas: [] };
  }

  try {
    const result = await executarAgente({
      agente: "AGENTE_5_VALIDADOR",
      systemPrompt: AGENTE_5_VALIDADOR,
      messages: [
        {
          role: "user",
          content: `Valide o seguinte conteúdo:\n\n${contentStr.substring(0, 2000)}`,
        },
      ],
      requireJson: true,
      maxTokens: 512,
      temperature: 0.1,
      debugTag: "validator",
      failSafeMessage: "{}",
    });

    const parsed = safeParseJSON(result, {});
    const aprovado = parsed.aprovado === true;
    const score = typeof parsed.score === "number" ? parsed.score : aprovado ? 90 : 60;
    const problemas = Array.isArray(parsed.problemas) ? parsed.problemas : [];
    const sugestoes = typeof parsed.sugestoes === "string" ? parsed.sugestoes : null;
    const motivo_rejeicao =
      typeof parsed.motivo_rejeicao === "string" ? parsed.motivo_rejeicao : null;
    return {
      ok: aprovado,
      score,
      problemas,
      sugestoes,
      motivo_rejeicao,
    };
  } catch {
    return {
      ok: true,
      score: 80,
      problemas: [],
      sugestoes: "Validação indisponível",
    };
  }
}

export function buildSystemContext(profile, materialsContext) {
  if (!profile && !materialsContext) return "";

  const segmento = profile?.segmento_atuacao || profile?.segmento || "Não informado";
  const objetivo =
    profile?.objetivo_principal || profile?.objetivos_marketing || "Não informado";
  const publico = profile?.publico_alvo || "Não informado";
  const tom = profile?.tom_comunicacao || "Não informado";
  const marca = profile?.marca_descricao || profile?.diferenciais || "Não informado";
  const canais =
    (profile?.canais_atuacao || profile?.redes_sociais || []).join?.(", ") ||
    "Não informado";
  const conteudo = (profile?.tipo_conteudo || []).join?.(", ") || "Não informado";
  const nivel = profile?.nivel_experiencia || "Não informado";
  const desafio = profile?.maior_desafio || profile?.desafios || "Não informado";
  const usoIa = profile?.uso_ia || "Não informado";

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

  const profileContext = profile ? `\n\nContexto da empresa:\n${profileLines}` : "";
  const materialsSection = materialsContext
    ? `\n\nMATERIAIS FORNECIDOS PELO CLIENTE:\n${materialsContext}`
    : "";

  return `${profileContext}${materialsSection}`;
}

export function renderBusinessPrompt(basePrompt, profile, materialsContext) {
  const base = normalizeSystemPrompt(basePrompt);
  const context = buildSystemContext(profile, materialsContext);
  return `${base}${context}`;
}

export function safeParseJSON(text, fallback) {
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}





