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
    event: "payment.created",
    gateway,
    orderId: order.id,
    userId,
    status: "pending",
    amount: amountCents,
    metadata: {
      gateway_order_id: link.gatewayOrderId || null,
      invoice_slug: link.invoiceSlug || null,
      transaction_nsu: link.transactionNsu || null,
    },
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
    orderUuid,
    invoiceSlug,
    transactionNsu,
    paidAmount,
    rawStatus,
    captureMethod,
  } = extractGatewayFields(payload);

  const normalizedStatus = normalizePaymentStatus(payload);

  if (!orderUuid && !invoiceSlug && !transactionNsu) {
    console.warn("[PAYMENTS] webhook sem identificadores");
    return { success: false, message: "Identificadores ausentes" };
  }

  let order = null;

  // FIX: busca primária por UUID interno (order_nsu = order.id)
  // Esse é o campo que a InfinitePay devolve no webhook como order_nsu
  if (orderUuid) {
    order = await findById({ supabase, orderId: orderUuid });
  }

  // Fallback 1: busca por invoice_slug (preenchido na criação do link)
  if (!order && invoiceSlug) {
    order = await findByInvoiceSlug({ supabase, gateway, invoiceSlug });
  }

  // Fallback 2: busca por transaction_nsu (pode ter sido salvo de webhook anterior)
  if (!order && transactionNsu) {
    order = await findByTransactionNsu({ supabase, transactionNsu });
  }

  if (!order) {
    logPayment({
      event: "payment.not_found",
      gateway,
      orderId: orderUuid || null,
      status: "error",
      metadata: {
        invoice_slug: invoiceSlug || null,
        transaction_nsu: transactionNsu || null,
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
      lookup_order_uuid: orderUuid || null,
      invoice_slug: order.invoice_slug || invoiceSlug || null,
      transaction_nsu: order.transaction_nsu || transactionNsu || null,
    },
  });

  // FIX: idempotência por transaction_nsu — evita reprocessar o mesmo evento
  // Só bloqueia se o pedido JÁ está aprovado E tem o mesmo transaction_nsu
  if (
    order.status === "approved" &&
    order.credited_at &&
    transactionNsu &&
    order.transaction_nsu === transactionNsu
  ) {
    logPayment({
      event: "payment.already_processed",
      gateway,
      orderId: order.id,
      userId: order.user_id,
      status: "approved",
      metadata: { transaction_nsu: transactionNsu },
    });
    return { success: true, message: null };
  }

  // Idempotência por credited_at — independente do transaction_nsu
  if (order.status === "approved" && order.credited_at) {
    logPayment({
      event: "payment.already_processed",
      gateway,
      orderId: order.id,
      userId: order.user_id,
      status: "approved",
      metadata: { rawStatus },
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
    metadata: { rawStatus, invoiceSlug, transactionNsu },
  });

  // Atualiza o pedido com dados do webhook
  const updated = await updateOrderStatus({
    supabase,
    orderId: order.id,
    status: normalizedStatus,
    gatewayOrderId: invoiceSlug || order.invoice_slug,
    invoiceSlug: invoiceSlug || order.invoice_slug,
    transactionNsu: transactionNsu || order.transaction_nsu,
    gatewayStatus: rawStatus || normalizedStatus,
    paidAmount,
    captureMethod,
    webhookPayload: payload,
  });

  // Se update retornou null, o pedido já foi aprovado por outro processo (race condition)
  if (!updated) {
    const refreshed = await findById({ supabase, orderId: order.id });
    if (refreshed?.credited_at) {
      logPayment({
        event: "payment.already_processed",
        gateway,
        orderId: order.id,
        userId: order.user_id,
        status: refreshed.status || normalizedStatus,
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
      metadata: { invoiceSlug, transactionNsu, rawStatus },
    });
    return { success: true, message: null };
  }

  // Dupla checagem antes de creditar (evita race condition com verifyPayment)
  if (updated.credited_at) {
    logPayment({
      event: "payment.already_processed",
      gateway,
      orderId: order.id,
      userId: order.user_id,
      status: "approved",
      metadata: { rawStatus, transactionNsu },
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
      metadata: { credits: order.credits },
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
      invoice_slug: invoiceSlug,
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
  if (!order) return null;
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
  if (!userId) throw new Error("userId é obrigatório");

  const order = await findById({ supabase, orderId });

  if (!order || order.user_id !== userId) return null;

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

export { createPayment, processWebhook, getPaymentStatus, verifyPayment, retryPayment };
