import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchFunctions } from "@/lib/apiBase";
import { useAuth } from "./useAuth";

export interface InstagramIntegrationAccount {
  id: string;
  ig_user_id: string;
  username: string;
  token_expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface InstagramAccountsResponse {
  accounts?: InstagramIntegrationAccount[];
}

interface InstagramConnectResponse {
  url?: string;
}

export function useInstagramIntegration() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ["instagram_accounts", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const response = await fetchFunctions("/integrations/instagram/accounts");
      const data = (await response.json().catch(() => ({}))) as InstagramAccountsResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar integração do Instagram.");
      }

      return Array.isArray(data.accounts) ? data.accounts : [];
    },
    enabled: !!user,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await fetchFunctions("/integrations/instagram/connect");
      const data = (await response.json().catch(() => ({}))) as InstagramConnectResponse & {
        error?: string;
      };

      if (!response.ok || !data.url) {
        throw new Error(data.error || "Erro ao iniciar conexão com o Instagram.");
      }

      window.location.assign(data.url);
    },
  });

  return {
    accounts: accountsQuery.data ?? [],
    error: accountsQuery.error,
    isLoading: accountsQuery.isLoading,
    refetch: accountsQuery.refetch,
    invalidate: () =>
      queryClient.invalidateQueries({
        queryKey: ["instagram_accounts", user?.id],
      }),
    connect: () => connectMutation.mutateAsync(),
    isConnecting: connectMutation.isPending,
    isConnected: (accountsQuery.data?.length ?? 0) > 0,
    primaryAccount: accountsQuery.data?.[0] ?? null,
  };
}
