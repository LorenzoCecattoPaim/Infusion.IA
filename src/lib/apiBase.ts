export function getFunctionsBaseUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return (apiUrl || supabaseUrl) as string;
}
