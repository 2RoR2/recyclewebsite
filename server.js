import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import process from "node:process";

const port = Number(process.env.PORT || 3000);
const distDir = resolve("dist");
const secret = process.env.JWT_SECRET || "dev-smart-recycle-secret-change-me";
const cookieName = "sr_session";
const startedAt = new Date().toISOString();
const appVersion = process.env.npm_package_version || "0.0.0";
const isProduction = process.env.NODE_ENV === "production";
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 32_768);
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 120);
const rateLimitStore = new Map();

if (isProduction && secret === "dev-smart-recycle-secret-change-me") {
  throw new Error("JWT_SECRET must be set before starting the production server.");
}

const users = [
  { id: 1, name: "Aina", email: "user@demo.com", password: "123456", role: "user" },
  { id: 2, name: "Admin", email: "admin@demo.com", password: "admin123", role: "admin" },
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
  ".otf": "font/otf",
};

const routeCategories = ["Paper", "Plastic", "Aluminium Can", "General Waste"];

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), geolocation=(self)",
  "Cross-Origin-Opener-Policy": "same-origin",
};

const base64url = (value) => Buffer.from(value).toString("base64url");

const sign = (data) => createHmac("sha256", secret).update(data).digest("base64url");

const createJwt = (payload) => {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 }));
  return `${header}.${body}.${sign(`${header}.${body}`)}`;
};

const verifyJwt = (token) => {
  const parts = token?.split(".");
  if (!parts || parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expected = sign(`${header}.${body}`);
  if (signature.length !== expected.length) return null;
  const valid = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return null;

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
};

const parseCookies = (cookieHeader = "") =>
  Object.fromEntries(cookieHeader.split(";").filter(Boolean).map((cookie) => {
    const [key, ...value] = cookie.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }));

const clientIp = (req) =>
  String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();

const checkRateLimit = (req) => {
  const key = `${clientIp(req)}:${req.url?.split("?")[0] || "/"}`;
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + rateLimitWindowMs });
    return { ok: true };
  }

  current.count += 1;
  if (current.count > rateLimitMax) {
    return { ok: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }

  return { ok: true };
};

const cleanRateLimitStore = () => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt <= now) rateLimitStore.delete(key);
  }
};

const sendJson = (res, status, data, headers = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(data));
};

const readBody = async (req) => {
  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of req) {
    receivedBytes += chunk.length;
    if (receivedBytes > maxBodyBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
};

const cookieOptions = () => [
  "HttpOnly",
  "SameSite=Lax",
  "Path=/",
  "Max-Age=28800",
  isProduction ? "Secure" : "",
].filter(Boolean).join("; ");

const handleApi = async (req, res, url) => {
  const rateLimit = checkRateLimit(req);
  if (!rateLimit.ok) {
    return sendJson(res, 429, { ok: false, message: "Too many requests. Please try again shortly." }, {
      "Retry-After": String(rateLimit.retryAfter),
    });
  }

  if (url.pathname === "/api/health" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      name: "EcoCycle Sarawak",
      version: appVersion,
      uptimeSeconds: Math.round(process.uptime()),
      startedAt,
      environment: isProduction ? "production" : "development",
      categories: routeCategories,
    });
  }

  if (url.pathname === "/api/config" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      appName: "EcoCycle Sarawak",
      categories: routeCategories,
      pwa: true,
      features: ["qr-scanning", "gps-verification", "ai-detection", "rewards", "admin-dashboard"],
    });
  }

  if (url.pathname === "/api/login" && req.method === "POST") {
    const { email = "", password = "" } = await readBody(req);
    const user = users.find((item) => item.email === email && item.password === password);
    if (!user) return sendJson(res, 401, { ok: false, message: "Invalid login." });

    const token = createJwt({ sub: user.id, email: user.email, role: user.role, name: user.name });
    return sendJson(res, 200, { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } }, {
      "Set-Cookie": `${cookieName}=${encodeURIComponent(token)}; ${cookieOptions()}`,
    });
  }

  if (url.pathname === "/api/session" && req.method === "GET") {
    const cookies = parseCookies(req.headers.cookie);
    const payload = verifyJwt(cookies[cookieName]);
    if (!payload) return sendJson(res, 401, { ok: false });
    return sendJson(res, 200, { ok: true, user: payload });
  }

  if (url.pathname === "/api/logout" && req.method === "POST") {
    return sendJson(res, 200, { ok: true }, {
      "Set-Cookie": `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    });
  }

  return sendJson(res, 404, { ok: false, message: "API route not found." });
};

const serveFile = async (res, url) => {
  let filePath = join(distDir, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDir, "index.html");
    res.statusCode = 404;
  }

  const ext = extname(filePath);
  const immutableAsset = /\/assets\/.+-[A-Za-z0-9_-]{8,}\./.test(filePath.replaceAll("\\", "/"));
  res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
  res.setHeader("Cache-Control", ext === ".html"
    ? "no-cache"
    : immutableAsset
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600");
  createReadStream(filePath).pipe(res);
};

createServer(async (req, res) => {
  try {
    Object.entries(securityHeaders).forEach(([header, value]) => res.setHeader(header, value));

    if (!["GET", "HEAD", "POST", "OPTIONS"].includes(req.method || "")) {
      res.writeHead(405, { Allow: "GET, HEAD, POST, OPTIONS" });
      return res.end("Method not allowed");
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (!existsSync(join(distDir, "index.html"))) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Build not found. Run npm run build first.");
    }
    return await serveFile(res, url);
  } catch (error) {
    if (error.statusCode) {
      return sendJson(res, error.statusCode, { ok: false, message: error.message });
    }

    const fallback = existsSync(join(distDir, "index.html"))
      ? await readFile(join(distDir, "index.html"), "utf8")
      : "Server error";
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fallback);
  }
}).listen(port, () => {
  console.log(`Smart Recycle server running on http://localhost:${port}`);
});

setInterval(cleanRateLimitStore, rateLimitWindowMs).unref();
