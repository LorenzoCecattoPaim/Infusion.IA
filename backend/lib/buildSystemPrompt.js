function buildContextLines(ctx) {
  const lines = [
    ["Nome", ctx?.nome],
    ["Nicho", ctx?.nicho],
    ["Publico-alvo", ctx?.publicoAlvo],
    ["Tom de voz", ctx?.tomDeVoz],
    ["Objetivos", ctx?.objetivos],
    ["Produtos", ctx?.produtos],
    ["Diferenciais", ctx?.diferenciais],
  ]
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([label, value]) => `- ${label}: ${value.trim()}`);

  return lines.length ? `CONTEXTO DO NEGOCIO:\n${lines.join("\n")}\n\n` : "";
}

export function buildSystemPrompt(role, ctx) {
  const businessContext = buildContextLines(ctx);

  return `
Você é ${role}.

${businessContext}REGRAS OBRIGATÓRIAS:

* NÃO pergunte nenhuma informação listada acima
* Personalize TODAS as respostas com base nesses dados
* Se um campo estiver vazio (""), ignore-o silenciosamente
* Só pergunte algo se for estritamente necessário e não estiver acima
  `.trim();
}
