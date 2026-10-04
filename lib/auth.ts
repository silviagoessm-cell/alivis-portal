import crypto from "node:crypto";

const COOKIE_NAME = "alivis_session";

function getSecret(): string {
  const secret = Netlify.env.get("SESSION_SECRET");
  if (!secret) throw new Error("SESSION_SECRET não configurado");
  return secret;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}

export type Session =
  | { role: "admin" }
  | { role: "cliente"; clientId: string; brandName: string };

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signSession(session: Session): string {
  const payload = base64url(Buffer.from(JSON.stringify(session)));
  const sig = base64url(crypto.createHmac("sha256", getSecret()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): Session | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = base64url(crypto.createHmac("sha256", getSecret()).update(payload).digest());
  if (sig !== expected) return null;
  try {
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as Session;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(req: Request): Session | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifySessionToken(decodeURIComponent(match[1]));
}

export function setCookieHeader(token: string | null): string {
  if (token === null) {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  }
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}

export function json(body: unknown, init: ResponseInit = {}, cookieToken?: string | null): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (cookieToken !== undefined) {
    headers.set("set-cookie", setCookieHeader(cookieToken));
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}
