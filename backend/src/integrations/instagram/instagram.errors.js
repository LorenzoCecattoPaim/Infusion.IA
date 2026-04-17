class InstagramError extends Error {
  constructor(message, { code = "INSTAGRAM_ERROR", status = 500, details = null } = {}) {
    super(message);
    this.name = "InstagramError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function isTokenExpiredError(error) {
  return error?.code === "TOKEN_EXPIRED";
}

export { InstagramError, isTokenExpiredError };
