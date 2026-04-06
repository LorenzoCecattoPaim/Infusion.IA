import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard_stats", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const [posts, images, logos, credits] = await Promise.all([
        supabase
          .from("generated_posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("generated_images")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("generated_logos")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("user_credits")
          .select("credits")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (posts.error) throw posts.error;
      if (images.error) throw images.error;
      if (logos.error) throw logos.error;
      if (credits.error) throw credits.error;

      return {
        posts_generated: posts.count ?? 0,
        images_generated: images.count ?? 0,
        logos_generated: logos.count ?? 0,
        credits: credits.data?.credits ?? 0,
      } as DashboardSummary;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard_stats", user.id] });
    };

    const channel = supabase
      .channel(`dashboard-stats-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generated_posts", filter: `user_id=eq.${user.id}` },
        invalidate
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generated_images", filter: `user_id=eq.${user.id}` },
        invalidate
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generated_logos", filter: `user_id=eq.${user.id}` },
        invalidate
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_credits", filter: `user_id=eq.${user.id}` },
        invalidate
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, user]);

  return { summary: data, isLoading };
}
