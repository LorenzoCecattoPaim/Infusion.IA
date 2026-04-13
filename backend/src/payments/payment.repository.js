import "./payment.types.js";

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
}) {
  const updates = {
    status,
  };

  if (gatewayOrderId) updates.gateway_order_id = gatewayOrderId;
  if (gatewayPaymentUrl) updates.gateway_payment_url = gatewayPaymentUrl;

  const { data, error } = await supabase
    .from("payment_orders")
    .update(updates)
    .eq("id", orderId)
    .neq("status", "approved")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || null;
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
  const { data, error } = await supabase
    .from("payment_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export { createOrder, updateOrderStatus, findByGatewayId, findById };
