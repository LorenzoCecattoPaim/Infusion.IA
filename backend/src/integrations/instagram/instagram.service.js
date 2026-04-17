import { createClient } from "@supabase/supabase-js";

import { InstagramError } from "./instagram.errors.js";

const META_API_VERSION = "v18.0";
const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const META_AUTH_BASE_URL = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth`;
const META_SCOPES = [
  "instagram_basic",
  "pages_show_list",
  "instagram_content_publish",
  "pages_read_engagement",
];

/**
 * @typedef {Object} InstagramAccount
 * @property {string} igUserId
 * @property {string} username
 * @property {string} accessToken
 */

/**
 * @typedef {Object} PublishPostParams
 * @property {string} accessToken
 * @property {string} igUserId
 * @property {string} imageUrl
 * @property {string} caption
 */

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new InstagramError(`Variável de ambiente obrigatória ausente: ${name}`, {
      code: "CONFIG_ERROR",
      status: 500,
    });
  }
  return value;
}

function getSupabase() {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function buildOAuthState(userId, returnTo) {
  return Buffer.from(
    JSON.stringify({
      userId,
      returnTo: typeof returnTo === "string" ? returnTo : null,
    }),
    "utf8"
  ).toString("base64url");
}

function parseOAuthState(state) {
  if (!state || typeof state !== "string") {
    throw new InstagramError("State OAuth inválido.", {
      code: "INVALID_STATE",
      status: 400,
    });
  }

  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    return {
      userId: typeof parsed?.userId === "string" ? parsed.userId : null,
      returnTo: typeof parsed?.returnTo === "string" ? parsed.returnTo : null,
    };
  } catch (error) {
    throw new InstagramError("State OAuth inválido.", {
      code: "INVALID_STATE",
      status: 400,
      details: error,
    });
  }
}

function sanitizeReturnTo(returnTo) {
  if (typeof returnTo !== "string" || !returnTo.trim()) return null;

  try {
    const parsed = new URL(returnTo);
    return parsed.origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function getAuthUrl(userId, returnTo = null) {
  const appId = getRequiredEnv("META_APP_ID");
  const redirectUri = getRequiredEnv("META_REDIRECT_URI");
  const url = new URL(META_AUTH_BASE_URL);

  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", META_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", buildOAuthState(userId, sanitizeReturnTo(returnTo)));

  return url.toString();
}

async function parseMetaResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  if (response.ok) return payload;

  const metaError = payload?.error;
  const code = metaError?.code === 190 ? "TOKEN_EXPIRED" : "META_API_ERROR";
  const message = metaError?.message || fallbackMessage;
  console.error("[Instagram] Meta API error", {
    status: response.status,
    code: metaError?.code ?? null,
    type: metaError?.type ?? null,
    message,
    error_subcode: metaError?.error_subcode ?? null,
    fbtrace_id: metaError?.fbtrace_id ?? null,
  });

  throw new InstagramError(message, {
    code,
    status: response.status || 502,
    details: payload,
  });
}

async function exchangeCodeForToken(code) {
  const appId = getRequiredEnv("META_APP_ID");
  const appSecret = getRequiredEnv("META_APP_SECRET");
  const redirectUri = getRequiredEnv("META_REDIRECT_URI");
  const url = new URL(`${META_GRAPH_BASE_URL}/oauth/access_token`);

  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const response = await fetch(url, { method: "GET" });
  const payload = await parseMetaResponse(response, "Não foi possível trocar o code pelo token do Instagram.");
  const accessToken = payload?.access_token;

  if (!accessToken) {
    throw new InstagramError("Token do Instagram não retornado no exchange OAuth.", {
      code: "META_API_ERROR",
      status: 502,
      details: payload,
    });
  }

  return accessToken;
}

async function getLongLivedTokenDetails(shortToken) {
  const appId = getRequiredEnv("META_APP_ID");
  const appSecret = getRequiredEnv("META_APP_SECRET");
  const url = new URL(`${META_GRAPH_BASE_URL}/oauth/access_token`);

  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortToken);

  const response = await fetch(url, { method: "GET" });
  const payload = await parseMetaResponse(response, "Não foi possível gerar o token de longa duração do Instagram.");
  const accessToken = payload?.access_token;

  if (!accessToken) {
    throw new InstagramError("Token de longa duração não retornado pela Meta.", {
      code: "META_API_ERROR",
      status: 502,
      details: payload,
    });
  }

  return {
    accessToken,
    expiresIn: Number(payload?.expires_in) || null,
  };
}

async function getLongLivedToken(shortToken) {
  const result = await getLongLivedTokenDetails(shortToken);
  return result.accessToken;
}

async function getInstagramAccounts(accessToken) {
  const url = new URL(`${META_GRAPH_BASE_URL}/me/accounts`);
  url.searchParams.set("fields", "instagram_business_account{id,username},access_token,name");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { method: "GET" });
  const payload = await parseMetaResponse(
    response,
    "Não foi possível listar as contas Instagram Business vinculadas."
  );

  const accounts = Array.isArray(payload?.data) ? payload.data : [];

  return accounts
    .filter((page) => page?.instagram_business_account?.id && page?.access_token)
    .map((page) => ({
      igUserId: String(page.instagram_business_account.id),
      username: String(page.instagram_business_account.username || page.name || ""),
      accessToken: String(page.access_token),
    }))
    .filter((account) => account.username);
}

async function upsertInstagramAccounts({ userId, accounts, tokenExpiresAt }) {
  if (!accounts.length) {
    throw new InstagramError("Nenhuma conta Instagram Business foi encontrada para este usuário.", {
      code: "NO_INSTAGRAM_ACCOUNT",
      status: 400,
    });
  }

  const supabase = getSupabase();
  const rows = accounts.map((account) => ({
    user_id: userId,
    ig_user_id: account.igUserId,
    username: account.username,
    access_token: account.accessToken,
    token_expires_at: tokenExpiresAt,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("integrations_instagram")
    .upsert(rows, { onConflict: "user_id,ig_user_id" })
    .select("id, user_id, ig_user_id, username, token_expires_at, created_at, updated_at");

  if (error) {
    console.error("[Instagram] Falha ao salvar integração", error);
    throw new InstagramError("Não foi possível salvar a integração do Instagram.", {
      code: "DATABASE_ERROR",
      status: 500,
      details: error,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function handleOAuthCallback(code, userId) {
  const shortToken = await exchangeCodeForToken(code);
  const { accessToken, expiresIn } = await getLongLivedTokenDetails(shortToken);
  const accounts = await getInstagramAccounts(accessToken);
  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  await upsertInstagramAccounts({
    userId,
    accounts,
    tokenExpiresAt,
  });

  return accounts[0];
}

async function publishPost({ accessToken, igUserId, imageUrl, caption }) {
  const createMediaUrl = new URL(`${META_GRAPH_BASE_URL}/${igUserId}/media`);
  createMediaUrl.searchParams.set("image_url", imageUrl);
  createMediaUrl.searchParams.set("caption", caption);
  createMediaUrl.searchParams.set("access_token", accessToken);

  const createResponse = await fetch(createMediaUrl, { method: "POST" });
  const createPayload = await parseMetaResponse(
    createResponse,
    "Não foi possível criar o container de mídia no Instagram."
  );
  const creationId = createPayload?.id;

  if (!creationId) {
    throw new InstagramError("A Meta não retornou o creation_id da mídia.", {
      code: "META_API_ERROR",
      status: 502,
      details: createPayload,
    });
  }

  const publishUrl = new URL(`${META_GRAPH_BASE_URL}/${igUserId}/media_publish`);
  publishUrl.searchParams.set("creation_id", creationId);
  publishUrl.searchParams.set("access_token", accessToken);

  const publishResponse = await fetch(publishUrl, { method: "POST" });
  const publishPayload = await parseMetaResponse(
    publishResponse,
    "Não foi possível publicar o post no Instagram."
  );
  const postId = publishPayload?.id;

  if (!postId) {
    throw new InstagramError("A Meta não retornou o identificador do post publicado.", {
      code: "META_API_ERROR",
      status: 502,
      details: publishPayload,
    });
  }

  return { postId: String(postId) };
}

export {
  getAuthUrl,
  handleOAuthCallback,
  exchangeCodeForToken,
  getLongLivedToken,
  getInstagramAccounts,
  publishPost,
  parseOAuthState,
  sanitizeReturnTo,
};
