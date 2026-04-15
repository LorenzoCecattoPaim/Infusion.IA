import "./payment.types.js";
import { createOrder, updateOrderStatus, findById, findByGatewayId } from "./payment.repository.js";
import { addCredits } from "./credits.service.js";

function logPaymentEvent({ event, gateway, orderId, userId, status, extra }) {
  console.log(
    JSON.stringify({
      event,
      gateway,
      orderId,
      userId,
      status,
      ...extra,
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
  appBaseUrl,
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
    appBaseUrl,
  });

  const updated = await updateOrderStatus({
    supabase,
    orderId: order.id,
    status: "pending",
    gatewayOrderId: link.gatewayOrderId, // null no momento da criação — preenchido pelo webhook
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

async function processWebhook({ supabase, payload, gateway = "infinitepay", gatewayProvider }) {
  const orderId = payload?.order_nsu || null;
  const gatewayOrderId = payload?.invoice_slug || null;

  // FIX: A InfinitePay NÃO envia campo "status" no webhook.
  // O webhook só é disparado quando o pagamento é aprovado.
  // Usamos isApprovedWebhook do gateway para validar pela presença de paid_amount > 0.
  const isApproved = gatewayProvider?.isApprovedWebhook
    ? gatewayProvider.isApprovedWebhook(payload)
    : Number(payload?.paid_amount ?? payload?.amount ?? 0) > 0;

  if (!isApproved) {
    console.warn(
      JSON.stringify({
        event: "webhook_ignored",
        gateway,
        orderId,
        gatewayOrderId,
        reason: "paid_amount_zero_or_missing",
      })
    );
    return { success: false, message: "Pagamento não confirmado" };
  }

  if (!orderId && !gatewayOrderId) {
    console.warn("[PAYMENTS] webhook sem order_nsu nem invoice_slug");
    return { success: false, message: "Identificadores do pedido ausentes" };
  }

  // Busca por orderId (ID interno) primeiro, fallback por gatewayOrderId
  let order = null;

  if (orderId) {
    order = await findById({ supabase, orderId });
  }

  if (!order && gatewayOrderId) {
    order = await findByGatewayId({ supabase, gateway, gatewayOrderId });
  }

  if (!order) {
    console.warn("[PAYMENTS] pedido não encontrado", { orderId, gatewayOrderId });
    return { success: false, message: "Pedido não encontrado" };
  }

  if (order.status === "approved") {
    // Idempotência: já processado
    return { success: true, message: null };
  }

  const updated = await updateOrderStatus({
    supabase,
    orderId: order.id,
    status: "approved",
    gatewayOrderId: gatewayOrderId || order.gateway_order_id,
  });

  if (!updated) {
    // Race condition: outro processo aprovou antes — idempotente
    return { success: true, message: null };
  }

  const creditResult = await addCredits({
    supabase,
    userId: order.user_id,
    amount: Number(order.credits || 0),
    reason: "payment-approved",
  });

  if (!creditResult.ok) {
    console.error(
      JSON.stringify({
        event: "credits_add_error",
        gateway,
        orderId: order.id,
        userId: order.user_id,
        credits: order.credits,
        reason: "add_credits_failed_after_approval",
      })
    );
  }

  logPaymentEvent({
    event: "payment_approved",
    gateway,
    orderId: order.id,
    userId: order.user_id,
    status: "approved",
    extra: {
      invoice_slug: gatewayOrderId,
      transaction_nsu: payload?.transaction_nsu || null,
      capture_method: payload?.capture_method || null,
      paid_amount: payload?.paid_amount || null,
    },
  });

  return { success: true, message: null };
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
  appBaseUrl,
  gateway = "infinitepay",
}) {
  if (!userId) {
    throw new Error("userId é obrigatório para retryPayment");
  }

  const order = await findById({ supabase, orderId });
  if (!order || order.user_id !== userId) {
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
    appBaseUrl,
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
