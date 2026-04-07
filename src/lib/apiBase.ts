import { getAuthToken } from "@/lib/auth";

const DEFAULT_API_BASE = "https://infusion-ia.onrender.com";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function buildBaseUrl(): string {
  return normalizeBaseUrl(DEFAULT_API_BASE);
}

export async function fetchFunctions(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = buildBaseUrl();
  const headers = new Headers(init?.headers || {});
  const token = getAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const mergedInit = { ...init, headers };
  return fetch(`${base}${normalizedPath}`, mergedInit);
}
