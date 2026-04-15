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
      console.log(JSON.stringify({ event: "credits_consume", userId, amount, reason, credits: data.credits }));
      return { ok: true, credits: data.credits, plan: data.plan || "free" };
    }
  }

  const refreshed = await ensureCreditsRow(supabase, userId);
  console.warn(JSON.stringify({ event: "credits_consume_failed", userId, amount, reason, credits: refreshed.credits, reason_detail: "max_attempts_reached" }));
  return { ok: false, credits: Number(refreshed.credits || 0), plan: refreshed.plan || "free" };
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
      console.log(JSON.stringify({ event: "credits_add", userId, amount, reason, credits: data.credits }));
      return { ok: true, credits: data.credits, plan: data.plan || "free" };
    }
  }

  const refreshed = await ensureCreditsRow(supabase, userId);
  console.warn(JSON.stringify({ event: "credits_add_failed", userId, amount, reason, credits: refreshed.credits, reason_detail: "max_attempts_reached" }));
  return { ok: false, credits: Number(refreshed.credits || 0), plan: refreshed.plan || "free" };
}

/**
 * FIX: Fallback de crédito com garantia atômica melhorada.
 *
 * PROBLEMA ORIGINAL: o fallback (quando o RPC apply_payment_credits falha)
 * fazia: (1) addCredits, (2) marca credited_at. Se o processo morria entre
 * os dois passos, o usuário tinha crédito mas credited_at era null — na
 * próxima tentativa creditava de novo.
 *
 * SOLUÇÃO: o path principal usa a stored procedure `apply_payment_credits`
 * que faz tudo em uma única transação atômica. O fallback manual continua
 * existindo para quando o RPC não está disponível, mas agora:
 *   - Verifica credited_at ANTES de chamar addCredits
 *   - Só marca credited_at em update com .is("credited_at", null) — se
 *     outro processo já marcou, retorna applied: false sem duplicar
 */
async function addPaymentCredits({ supabase, orderId, userId, amount }) {
  const normalizedAmount = Math.trunc(Number(amount || 0));

  if (!orderId) throw new Error("orderId é obrigatório para creditar pagamento");
  if (!userId) throw new Error("userId é obrigatório para creditar pagamento");
  if (normalizedAmount <= 0) throw new Error("amount deve ser maior que zero");

  // Caminho primário: stored procedure atômica (idempotente via payment_credit_ledger)
  try {
    const { data, error } = await supabase.rpc("apply_payment_credits", {
      p_order_id: orderId,
      p_user_id: userId,
      p_amount: normalizedAmount,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row === "object") {
      return {
        ok: true,
        applied: Boolean(row.applied),
        credits: Number(row.credits || 0),
      };
    }
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    // Só cai no fallback se o RPC em si não existe — outros erros relançam
    if (!message.includes("apply_payment_credits") && !message.includes("could not find")) {
      throw error;
    }

    console.warn(JSON.stringify({
      event: "credits_apply_payment_rpc_unavailable",
      orderId, userId, amount: normalizedAmount,
      message: error?.message || null,
    }));
  }

  // Caminho de fallback: sem stored procedure disponível
  // FIX: verifica credited_at ANTES de creditar — evita duplicação
  const { data: orderCheck, error: orderError } = await supabase
    .from("payment_orders")
    .select("credited_at")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) throw orderError;

  if (orderCheck?.credited_at) {
    const current = await ensureCreditsRow(supabase, userId);
    return { ok: true, applied: false, credits: Number(current.credits || 0) };
  }

  // Tenta marcar credited_at ANTES de adicionar créditos
  // .is("credited_at", null) garante que só um processo vence a corrida
  const { data: markedOrder, error: markError } = await supabase
    .from("payment_orders")
    .update({ credited_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("credited_at", null)
    .select("id")
    .maybeSingle();

  if (markError) throw markError;

  if (!markedOrder) {
    // Outro processo ganhou a corrida — não credita
    console.warn(JSON.stringify({
      event: "credits_apply_payment_fallback_race_lost",
      orderId, userId, amount: normalizedAmount,
    }));
    const current = await ensureCreditsRow(supabase, userId);
    return { ok: true, applied: false, credits: Number(current.credits || 0) };
  }

  // credited_at marcado com sucesso — agora adiciona os créditos
  const creditResult = await addCredits({
    supabase,
    userId,
    amount: normalizedAmount,
    reason: "payment-approved-fallback",
  });

  if (!creditResult.ok) {
    // Rollback: limpa credited_at para que a próxima tentativa possa tentar
    await supabase
      .from("payment_orders")
      .update({ credited_at: null })
      .eq("id", orderId);

    console.error(JSON.stringify({
      event: "credits_apply_payment_fallback_add_failed",
      orderId, userId, amount: normalizedAmount,
    }));

    return { ok: false, applied: false, credits: creditResult.credits };
  }

  return { ok: true, applied: true, credits: Number(creditResult.credits || 0) };
}

export { DEFAULT_FREE_CREDITS, ensureCreditsRow, consumeCredits, addCredits, addPaymentCredits };
