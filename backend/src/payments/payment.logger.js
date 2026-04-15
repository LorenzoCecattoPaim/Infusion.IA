export function logPayment({
  event,
  orderId,
  userId,
  status,
  amount,
  gateway,
  metadata = {},
}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      orderId,
      userId,
      status,
      amount,
      gateway,
      ...metadata,
    })
  );
}