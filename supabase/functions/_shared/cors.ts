// supabase/functions/_shared/cors.ts

export const corsHeaders = {
  "Access-Control-Allow-Origin": "https://infusion-ia.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function optionsResponse(): Response {
  return new Response("ok", {
    status: 200,
    headers: corsHeaders,
  });
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: HeadersInit = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=UTF-8",
      ...extraHeaders,
    },
  });
}

export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message || "Erro interno" }, status);
}
