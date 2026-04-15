import "./payment.types.js";
import {
  createOrder,
  updateOrderStatus,
  findById,
  findByGatewayId,
} from "./payment.repository.js";
import { addCredits } from "./credits.service.js";
import { logPayment } from "./payment.logger.js";

/* =========================
   💳 CREATE PAYMENT
========================= */
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
    gatewayOrderId: link.gatewayOrderId,
    gatewayPaymentUrl: link.paymentUrl,
  });

  logPayment({
    event: "payment.created",
    gateway,
    orderId: order.id,
    userId,
    status: "pending",
    amount: amountCents,
  });

  return {
    orderId: order.id,
    paymentUrl: updated?.gateway_payment_url || link.paymentUrl,
    status: updated?.status || "pending",
  };
}

/* =========================
   🔔 PROCESS WEBHOOK
========================= */
async function processWebhook({
  supabase,
  payload,
  gateway = "infinitepay",
  gatewayProvider,
}) {
  const orderId = payload?.order_nsu || null;
  const gatewayOrderId = payload?.invoice_slug || null;

  const isApproved = gatewayProvider?.isApprovedWebhook
    ? gatewayProvider.isApprovedWebhook(payload)
    : Number(payload?.paid_amount ?? payload?.amount ?? 0) > 0;

  if (!isApproved) {
    logPayment({
      event: "webhook.ignored",
      gateway,
      orderId,
      status: "ignored",
      metadata: {
        reason: "paid_amount_zero_or_missing",
      },
    });

    return { success: false, message: "Pagamento não confirmado" };
  }

  if (!orderId && !gatewayOrderId) {
    console.warn("[PAYMENTS] webhook sem identificadores");
    return { success: false, message: "Identificadores ausentes" };
  }

  let order = null;

  if (orderId) {
    order = await findById({ supabase, orderId });
  }

  if (!order && gatewayOrderId) {
    order = await findByGatewayId({
      supabase,
      gateway,
      gatewayOrderId,
    });
  }

  if (!order) {
    logPayment({
      event: "payment.not_found",
      gateway,
      orderId,
      status: "error",
      metadata: { gatewayOrderId },
    });

    return { success: false, message: "Pedido não encontrado" };
  }

  // 🛡️ Idempotência forte
  if (order.status === "approved") {
    logPayment({
      event: "payment.already_processed",
      gateway,
      orderId: order.id,
      userId: order.user_id,
      status: "approved",
    });

    return { success: true, message: null };
  }

  // 🔒 Atualização segura (evita race condition)
  const updated = await updateOrderStatus({
    supabase,
    orderId: order.id,
    status: "approved",
    gatewayOrderId: gatewayOrderId || order.gateway_order_id,
  });

  if (!updated) {
    // outro processo aprovou antes
    return { success: true, message: null };
  }

  // 💰 Crédito (executa apenas 1 vez garantido)
  const creditResult = await addCredits({
    supabase,
    userId: order.user_id,
    amount: Number(order.credits || 0),
    reason: "payment-approved",
  });

  if (!creditResult.ok) {
    logPayment({
      event: "credits.error",
      gateway,
      orderId: order.id,
      userId: order.user_id,
      status: "error",
      metadata: {
        credits: order.credits,
      },
    });
  }

  logPayment({
    event: "payment.approved",
    gateway,
    orderId: order.id,
    userId: order.user_id,
    status: "approved",
    amount: payload?.paid_amount,
    metadata: {
      invoice_slug: gatewayOrderId,
      transaction_nsu: payload?.transaction_nsu,
      capture_method: payload?.capture_method,
    },
  });

  return { success: true, message: null };
}

/* =========================
   🔎 STATUS
========================= */
async function getPaymentStatus({ supabase, orderId, userId }) {
  const order = await findById({ supabase, orderId });

  if (!order || (userId && order.user_id !== userId)) {
    return null;
  }

  return order.status || "pending";
}

/* =========================
   🔁 RETRY PAYMENT
========================= */
async function retryPayment({
  supabase,
  gatewayProvider,
  orderId,
  userId,
  appBaseUrl,
  gateway = "infinitepay",
}) {
  if (!userId) {
    throw new Error("userId é obrigatório");
  }

  const order = await findById({ supabase, orderId });

  if (!order || order.user_id !== userId) {
    return null;
  }

  if (order.status === "approved") {
    return {
      status: "approved",
      paymentUrl: order.gateway_payment_url,
    };
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

  logPayment({
    event: "payment.retry",
    gateway,
    orderId: order.id,
    userId: order.user_id,
    status: "pending",
  });

  return {
    status: updated?.status || "pending",
    paymentUrl: updated?.gateway_payment_url || link.paymentUrl,
  };
}

export {
  createPayment,
  processWebhook,
  getPaymentStatus,
  retryPayment,
};