import type { Context, Config } from "@netlify/functions";
import { db } from "../../lib/db.ts";
import { getSessionFromRequest, json, hashPassword } from "../../lib/auth.ts";

export default async (req: Request, _context: Context) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return json({ error: "Não autorizado." }, { status: 401 });
  }
  const database = db();

  if (req.method === "GET") {
    const clients = await database.sql`
      SELECT id, brand_name, username, created_at FROM clients ORDER BY brand_name ASC
    `;
    return json({ clients }, { status: 200 });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    const brandName = (body?.brandName || "").trim();
    const username = (body?.username || "").trim();
    const password = body?.password || "";
    if (!brandName || !username || !password) {
      return json({ error: "Nome, usuário e senha são obrigatórios." }, { status: 400 });
    }
    const passwordHash = hashPassword(password);
    try {
      const [created] = await database.sql`
        INSERT INTO clients (brand_name, username, password_hash)
        VALUES (${brandName}, ${username}, ${passwordHash})
        RETURNING id, brand_name, username, created_at
      `;
      return json({ client: created }, { status: 201 });
    } catch (e) {
      return json({ error: "Já existe um cliente com esse usuário." }, { status: 409 });
    }
  }

  if (req.method === "PATCH") {
    // reset de senha de um cliente existente
    const body = await req.json().catch(() => null);
    const clientId = body?.clientId;
    const password = body?.password || "";
    if (!clientId || !password) {
      return json({ error: "clientId e password são obrigatórios." }, { status: 400 });
    }
    const passwordHash = hashPassword(password);
    await database.sql`UPDATE clients SET password_hash = ${passwordHash} WHERE id = ${clientId}`;
    return json({ ok: true }, { status: 200 });
  }

  return json({ error: "method" }, { status: 405 });
};

export const config: Config = { path: "/api/admin/clients" };
