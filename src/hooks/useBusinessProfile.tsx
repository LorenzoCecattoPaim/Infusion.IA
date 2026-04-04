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

  const persistProfile = async (updates: BusinessProfileUpdate) => {
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
