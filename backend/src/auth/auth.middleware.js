function getBearerToken(req) {
  const raw =
    req.headers.authorization ||
    req.headers.Authorization ||
    req.headers["authorization"];

  if (!raw) return null;

  const header = Array.isArray(raw) ? raw.join(" ") : String(raw);
  const match = header.match(/^\s*Bearer\s+(.+)\s*$/i);
  if (!match) return null;

  return match[1].trim() || null;
}

function buildRequireAuth({ getSupabase, sendError }) {
  return async function requireAuth(req, res, next) {
    try {
      const token = getBearerToken(req);
      if (!token) return sendError(res, 401, "Token ausente.");

      const supabase = getSupabase();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        console.warn("[AUTH] jwt inválido", {
          path: req.originalUrl,
          error: error?.message || null,
        });
        return sendError(res, 401, "Token inválido ou expirado.");
      }

      console.log(
        JSON.stringify({
          event: "auth.jwt_validated",
          userId: user.id,
          path: req.originalUrl,
          method: req.method,
        })
      );

      req.user = user;
      req.accessToken = token;
      return next();
    } catch (error) {
      console.error("[AUTH] falha na autenticação", error);
      return sendError(res, 401, "Falha na autenticação.");
    }
  };
}

export { getBearerToken, buildRequireAuth };
