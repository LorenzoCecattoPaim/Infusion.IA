import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { fetchFunctions } from "@/lib/apiBase";

export type BusinessProfile = Record<string, unknown>;

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
        const res = await fetchFunctions("/profile");
        if (!res.ok) return localFallback;
        const data = await res.json();
        if (data.profile) {
          writeLocalProfile(data.profile as BusinessProfile);
        }
        return (data.profile as BusinessProfile | null) ?? localFallback;
      } catch (err) {
        console.error("[BusinessProfile] Erro ao carregar perfil", err);
        return localFallback;
      }
    },
    enabled: !!user,
    initialData: localFallback ?? null,
  });

  const persistProfile = async (updates: BusinessProfile) => {
    const currentLocal = readLocalProfile() || {};
    const merged = { ...currentLocal, ...updates } as BusinessProfile;
    writeLocalProfile(merged);

    if (!user) return;
    await fetchFunctions("/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(updates),
    });

    queryClient.invalidateQueries({ queryKey: ["business_profile", user.id] });
  };

  return { profile: profile as BusinessProfile | null, isLoading, persistProfile };
}
