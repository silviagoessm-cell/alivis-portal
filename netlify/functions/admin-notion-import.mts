import type { Context, Config } from "@netlify/functions";
import { db } from "../../lib/db.ts";
import { getSessionFromRequest, json } from "../../lib/auth.ts";
import { listPosts, ensureSchema, NotionError } from "../../lib/notion.ts";

// "Testar conexão": lê o calendário do cliente e mostra o que o cliente verá.
export default async (req: Request, _context: Context) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") return json({ error: "Não autorizado." }, { status: 401 });
  if (req.method !== "GET") return json({ error: "method" }, { status: 405 });

  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return json({ error: "clientId é obrigatório." }, { status: 400 });

  const [client] = await db().sql`SELECT notion_database_id, link_token FROM clients WHERE id = ${clientId}`;
  if (!client?.notion_database_id) return json({ error: "Cole o link do calendário deste cliente e salve." }, { status: 400 });

  try {
    const added = await ensureSchema(client.notion_database_id);
    const posts = await listPosts(client.notion_database_id, client.link_token);
    return json({
      ok: true,
      total: posts.length,
      aprovados: posts.filter((p) => p.status === "aprovado").length,
      ajustes: posts.filter((p) => p.status === "ajuste" || p.status === "revisao").length,
      semImagem: posts.filter((p) => !p.slides).length,
      colunasCriadas: added,
    }, { status: 200 });
  } catch (e) {
    return json({ error: e instanceof NotionError ? e.message : "Não consegui ler o calendário." }, { status: 502 });
  }
};

export const config: Config = { path: "/api/admin/notion-import" };
