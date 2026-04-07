import { useQuery } from "@tanstack/react-query";
import { fetchFunctions } from "@/lib/apiBase";
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
    queryKey: ["dashboard_stats", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const res = await fetchFunctions("/dashboard-stats");
      if (!res.ok) throw new Error("Erro ao carregar resumo.");
      const data = await res.json();
      return {
        posts_generated: data.posts_generated ?? 0,
        images_generated: data.images_generated ?? 0,
        logos_generated: data.logos_generated ?? 0,
        credits: data.credits ?? 0,
      } as DashboardSummary;
    },
    enabled: !!user,
  });

  return { summary: data, isLoading };
}
