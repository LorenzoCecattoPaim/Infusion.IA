/**
 * @typedef {"pending" | "approved" | "failed"} PaymentStatus
 */

/**
 * @typedef {Object} PaymentOrder
 * @property {string} id
 * @property {string} user_id
 * @property {number} credits
 * @property {number} amount_cents
 * @property {PaymentStatus} status
 * @property {string} gateway
 * @property {string | null} gateway_order_id
 * @property {string | null} gateway_payment_url
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} CreatePaymentLinkInput
 * @property {string} orderId
 * @property {number} amountCents
 * @property {number} credits
 * @property {{ name?: string, email?: string, phone_number?: string } | null} customer
 * @property {string} baseUrl
 */

/**
 * @typedef {Object} CreatePaymentLinkResult
 * @property {string} paymentUrl
 * @property {string} gatewayOrderId
 */

/**
 * @typedef {Object} GatewayProvider
 * @property {(input: CreatePaymentLinkInput) => Promise<CreatePaymentLinkResult>} createPaymentLink
 */

export {};
