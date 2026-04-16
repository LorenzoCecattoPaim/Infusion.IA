function sanitizeInfinitePayHandle(handle) {
  return String(handle || "")
    .trim()
    .replace(/\$/g, "")
    .replace(/\s+/g, "");
}

function validateInfinitePayEnv({
  baseUrl,
  handle,
  webhookSecret,
  logger = console,
}) {
  const normalizedHandle = sanitizeInfinitePayHandle(handle);
  let valid = true;

  if (baseUrl !== "https://api.infinitepay.io") {
    logger.warn(
      "[InfinitePay] INFINITEPAY_BASE_URL inválido. Esperado: https://api.infinitepay.io | Atual:",
      baseUrl || null
    );
    valid = false;
  }

  if (!normalizedHandle) {
    logger.warn("[InfinitePay] INFINITEPAY_HANDLE ausente ou inválido após sanitização.");
    valid = false;
  } else {
    if (String(handle || "").trim() !== normalizedHandle) {
      logger.warn("[InfinitePay] INFINITEPAY_HANDLE continha '$' e/ou espaços e será sanitizado.");
    }

    if (/\$/.test(normalizedHandle) || /\s/.test(normalizedHandle)) {
      logger.warn("[InfinitePay] INFINITEPAY_HANDLE permaneceu inválido após sanitização:", normalizedHandle);
      valid = false;
    }
  }

  if (!String(webhookSecret || "").trim()) {
    logger.warn("[InfinitePay] INFINITEPAY_WEBHOOK_SECRET ausente.");
    valid = false;
  }

  return {
    valid,
    normalizedHandle,
  };
}

export { sanitizeInfinitePayHandle, validateInfinitePayEnv };
