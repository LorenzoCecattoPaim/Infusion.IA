export async function isReplay(supabase, eventId) {
  if (!eventId) return false;

  try {
    const { data } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();

    if (data) return true;

    await supabase.from("webhook_events").insert({
      id: eventId,
    });

    return false;
  } catch (error) {
    console.warn("[WEBHOOK] replay store indisponível", error?.message || error);
    return false;
  }
}
