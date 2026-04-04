import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

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
      const { data, error } = await supabase
        .from("generated_images")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as GeneratedImage[];
    },
    enabled: !!user,
  });

  return { generatedImages, isLoading };
}
