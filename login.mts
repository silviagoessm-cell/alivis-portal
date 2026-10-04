import type { Context, Config } from "@netlify/functions";
import { db } from "../../lib/db.ts";
import { verifyPassword, signSession, json } from "../../lib/auth.ts";

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

  const database = db();
  const rows = await database.sql`
    SELECT id, brand_name, password_hash FROM clients WHERE username = ${username}
  `;
  const client = rows[0];
  if (!client || !verifyPassword(password, client.password_hash)) {
    return json({ error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  const token = signSession({ role: "cliente", clientId: client.id, brandName: client.brand_name });
  return json({ role: "cliente", brandName: client.brand_name }, { status: 200 }, token);
};

export const config: Config = { path: "/api/login" };
