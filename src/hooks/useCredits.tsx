import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useCredits() {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["credits", user?.id],
    queryFn: async () => {
      if (!user) return { credits: 0, plan: "free" };
      const { data, error } = await supabase
        .from("user_credits")
        .select("credits, plan")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 1000 * 30,
  });

  return {
    credits: data?.credits ?? 0,
    plan: data?.plan ?? "free",
    isLoading,
    refetch,
  };
}
