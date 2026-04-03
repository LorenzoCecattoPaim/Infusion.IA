// supabase/functions/_shared/monitoring.ts

export interface LogEntry {
  function: string;
  user_id?: string;
  action: string;
  status: "ok" | "error" | "warn";
  duration_ms?: number;
  meta?: Record<string, unknown>;
  error?: string;
}

export function log(entry: LogEntry) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
  });
  // Supabase captura stdout dos Edge Functions nos logs
  console.log(line);
}

export function timer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

export function errorResponse(message: string, status = 500, extra?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ error: message, ...extra }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}
