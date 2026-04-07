import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { fetchFunctions } from "@/lib/apiBase";

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  optimized_prompt: string | null;
  negative_prompt: string | null;
  quality: string;
  created_at: string;
}

export function useGeneratedImages() {
  const { user } = useAuth();

  const { data: generatedImages = [], isLoading } = useQuery({
    queryKey: ["generated_images", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const res = await fetchFunctions("/generated-images");
      if (!res.ok) throw new Error("Erro ao carregar imagens.");
      const data = await res.json();
      return (data.images || []) as GeneratedImage[];
    },
    enabled: !!user,
  });

  return { generatedImages, isLoading };
}
