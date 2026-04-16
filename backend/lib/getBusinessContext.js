const BUSINESS_CONTEXT_TTL_MS = 5 * 60 * 1000;

const businessContextCache = new Map();

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asJoinedText(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item))
      .filter(Boolean)
      .join(", ");
  }
  return asString(value);
}

function normalizeBusinessContext(profile) {
  if (!profile) return null;

  return {
    nome: asString(profile.nome_empresa),
    nicho: asString(profile.segmento_atuacao),
    publicoAlvo: asString(profile.publico_alvo),
    tomDeVoz: asString(profile.tom_comunicacao),
    objetivos: asString(profile.objetivo_principal),
    produtos: asJoinedText(
      profile.produtos ??
        profile.servicos ??
        profile.tipo_conteudo ??
        profile.contexto_json?.produtos ??
        profile.contexto_json?.servicos
    ),
    diferenciais: asString(profile.marca_descricao),
  };
}

export async function getBusinessContext(userId, supabase) {
  if (!userId || !supabase) return null;

  const cached = businessContextCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  try {
    const { data, error } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      businessContextCache.delete(userId);
      return null;
    }

    const context = normalizeBusinessContext(data);
    businessContextCache.set(userId, {
      data: context,
      expires: Date.now() + BUSINESS_CONTEXT_TTL_MS,
    });

    return context;
  } catch (error) {
    console.warn("[BUSINESS_CONTEXT] indisponivel", error?.message || error);
    return null;
  }
}

export function clearBusinessContextCache(userId) {
  if (!userId) return;
  businessContextCache.delete(userId);
}
