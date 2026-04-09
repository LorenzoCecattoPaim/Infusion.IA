import { supabase } from "@/integrations/supabase/client";

const ENV_API_BASE = (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL;
const DEFAULT_API_BASE = ENV_API_BASE || "https://infusion-ia.onrender.com";
const API_PREFIX = "/api";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function buildBaseUrl(): string {
  const base = normalizeBaseUrl(DEFAULT_API_BASE);
  if (base.endsWith(API_PREFIX)) return base;
  return `${base}${API_PREFIX}`;
}

function buildLegacyBaseUrl(): string {
  return normalizeBaseUrl(DEFAULT_API_BASE);
}

export async function fetchFunctions(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const headers = new Headers(init?.headers || {});
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const mergedInit = { ...init, headers };
  const primaryBase = buildBaseUrl();
  const primaryResponse = await fetch(`${primaryBase}${normalizedPath}`, mergedInit);

  if (primaryResponse.status !== 404) {
    return primaryResponse;
  }

  const legacyBase = buildLegacyBaseUrl();
  if (legacyBase === primaryBase) {
    return primaryResponse;
  }

  return fetch(`${legacyBase}${normalizedPath}`, mergedInit);
}
