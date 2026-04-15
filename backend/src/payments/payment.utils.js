function normalizePaymentStatus(payload) {
  const statusCandidates = [
    payload?.status,
    payload?.payment_status,
    payload?.paymentStatus,
    payload?.invoice_status,
    payload?.invoiceStatus,
    payload?.current_status,
  ]
    .map((value) => (value == null ? "" : String(value).trim().toLowerCase()))
    .filter(Boolean);

  const paidAmount = Number(payload?.paid_amount ?? payload?.amount_paid ?? 0);

  if (
    statusCandidates.some((status) =>
      ["paid", "approved", "aprovado", "succeeded", "success", "completed"].includes(status)
    ) ||
    paidAmount > 0
  ) {
    return "approved";
  }

  if (
    statusCandidates.some((status) =>
      ["pending", "waiting_payment", "awaiting_payment", "processing", "in_process"].includes(status)
    )
  ) {
    return "pending";
  }

  if (
    statusCandidates.some((status) =>
      ["cancelled", "canceled", "expired", "refused", "failed", "chargeback"].includes(status)
    )
  ) {
    return "cancelled";
  }

  return "pending";
}

function extractGatewayFields(payload) {
  return {
    orderNsu:
      payload?.order_nsu ||
      payload?.orderId ||
      payload?.order_id ||
      payload?.merchant_order_id ||
      null,
    gatewayOrderId:
      payload?.orderNsu ||
      payload?.orderNSU ||
      payload?.checkout_id ||
      payload?.checkoutId ||
      null,
    invoiceSlug:
      payload?.invoice_slug ||
      payload?.invoiceSlug ||
      null,
    transactionNsu:
      payload?.transaction_nsu ||
      payload?.transactionId ||
      payload?.transaction_id ||
      payload?.nsu ||
      null,
    paidAmount: Number(payload?.paid_amount ?? payload?.amount_paid ?? payload?.amount ?? 0) || 0,
    rawStatus:
      payload?.status ||
      payload?.payment_status ||
      payload?.invoice_status ||
      null,
    captureMethod: payload?.capture_method || null,
  };
}

function buildSyntheticVerifyPayload(orderId, query = {}) {
  return {
    order_nsu: orderId,
    invoice_slug: query.invoice_slug || query.invoiceSlug || null,
    transaction_nsu: query.transaction_nsu || query.transactionNsu || null,
    paid_amount: query.paid_amount || query.paidAmount || query.amount_paid || query.amount || 0,
    status: query.status || query.payment_status || null,
    capture_method: query.capture_method || null,
  };
}

export { normalizePaymentStatus, extractGatewayFields, buildSyntheticVerifyPayload };
