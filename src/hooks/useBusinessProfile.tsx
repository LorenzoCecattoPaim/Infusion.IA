import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";

type BusinessProfileRow =
  Database["public"]["Tables"]["business_profiles"]["Row"];
type BusinessProfileInsert =
  Database["public"]["Tables"]["business_profiles"]["Insert"];
type BusinessProfileUpdate =
  Database["public"]["Tables"]["business_profiles"]["Update"];
export type BusinessProfile = Partial<BusinessProfileRow>;

const LOCAL_PROFILE_KEY = "infusion_business_profile";

function readLocalProfile(): BusinessProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as BusinessProfile) : null;
  } catch (err) {
    console.error("[BusinessProfile] Falha ao ler localStorage", err);
    return null;
  }
}

function writeLocalProfile(profile: BusinessProfile | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!profile) {
      window.localStorage.removeItem(LOCAL_PROFILE_KEY);
      return;
    }
    window.localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.error("[BusinessProfile] Falha ao gravar localStorage", err);
  }
}

export function useBusinessProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const localFallback = readLocalProfile();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["business_profile", user?.id],
    queryFn: async () => {
      if (!user) return localFallback;
      try {
        const { data } = await supabase
          .from("business_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle() as { data: { id: string } | null };
        if (data) {
          writeLocalProfile(data as BusinessProfile);
        }
        return (data as BusinessProfile | null) ?? localFallback;
      } catch (err) {
        console.error("[BusinessProfile] Erro ao carregar perfil", err);
        return localFallback;
      }
    },
    enabled: !!user,
    initialData: localFallback ?? null,
  });

  const persistProfile = async (updates: BusinessProfileUpdate) => {
    const currentLocal = readLocalProfile() || {};
    const merged = { ...currentLocal, ...updates } as BusinessProfile;
    writeLocalProfile(merged);

    if (!user) return;
    const { data: existing } = await supabase
      .from("business_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("business_profiles")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        } as BusinessProfileUpdate)
        .eq("user_id", user.id);
    } else {
      await supabase
        .from("business_profiles")
        .insert({ ...updates, user_id: user.id } as BusinessProfileInsert);
    }

    queryClient.invalidateQueries({ queryKey: ["business_profile", user.id] });
  };

  return { profile: profile as BusinessProfile | null, isLoading, persistProfile };
}
