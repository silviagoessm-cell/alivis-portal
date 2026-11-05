import type { Context, Config } from "@netlify/functions";
import { signSession, json } from "../../lib/auth.ts";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return json({ error: "method" }, { status: 405 });

  const body = await req.json().catch(() => null);
  const username = (body?.username || "").trim();
  const password = body?.password || "";
  if (!username || !password) {
    return json({ error: "Usuário e senha são obrigatórios." }, { status: 400 });
  }

  const adminUser = Netlify.env.get("ADMIN_USERNAME");
  const adminPass = Netlify.env.get("ADMIN_PASSWORD");

  if (adminUser && adminPass && username === adminUser && password === adminPass) {
    const token = signSession({ role: "admin" });
    return json({ role: "admin" }, { status: 200 }, token);
  }

  return json({ error: "Usuário ou senha inválidos." }, { status: 401 });
};

export const config: Config = { path: "/api/login" };
