// supabase/functions/_shared/deno.ts
// Centraliza o import do `serve` para evitar erros do TS em projetos não-Deno.

// @ts-ignore - import remoto é resolvido pelo runtime do Deno/Supabase Edge
export { serve } from "std/http";
