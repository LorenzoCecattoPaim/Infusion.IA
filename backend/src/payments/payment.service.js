import "./payment.types.js";
import {
  createOrder,
  updateOrderStatus,
  findById,
  findByGatewayId,
  findByTransactionNsu,
  findByUserAndId,
} from "./payment.repository.js";
import { addCredits } from "./credits.service.js";
import { logPayment } from "./payment.logger.js";
import {
  buildSyntheticVerifyPayload,
  extractGatewayFields,
  normalizePaymentStatus,
} from "./payment.utils.js";

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

async function processWebhook({
  supabase,
  payload,
  gateway = "infinitepay",
  gatewayProvider,
}) {
  const {
    orderNsu,
    gatewayOrderId,
    transactionNsu,
    paidAmount,
    rawStatus,
    captureMethod,
  } = extractGatewayFields(payload);
  const normalizedStatus = normalizePaymentStatus(payload);

  if (!orderNsu && !gatewayOrderId && !transactionNsu) {
    console.warn("[PAYMENTS] webhook sem identificadores");
    return { success: false, message: "Identificadores ausentes" };
  }

  let order = null;

  if (orderNsu) {
    order = await findById({ supabase, orderId: orderNsu });
  }

  if (!order && gatewayOrderId) {
    order = await findByGatewayId({
      supabase,
      gateway,
      gatewayOrderId,
    });
  }

  if (!order && transactionNsu) {
    order = await findByTransactionNsu({
      supabase,
      transactionNsu,
    });
  }

  if (!order) {
    logPayment({
      event: "payment.not_found",
      gateway,
      orderId: orderNsu,
      status: "error",
      metadata: { gatewayOrderId, transactionNsu, rawStatus },
    });

    return { success: false, message: "Pedido não encontrado" };
  }

  logPayment({
    event: "webhook.received",
    gateway,
    orderId: order.id,
    userId: order.user_id,
    status: normalizedStatus,
    amount: paidAmount,
    metadata: {
      rawStatus,
      gatewayOrderId,
      transactionNsu,
    },
  });

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

  const updated = await updateOrderStatus({
    supabase,
    orderId: order.id,
    status: normalizedStatus,
    gatewayOrderId: gatewayOrderId || order.gateway_order_id,
    transactionNsu: transactionNsu || order.transaction_nsu,
    gatewayStatus: rawStatus || normalizedStatus,
    paidAmount,
    captureMethod,
    webhookPayload: payload,
  });

  if (!updated) {
    return { success: true, message: null };
  }

  if (normalizedStatus !== "approved") {
    logPayment({
      event: "payment.status_updated",
      gateway,
      orderId: order.id,
      userId: order.user_id,
      status: normalizedStatus,
      amount: paidAmount,
      metadata: {
        gatewayOrderId,
        transactionNsu,
        rawStatus,
      },
    });

    return { success: true, message: null };
  }

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
    amount: paidAmount,
    metadata: {
      invoice_slug: gatewayOrderId,
      transaction_nsu: transactionNsu,
      capture_method: captureMethod,
      rawStatus,
    },
  });

  return { success: true, message: null };
}

async function getPaymentStatus({ supabase, orderId, userId }) {
  const order = await findByUserAndId({ supabase, userId, orderId });
  if (!order) {
    return null;
  }

  return order.status || "pending";
}

async function verifyPayment({
  supabase,
  orderId,
  userId,
  query,
  gateway = "infinitepay",
  gatewayProvider,
}) {
  const order = await findByUserAndId({ supabase, userId, orderId });
  if (!order) return null;

  if (order.status === "approved") {
    return {
      orderId: order.id,
      status: "approved",
      paymentUrl: order.gateway_payment_url,
      credits: Number(order.credits || 0),
    };
  }

  const syntheticPayload = buildSyntheticVerifyPayload(order.id, query);
  const shouldAttemptRecovery =
    normalizePaymentStatus(syntheticPayload) === "approved" &&
    (syntheticPayload.transaction_nsu ||
      syntheticPayload.invoice_slug ||
      Number(syntheticPayload.paid_amount) > 0);

  if (shouldAttemptRecovery) {
    await processWebhook({
      supabase,
      payload: syntheticPayload,
      gateway,
      gatewayProvider,
    });
  }

  const refreshed = await findByUserAndId({ supabase, userId, orderId });

  return {
    orderId: refreshed.id,
    status: refreshed.status || "pending",
    paymentUrl: refreshed.gateway_payment_url,
    credits: Number(refreshed.credits || 0),
  };
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
  verifyPayment,
  retryPayment,
};
