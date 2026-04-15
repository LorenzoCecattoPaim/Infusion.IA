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
  const attempts = 3;
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
    // CAS falhou por race condition — tenta novamente
  }

  // FIX: após todas as tentativas sem débito confirmado, retorna ok: false
  // Evita falso positivo de retornar ok: true sem garantir que debitou
  const refreshed = await ensureCreditsRow(supabase, userId);
  console.warn(
    JSON.stringify({
      event: "credits_consume_failed",
      userId,
      amount,
      reason,
      credits: refreshed.credits,
      reason_detail: "max_attempts_reached",
    })
  );
  return {
    ok: false,
    credits: Number(refreshed.credits || 0),
    plan: refreshed.plan || "free",
  };
}

async function addCredits({ supabase, userId, amount, reason }) {
  const attempts = 3;
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
    // CAS falhou — tenta novamente
  }

  // FIX: retorna ok: false se não conseguiu confirmar o crédito
  const refreshed = await ensureCreditsRow(supabase, userId);
  console.warn(
    JSON.stringify({
      event: "credits_add_failed",
      userId,
      amount,
      reason,
      credits: refreshed.credits,
      reason_detail: "max_attempts_reached",
    })
  );
  return {
    ok: false,
    credits: Number(refreshed.credits || 0),
    plan: refreshed.plan || "free",
  };
}

export { DEFAULT_FREE_CREDITS, ensureCreditsRow, consumeCredits, addCredits };
