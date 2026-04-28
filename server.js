import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

const port = Number(process.env.PORT || 3000);
const distDir = resolve("dist");
const secret = process.env.JWT_SECRET || "dev-smart-recycle-secret-change-me";
const cookieName = "sr_session";

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

const sendJson = (res, status, data, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(data));
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

const cookieOptions = () => [
  "HttpOnly",
  "SameSite=Lax",
  "Path=/",
  "Max-Age=28800",
  process.env.NODE_ENV === "production" ? "Secure" : "",
].filter(Boolean).join("; ");

const handleApi = async (req, res, url) => {
  if (url.pathname === "/api/login" && req.method === "POST") {
    const { email, password } = await readBody(req);
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
  res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
  createReadStream(filePath).pipe(res);
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (!existsSync(join(distDir, "index.html"))) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Build not found. Run npm run build first.");
    }
    return await serveFile(res, url);
  } catch {
    const fallback = existsSync(join(distDir, "index.html"))
      ? await readFile(join(distDir, "index.html"), "utf8")
      : "Server error";
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fallback);
  }
}).listen(port, () => {
  console.log(`Smart Recycle server running on http://localhost:${port}`);
});
