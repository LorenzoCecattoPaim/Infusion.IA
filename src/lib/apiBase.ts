const IS_BROWSER = typeof window !== "undefined";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function resolveRelativeUrl(url: string): string {
  if (!IS_BROWSER) return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  return url;
}

function buildCandidates(): string[] {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const candidates = [apiUrl, supabaseUrl]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => normalizeBaseUrl(resolveRelativeUrl(value.trim())));

  return Array.from(new Set(candidates));
}

export function getFunctionsBaseUrlCandidates(): string[] {
  return buildCandidates();
}

export function getFunctionsBaseUrl(): string {
  const candidates = buildCandidates();
  if (!candidates.length) {
    const message =
      "Nenhuma URL de API configurada. Defina VITE_API_URL ou VITE_SUPABASE_URL no .env.";
    console.error("[API] Base URL ausente.", message);
    throw new Error(message);
  }
  return candidates[0];
}

export async function fetchFunctions(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const candidates = buildCandidates();
  if (!candidates.length) {
    const message =
      "Nenhuma URL de API configurada. Defina VITE_API_URL ou VITE_SUPABASE_URL no .env.";
    console.error("[API] Base URL ausente.", message);
    throw new Error(message);
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  let mergedInit = init;

  if (anonKey) {
    const headers = new Headers(init?.headers || {});
    if (!headers.has("apikey")) {
      headers.set("apikey", anonKey);
    }
    mergedInit = { ...init, headers };
  }
  let lastError: unknown = null;

  for (const base of candidates) {
    try {
      return await fetch(`${base}${normalizedPath}`, mergedInit);
    } catch (error) {
      console.error("[API] Falha ao conectar", { base, path: normalizedPath, error });
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Falha ao conectar com a API.");
}
