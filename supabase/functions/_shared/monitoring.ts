// Monitoring utilities for Edge Functions

export interface LogEntry {
  function: string;
  user_id: string;
  action: string;
  status: "success" | "error";
  credits_used?: number;
  error?: string;
  duration_ms?: number;
}

export function log(entry: LogEntry): void {
  console.log(JSON.stringify({ ...entry, timestamp: new Date().toISOString() }));
}

export function logError(functionName: string, userId: string, error: unknown): void {
  console.error(
    JSON.stringify({
      function: functionName,
      user_id: userId,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    })
  );
}
