// supabase/functions/_shared/deno.ts
// Centraliza o import do `serve` para evitar erros do TS em projetos nao-Deno.

// @ts-ignore - import remoto e resolvido pelo runtime do Deno/Supabase Edge
export { serve } from "std/http";
