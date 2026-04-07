import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { fetchFunctions } from "@/lib/apiBase";

export function useCredits() {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["credits", user?.id],
    queryFn: async () => {
      if (!user) return { credits: 0, plan: "free" };
      const res = await fetchFunctions("/credits");
      if (!res.ok) throw new Error("Erro ao carregar créditos.");
      const data = await res.json();
      return { credits: data.credits ?? 0, plan: data.plan ?? "free" };
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
