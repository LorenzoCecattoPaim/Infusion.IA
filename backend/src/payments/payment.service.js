import "./payment.types.js";
import { createOrder, updateOrderStatus, findById } from "./payment.repository.js";
import { addCredits } from "./credits.service.js";

function logPaymentEvent({ event, gateway, orderId, userId, status }) {
  console.log(
    JSON.stringify({
      event,
      gateway,
      orderId,
      userId,
      status,
    })
  );
}

async function createPayment({
  supabase,
  gatewayProvider,
  userId,
  credits,
  amountCents,
  customer,
  baseUrl,
  gateway = "infinitepay",
}) {
  const order = await createOrder({
    supabase,
    userId,
    credits,
    amountCents,
    status: "pending",
    gateway,
  });

  const link = await gatewayProvider.createPaymentLink({
    orderId: order.id,
    amountCents,
    credits,
    customer,
    baseUrl,
  });

  const updated = await updateOrderStatus({
    supabase,
    orderId: order.id,
    status: "pending",
    gatewayOrderId: link.gatewayOrderId,
    gatewayPaymentUrl: link.paymentUrl,
  });

  logPaymentEvent({
    event: "payment_created",
    gateway,
    orderId: order.id,
    userId,
    status: "pending",
  });

  return {
    orderId: order.id,
    paymentUrl: updated?.gateway_payment_url || link.paymentUrl,
    status: updated?.status || "pending",
  };
}

async function processWebhook({ supabase, payload, gateway = "infinitepay" }) {
  const orderId = payload?.order_nsu || null;
  const gatewayOrderId = payload?.invoice_slug || null;

  if (!orderId) {
    console.warn("[PAYMENTS] webhook sem order_nsu");
    return;
  }

  const order = await findById({ supabase, orderId });
  if (!order) {
    console.warn("[PAYMENTS] pedido não encontrado", orderId);
    return;
  }

  if (order.status === "approved") {
    return;
  }

  const updated = await updateOrderStatus({
    supabase,
    orderId,
    status: "approved",
    gatewayOrderId: gatewayOrderId || order.gateway_order_id,
  });

  if (!updated) {
    return;
  }

  await addCredits({
    supabase,
    userId: order.user_id,
    amount: Number(order.credits || 0),
    reason: "payment-approved",
  });

  logPaymentEvent({
    event: "payment_approved",
    gateway,
    orderId,
    userId: order.user_id,
    status: "approved",
  });
}

async function getPaymentStatus({ supabase, orderId, userId }) {
  const order = await findById({ supabase, orderId });
  if (!order || (userId && order.user_id !== userId)) {
    return null;
  }
  return order.status || "pending";
}

async function retryPayment({
  supabase,
  gatewayProvider,
  orderId,
  userId,
  baseUrl,
  gateway = "infinitepay",
}) {
  const order = await findById({ supabase, orderId });
  if (!order || (userId && order.user_id !== userId)) {
    return null;
  }

  if (order.status === "approved") {
    return { status: "approved", paymentUrl: order.gateway_payment_url };
  }

  const link = await gatewayProvider.createPaymentLink({
    orderId: order.id,
    amountCents: Number(order.amount_cents || 0),
    credits: Number(order.credits || 0),
    customer: null,
    baseUrl,
  });

  const updated = await updateOrderStatus({
    supabase,
    orderId: order.id,
    status: "pending",
    gatewayOrderId: link.gatewayOrderId,
    gatewayPaymentUrl: link.paymentUrl,
  });

  logPaymentEvent({
    event: "payment_retry",
    gateway,
    orderId: order.id,
    userId: order.user_id,
    status: updated?.status || "pending",
  });

  return {
    status: updated?.status || "pending",
    paymentUrl: updated?.gateway_payment_url || link.paymentUrl,
  };
}

export { createPayment, processWebhook, getPaymentStatus, retryPayment };
