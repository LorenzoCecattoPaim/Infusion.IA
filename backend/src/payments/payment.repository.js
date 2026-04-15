import "./payment.types.js";

function isMissingColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("column") && message.includes("does not exist");
}

function extractMissingColumnName(error) {
  const message = String(error?.message || "");
  const quotedMatch = message.match(/["'`](.+?)["'`]/);
  if (quotedMatch?.[1]) return quotedMatch[1];

  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)/i);
  return plainMatch?.[1] || null;
}

async function selectSingle(query) {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function applyOrderPatch({ supabase, orderId, patch, allowApprovedTransition = false }) {
  const sanitizedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );

  if (!Object.keys(sanitizedPatch).length) {
    return findById({ supabase, orderId });
  }

  try {
    let query = supabase.from("payment_orders").update(sanitizedPatch).eq("id", orderId);
    if (!allowApprovedTransition) {
      query = query.neq("status", "approved");
    }

    const { data, error } = await query.select("*").maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    const missingColumn = extractMissingColumnName(error);

    const supportedEntries = Object.entries(sanitizedPatch).filter(
      ([key]) => key !== missingColumn
    );

    if (supportedEntries.length === Object.keys(sanitizedPatch).length) {
      throw error;
    }

    return applyOrderPatch({
      supabase,
      orderId,
      patch: Object.fromEntries(supportedEntries),
      allowApprovedTransition,
    });
  }
}

async function createOrder({ supabase, userId, credits, amountCents, status, gateway }) {
  const { data, error } = await supabase
    .from("payment_orders")
    .insert({
      user_id: userId,
      credits,
      amount_cents: amountCents,
      status,
      gateway,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function updateOrderStatus({
  supabase,
  orderId,
  status,
  gatewayOrderId,
  gatewayPaymentUrl,
  transactionNsu,
  gatewayStatus,
  paidAmount,
  captureMethod,
  webhookPayload,
}) {
  return applyOrderPatch({
    supabase,
    orderId,
    patch: {
      status,
      gateway_order_id: gatewayOrderId,
      gateway_payment_url: gatewayPaymentUrl,
      transaction_nsu: transactionNsu,
      gateway_status: gatewayStatus,
      paid_amount_cents: paidAmount,
      capture_method: captureMethod,
      last_webhook_payload: webhookPayload,
      last_webhook_received_at: webhookPayload ? new Date().toISOString() : undefined,
    },
  });
}

async function findByGatewayId({ supabase, gateway, gatewayOrderId }) {
  const { data, error } = await supabase
    .from("payment_orders")
    .select("*")
    .eq("gateway", gateway)
    .eq("gateway_order_id", gatewayOrderId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function findById({ supabase, orderId }) {
  return selectSingle(
    supabase.from("payment_orders").select("*").eq("id", orderId)
  );
}

async function findByTransactionNsu({ supabase, transactionNsu }) {
  if (!transactionNsu) return null;

  try {
    return await selectSingle(
      supabase.from("payment_orders").select("*").eq("transaction_nsu", transactionNsu)
    );
  } catch (error) {
    if (isMissingColumnError(error)) return null;
    throw error;
  }
}

async function findByUserAndId({ supabase, userId, orderId }) {
  return selectSingle(
    supabase
      .from("payment_orders")
      .select("*")
      .eq("id", orderId)
      .eq("user_id", userId)
  );
}

export {
  createOrder,
  updateOrderStatus,
  findByGatewayId,
  findById,
  findByTransactionNsu,
  findByUserAndId,
};
