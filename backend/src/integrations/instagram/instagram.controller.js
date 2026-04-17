import { InstagramError, isTokenExpiredError } from "./instagram.errors.js";
import {
  getAuthUrl,
  handleOAuthCallback,
  parseOAuthState,
  publishPost,
  sanitizeReturnTo,
} from "./instagram.service.js";

function buildSettingsRedirect(returnTo, status, message = null) {
  const fallbackBase =
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    "http://localhost:5173";
  const base = sanitizeReturnTo(returnTo) || fallbackBase.replace(/\/$/, "");
  const url = new URL("/configuracoes", base);
  url.searchParams.set("instagram", status);
  if (message) {
    url.searchParams.set("message", message);
  }
  return url.toString();
}

function mapInstagramError(error) {
  if (error instanceof InstagramError) return error;
  return new InstagramError("Erro interno ao processar integração do Instagram.", {
    code: "INSTAGRAM_ERROR",
    status: 500,
    details: error,
  });
}

function createInstagramController({ getSupabase, sendSuccess, sendError }) {
  return {
    async connect(req, res) {
      try {
        const userId = req.user?.id;
        if (!userId) return sendError(res, 401, "Token ausente.");

        const returnTo =
          req.headers.origin ||
          req.headers.referer ||
          process.env.APP_BASE_URL ||
          process.env.PUBLIC_BASE_URL ||
          null;

        const url = getAuthUrl(userId, returnTo);
        return sendSuccess(res, { url });
      } catch (error) {
        const normalized = mapInstagramError(error);
        console.error("[Instagram] connect", normalized);
        return sendError(res, normalized.status, normalized.message);
      }
    },

    async callback(req, res) {
      const { code, state, error, error_description: errorDescription } = req.query || {};

      let parsedState = { userId: null, returnTo: null };
      try {
        parsedState = parseOAuthState(String(state || ""));
      } catch (stateError) {
        const message = mapInstagramError(stateError).message;
        return res.redirect(302, buildSettingsRedirect(null, "error", message));
      }

      if (error) {
        const message = String(errorDescription || error || "Autorização do Instagram não concluída.");
        return res.redirect(302, buildSettingsRedirect(parsedState.returnTo, "error", message));
      }

      if (!code || typeof code !== "string") {
        return res.redirect(
          302,
          buildSettingsRedirect(parsedState.returnTo, "error", "Código OAuth do Instagram ausente.")
        );
      }

      if (!parsedState.userId) {
        return res.redirect(
          302,
          buildSettingsRedirect(parsedState.returnTo, "error", "Usuário inválido para integração do Instagram.")
        );
      }

      try {
        await handleOAuthCallback(code, parsedState.userId);
        return res.redirect(302, buildSettingsRedirect(parsedState.returnTo, "connected"));
      } catch (error) {
        const normalized = mapInstagramError(error);
        console.error("[Instagram] callback", normalized);
        return res.redirect(
          302,
          buildSettingsRedirect(parsedState.returnTo, "error", normalized.message)
        );
      }
    },

    async getAccounts(req, res) {
      try {
        const userId = req.user?.id;
        if (!userId) return sendError(res, 401, "Token ausente.");

        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("integrations_instagram")
          .select("id, ig_user_id, username, token_expires_at, created_at, updated_at")
          .eq("user_id", userId);

        if (error) throw error;

        return sendSuccess(res, {
          accounts: Array.isArray(data) ? data : [],
        });
      } catch (error) {
        const normalized = mapInstagramError(error);
        console.error("[Instagram] getAccounts", normalized);
        return sendError(res, normalized.status, "Erro ao carregar contas do Instagram.");
      }
    },

    async publish(req, res) {
      try {
        const userId = req.user?.id;
        if (!userId) return sendError(res, 401, "Token ausente.");

        const { igUserId, imageUrl, caption } = req.body || {};
        if (!igUserId || !imageUrl || typeof caption !== "string") {
          return sendError(res, 400, "igUserId, imageUrl e caption são obrigatórios.");
        }

        const supabase = getSupabase();
        const { data: integration, error } = await supabase
          .from("integrations_instagram")
          .select("ig_user_id, access_token")
          .eq("user_id", userId)
          .eq("ig_user_id", igUserId)
          .maybeSingle();

        if (error) throw error;
        if (!integration?.access_token) {
          return sendError(res, 404, "Conta do Instagram não encontrada.");
        }

        const result = await publishPost({
          accessToken: integration.access_token,
          igUserId: integration.ig_user_id,
          imageUrl: String(imageUrl),
          caption: String(caption),
        });

        return sendSuccess(res, result);
      } catch (error) {
        const normalized = mapInstagramError(error);
        console.error("[Instagram] publish", normalized);
        if (isTokenExpiredError(normalized)) {
          return res.status(401).json({ error: normalized.message, code: normalized.code });
        }
        return sendError(res, normalized.status, normalized.message);
      }
    },
  };
}

export { createInstagramController };
