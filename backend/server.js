import express from "express";
import cors from "cors";
import { Readable } from "node:stream";

const app = express();

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : "*";

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info"],
  })
);
app.use(express.json({ limit: "5mb" }));

const SUPABASE_URL = process.env.SUPABASE_URL;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required");
}

app.get("/health", (_req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json({ ok: true });
});

app.all("/functions/v1/:fn", async (req, res) => {
  const targetUrl = `${SUPABASE_URL}/functions/v1/${req.params.fn}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    headers.set(key, Array.isArray(value) ? value.join(",") : value);
  }

  const method = req.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
  });

  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-encoding") return;
    if (key.toLowerCase() === "content-type") {
      const lower = value.toLowerCase();
      if ((lower.includes("application/json") || lower.includes("+json")) && !lower.includes("charset=")) {
        res.setHeader(key, `${value}; charset=utf-8`);
        return;
      }
    }
    res.setHeader(key, value);
  });

  if (!upstream.body) {
    res.end();
    return;
  }

  Readable.fromWeb(upstream.body).pipe(res);
});

const port = Number(process.env.PORT || 10000);
app.listen(port, () => {
  console.log(`Backend proxy listening on ${port}`);
});
