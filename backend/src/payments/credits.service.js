const DEFAULT_FREE_CREDITS = 100;

async function ensureCreditsRow(supabase, userId) {
  const { data, error } = await supabase
    .from("user_credits")
    .select("credits, plan")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: created, error: insertError } = await supabase
      .from("user_credits")
      .insert({ user_id: userId, credits: DEFAULT_FREE_CREDITS, plan: "free" })
      .select("credits, plan")
      .single();
    if (insertError) throw insertError;
    return created;
  }

  return data;
}

async function consumeCredits({ supabase, userId, amount, reason }) {
  const attempts = 2;
  for (let i = 0; i < attempts; i += 1) {
    const current = await ensureCreditsRow(supabase, userId);
    const available = Number(current.credits || 0);

    if (available < amount) {
      return { ok: false, credits: available, plan: current.plan || "free" };
    }

    const next = available - amount;
    const { data, error } = await supabase
      .from("user_credits")
      .update({ credits: next })
      .eq("user_id", userId)
      .eq("credits", available)
      .select("credits, plan")
      .maybeSingle();

    if (error) throw error;

    if (data) {
      console.log(
        JSON.stringify({
          event: "credits_consume",
          userId,
          amount,
          reason,
          credits: data.credits,
        })
      );
      return { ok: true, credits: data.credits, plan: data.plan || "free" };
    }
  }

  const refreshed = await ensureCreditsRow(supabase, userId);
  return {
    ok: Number(refreshed.credits || 0) >= amount,
    credits: Number(refreshed.credits || 0),
    plan: refreshed.plan || "free",
  };
}

async function addCredits({ supabase, userId, amount, reason }) {
  const attempts = 2;
  for (let i = 0; i < attempts; i += 1) {
    const current = await ensureCreditsRow(supabase, userId);
    const available = Number(current.credits || 0);

    const next = available + amount;
    const { data, error } = await supabase
      .from("user_credits")
      .update({ credits: next })
      .eq("user_id", userId)
      .eq("credits", available)
      .select("credits, plan")
      .maybeSingle();

    if (error) throw error;

    if (data) {
      console.log(
        JSON.stringify({
          event: "credits_add",
          userId,
          amount,
          reason,
          credits: data.credits,
        })
      );
      return { ok: true, credits: data.credits, plan: data.plan || "free" };
    }
  }

  const refreshed = await ensureCreditsRow(supabase, userId);
  return {
    ok: true,
    credits: Number(refreshed.credits || 0),
    plan: refreshed.plan || "free",
  };
}

export { DEFAULT_FREE_CREDITS, ensureCreditsRow, consumeCredits, addCredits };
