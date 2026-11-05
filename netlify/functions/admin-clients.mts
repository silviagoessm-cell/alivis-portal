import type { Context, Config } from "@netlify/functions";
import { db } from "../../lib/db.ts";
import { getSessionFromRequest, json } from "../../lib/auth.ts";
import { normalizeNotionId, resolveDatabaseId, ensureSchema, NotionError } from "../../lib/notion.ts";

// Guarda o ID do banco; se o link colado for o de uma página que contém o banco, acha o banco.
// Tenta também criar as colunas de aprovação. Se o Notion ainda não liberou acesso, salva mesmo assim e avisa.
async function prepareDatabase(raw: string): Promise<{ id: string | null; warning?: string }> {
  const norm = normalizeNotionId(raw);
  if (!norm) return { id: null, warning: "Não encontrei um ID do Notion nesse link." };
  try {
    const id = await resolveDatabaseId(norm);
    await ensureSchema(id);
    return { id };
  } catch (e) {
    return { id: norm, warning: e instanceof NotionError ? e.message : "Não consegui verificar o calendário agora." };
  }
}

export default async (req: Request, _context: Context) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") return json({ error: "Não autorizado." }, { status: 401 });
  const database = db();

  if (req.method === "GET") {
    const clients = await database.sql`
      SELECT id, brand_name, notion_database_id, link_token, created_at FROM clients ORDER BY brand_name ASC
    `;
    return json({ clients }, { status: 200 });
  }

  const body = await req.json().catch(() => null);

  if (req.method === "POST") {
    const brandName = String(body?.brandName || "").trim();
    if (!brandName) return json({ error: "Informe o nome do cliente." }, { status: 400 });
    let notionId: string | null = null;
    let warning: string | undefined;
    if (body?.notionDatabaseId) ({ id: notionId, warning } = await prepareDatabase(body.notionDatabaseId));
    const [created] = await database.sql`
      INSERT INTO clients (brand_name, notion_database_id) VALUES (${brandName}, ${notionId})
      RETURNING id, brand_name, notion_database_id, link_token, created_at
    `;
    return json({ client: created, warning }, { status: 201 });
  }

  const clientId = body?.clientId;
  if (!clientId) return json({ error: "clientId é obrigatório." }, { status: 400 });

  if (req.method === "PATCH") {
    let warning: string | undefined;
    if (typeof body?.brandName === "string" && body.brandName.trim()) {
      await database.sql`UPDATE clients SET brand_name = ${body.brandName.trim()} WHERE id = ${clientId}`;
    }
    if (typeof body?.notionDatabaseId === "string") {
      let notionId: string | null = null;
      if (body.notionDatabaseId.trim()) ({ id: notionId, warning } = await prepareDatabase(body.notionDatabaseId));
      await database.sql`UPDATE clients SET notion_database_id = ${notionId} WHERE id = ${clientId}`;
    }
    if (body?.regenerateLink) {
      // invalida o link antigo
      await database.sql`UPDATE clients SET link_token = encode(gen_random_bytes(24), 'hex') WHERE id = ${clientId}`;
    }
    const [client] = await database.sql`
      SELECT id, brand_name, notion_database_id, link_token FROM clients WHERE id = ${clientId}
    `;
    return json({ client, warning }, { status: 200 });
  }

  if (req.method === "DELETE") {
    await database.sql`DELETE FROM clients WHERE id = ${clientId}`;
    return json({ ok: true }, { status: 200 });
  }

  return json({ error: "method" }, { status: 405 });
};

export const config: Config = { path: "/api/admin/clients" };
