import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface DashboardSummary {
  credits: number;
  images_generated: number;
  posts_generated: number;
  logos_generated: number;
}

export function useDashboardStats() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["user_summary", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_summary")
        .select("credits, images_generated, posts_generated, logos_generated")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as DashboardSummary | null;
    },
    enabled: !!user,
  });

  return { summary: data, isLoading };
}
