import type { Context, Config } from "@netlify/functions";
import { db } from "../../lib/db.ts";
import { getSessionFromRequest, json, hashPassword } from "../../lib/auth.ts";

// aceita um ID puro ou um link colado do Notion e extrai só o ID (32 caracteres hex)
function normalizeNotionId(raw: string): string | null {
  const match = raw.replace(/-/g, "").match(/[0-9a-fA-F]{32}/);
  if (!match) return null;
  const hex = match[0];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default async (req: Request, _context: Context) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return json({ error: "Não autorizado." }, { status: 401 });
  }
  const database = db();

  if (req.method === "GET") {
    const clients = await database.sql`
      SELECT id, brand_name, username, notion_database_id, created_at FROM clients ORDER BY brand_name ASC
    `;
    return json({ clients }, { status: 200 });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    const brandName = (body?.brandName || "").trim();
    const username = (body?.username || "").trim();
    const password = body?.password || "";
    const notionDatabaseId = body?.notionDatabaseId ? normalizeNotionId(body.notionDatabaseId) : null;
    if (!brandName || !username || !password) {
      return json({ error: "Nome, usuário e senha são obrigatórios." }, { status: 400 });
    }
    const passwordHash = hashPassword(password);
    try {
      const [created] = await database.sql`
        INSERT INTO clients (brand_name, username, password_hash, notion_database_id)
        VALUES (${brandName}, ${username}, ${passwordHash}, ${notionDatabaseId})
        RETURNING id, brand_name, username, notion_database_id, created_at
      `;
      return json({ client: created }, { status: 201 });
    } catch (e) {
      return json({ error: "Já existe um cliente com esse usuário." }, { status: 409 });
    }
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null);
    const clientId = body?.clientId;
    if (!clientId) {
      return json({ error: "clientId é obrigatório." }, { status: 400 });
    }
    // reset de senha
    if (body?.password) {
      const passwordHash = hashPassword(body.password);
      await database.sql`UPDATE clients SET password_hash = ${passwordHash} WHERE id = ${clientId}`;
    }
    // atualizar o banco de posts do Notion vinculado
    if (typeof body?.notionDatabaseId === "string") {
      const notionDatabaseId = body.notionDatabaseId.trim() ? normalizeNotionId(body.notionDatabaseId) : null;
      await database.sql`UPDATE clients SET notion_database_id = ${notionDatabaseId} WHERE id = ${clientId}`;
    }
    return json({ ok: true }, { status: 200 });
  }

  return json({ error: "method" }, { status: 405 });
};

export const config: Config = { path: "/api/admin/clients" };
