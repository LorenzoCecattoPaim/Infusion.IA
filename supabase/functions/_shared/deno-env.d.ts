// supabase/functions/_shared/deno-env.d.ts

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
}
