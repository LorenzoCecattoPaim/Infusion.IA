import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface BusinessProfile {
  id?: string;
  user_id?: string;
  nome_empresa?: string | null;
  segmento?: string | null;
  porte?: string | null;
  publico_alvo?: string | null;
  diferenciais?: string | null;
  desafios?: string | null;
  tom_comunicacao?: string | null;
  concorrentes?: string | null;
  objetivos_marketing?: string | null;
  redes_sociais?: string[] | null;
  orcamento_mensal?: string | null;
}

export function useBusinessProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["business_profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle() as { data: { id: string } | null };
      return data as BusinessProfile | null;
    },
    enabled: !!user,
  });

  const persistProfile = async (updates: Partial<BusinessProfile>) => {
    if (!user) return;
    const { data: existing } = await supabase
      .from("business_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("business_profiles")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
    } else {
      await supabase
        .from("business_profiles")
        .insert({ ...updates, user_id: user.id });
    }

    queryClient.invalidateQueries({ queryKey: ["business_profile", user.id] });
  };

  return { profile, isLoading, persistProfile };
}
