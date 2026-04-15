import "./payment.types.js";
import {
  createOrder,
  markOrderCredited,
  updateOrderStatus,
  findByGatewayId,
  findByInvoiceSlug,
  findById,
  findByTransactionNsu,
  findByUserAndId,
} from "./payment.repository.js";
import { addPaymentCredits } from "./credits.service.js";
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
    status: link.status || "pending",
    gatewayOrderId: link.gatewayOrderId,
    invoiceSlug: link.invoiceSlug,
    gatewayPaymentUrl: link.paymentUrl,
    transactionNsu: link.transactionNsu,
  });

  logPayment({
    event: "payment.gateway_linked",
    gateway,
    orderId: order.id,
    userId,
    status: updated?.status || "pending",
    amount: amountCents,
    metadata: {
      gateway_order_id: link.gatewayOrderId || null,
      invoice_slug: link.invoiceSlug || null,
      transaction_nsu: link.transactionNsu || null,
    },
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
    invoiceSlug,
    transactionNsu,
    paidAmount,
    rawStatus,
    captureMethod,
  } = extractGatewayFields(payload);
  const normalizedStatus = normalizePaymentStatus(payload);

  if (!orderNsu && !gatewayOrderId && !invoiceSlug && !transactionNsu) {
    console.warn("[PAYMENTS] webhook sem identificadores");
    return { success: false, message: "Identificadores ausentes" };
  }

  let order = null;

  if (orderNsu) {
    order = await findByGatewayId({
      supabase,
      gateway,
      gatewayOrderId: orderNsu,
    });
  }

  if (!order && invoiceSlug) {
    order = await findByInvoiceSlug({
      supabase,
      gateway,
      invoiceSlug,
    });
  }

  if (!order && gatewayOrderId && gatewayOrderId !== orderNsu) {
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
      event: "webhook.order_not_found",
      gateway,
      orderId: orderNsu || null,
      status: "error",
      amount: paidAmount,
      metadata: {
        gateway_order_id: gatewayOrderId || null,
        invoice_slug: invoiceSlug || null,
        transaction_nsu: transactionNsu || null,
        rawStatus,
      },
    });

    logPayment({
      event: "payment.not_found",
      gateway,
      orderId: orderNsu,
      status: "error",
      metadata: {
        gatewayOrderId,
        invoiceSlug,
        transactionNsu,
        rawStatus,
      },
    });

    return { success: false, message: "Pedido não encontrado" };
  }

  logPayment({
    event: "webhook.order_found",
    gateway,
    orderId: order.id,
    userId: order.user_id,
    status: order.status || "pending",
    amount: paidAmount,
    metadata: {
      lookup_order_nsu: orderNsu || null,
      gateway_order_id: order.gateway_order_id || gatewayOrderId || null,
      invoice_slug: order.invoice_slug || invoiceSlug || null,
      transaction_nsu: order.transaction_nsu || transactionNsu || null,
    },
  });

  if (transactionNsu && order.transaction_nsu && order.transaction_nsu === transactionNsu) {
    logPayment({
      event: "webhook.replay_detected",
      gateway,
      orderId: order.id,
      userId: order.user_id,
      status: order.status || normalizedStatus,
      amount: paidAmount,
      metadata: {
        transaction_nsu: transactionNsu,
      },
    });
    return { success: true, message: null };
  }

  if (order.status === "approved" && order.credited_at) {
    logPayment({
      event: "payment.already_processed",
      gateway,
      orderId: order.id,
      userId: order.user_id,
      status: "approved",
      amount: paidAmount,
      metadata: {
        transaction_nsu: transactionNsu || order.transaction_nsu || null,
        rawStatus,
      },
    });
    return { success: true, message: null };
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
      gatewayOrderId: orderNsu || gatewayOrderId || order.gateway_order_id || null,
      invoiceSlug,
      transactionNsu,
    },
  });

  const updated = await updateOrderStatus({
    supabase,
    orderId: order.id,
    status: normalizedStatus,
    gatewayOrderId: orderNsu || gatewayOrderId || order.gateway_order_id,
    invoiceSlug: invoiceSlug || order.invoice_slug,
    transactionNsu: transactionNsu || order.transaction_nsu,
    gatewayStatus: rawStatus || normalizedStatus,
    paidAmount,
    captureMethod,
    webhookPayload: payload,
  });

  if (!updated) {
    const refreshedOrder = await findById({ supabase, orderId: order.id });
    if (refreshedOrder?.credited_at) {
      logPayment({
        event: "payment.already_processed",
        gateway,
        orderId: order.id,
        userId: order.user_id,
        status: refreshedOrder.status || normalizedStatus,
      });
    }
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
        gatewayOrderId: orderNsu || gatewayOrderId || order.gateway_order_id || null,
        invoiceSlug,
        transactionNsu,
        rawStatus,
      },
    });

    return { success: true, message: null };
  }

  if (updated.credited_at) {
    logPayment({
      event: "payment.already_processed",
      gateway,
      orderId: order.id,
      userId: order.user_id,
      status: "approved",
      amount: paidAmount,
      metadata: {
        rawStatus,
        transactionNsu,
      },
    });

    return { success: true, message: null };
  }

  const creditResult = await addPaymentCredits({
    supabase,
    orderId: order.id,
    userId: order.user_id,
    amount: Number(order.credits || 0),
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

    return { success: false, message: "Falha ao creditar usuário" };
  }

  if (creditResult.applied) {
    await markOrderCredited({ supabase, orderId: order.id });
  }

  logPayment({
    event: "payment.approved",
    gateway,
    orderId: order.id,
    userId: order.user_id,
    status: "approved",
    amount: paidAmount,
    metadata: {
      invoice_slug: invoiceSlug || gatewayOrderId,
      gateway_order_id: orderNsu || gatewayOrderId || order.gateway_order_id || null,
      transaction_nsu: transactionNsu,
      capture_method: captureMethod,
      rawStatus,
      creditsApplied: creditResult.applied,
      currentCredits: creditResult.credits,
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
    invoiceSlug: link.invoiceSlug,
    gatewayPaymentUrl: link.paymentUrl,
    transactionNsu: link.transactionNsu,
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
