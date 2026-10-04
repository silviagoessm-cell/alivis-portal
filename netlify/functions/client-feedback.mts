import type { Context, Config } from "@netlify/functions";
import { db } from "../../lib/db.ts";
import { getSessionFromRequest, json } from "../../lib/auth.ts";

export default async (req: Request, _context: Context) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "cliente") {
    return json({ error: "Não autorizado." }, { status: 401 });
  }
  if (req.method !== "POST") return json({ error: "method" }, { status: 405 });

  const body = await req.json().catch(() => null);
  const postId = body?.postId;
  const status = body?.status; // "aprovado" | "ajuste"
  const feedback = body?.feedback || null;
  if (!postId || !["aprovado", "ajuste"].includes(status)) {
    return json({ error: "postId e status (aprovado|ajuste) são obrigatórios." }, { status: 400 });
  }

  const database = db();
  // garante que o post pertence a uma rodada deste cliente
  const [owned] = await database.sql`
    SELECT p.id FROM posts p
    JOIN rounds r ON r.id = p.round_id
    WHERE p.id = ${postId} AND r.client_id = ${session.clientId}
  `;
  if (!owned) return json({ error: "Post não encontrado." }, { status: 404 });

  await database.sql`
    UPDATE posts SET status = ${status}, feedback = ${feedback}, updated_at = now()
    WHERE id = ${postId}
  `;

  return json({ ok: true }, { status: 200 });
};

export const config: Config = { path: "/api/cliente/feedback" };
