import type { Context, Config } from "@netlify/functions";
import { db } from "../../lib/db.ts";
import { getSessionFromRequest, json } from "../../lib/auth.ts";

export default async (req: Request, _context: Context) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return json({ error: "Não autorizado." }, { status: 401 });
  }
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const clientId = url.searchParams.get("clientId");
    if (!clientId) return json({ error: "clientId é obrigatório." }, { status: 400 });

    const rounds = await database.sql`
      SELECT id, label, created_at FROM rounds WHERE client_id = ${clientId} ORDER BY created_at DESC
    `;
    const posts = await database.sql`
      SELECT p.* FROM posts p
      JOIN rounds r ON r.id = p.round_id
      WHERE r.client_id = ${clientId}
      ORDER BY r.created_at DESC, p.ordem ASC
    `;
    const roundsWithPosts = rounds.map((r: any) => ({
      ...r,
      posts: posts.filter((p: any) => p.round_id === r.id),
    }));
    return json({ rounds: roundsWithPosts }, { status: 200 });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    const clientId = body?.clientId;
    const label = (body?.label || "").trim();
    const items = Array.isArray(body?.posts) ? body.posts : [];
    if (!clientId || !label || items.length === 0) {
      return json({ error: "clientId, label e ao menos um post são obrigatórios." }, { status: 400 });
    }

    const [round] = await database.sql`
      INSERT INTO rounds (client_id, label) VALUES (${clientId}, ${label}) RETURNING id
    `;

    let ordem = 0;
    for (const p of items) {
      await database.sql`
        INSERT INTO posts (round_id, ordem, formato, label, icon, rede, data_programada, hook, slides, status)
        VALUES (
          ${round.id}, ${ordem}, ${p.formato}, ${p.label}, ${p.icon},
          ${p.rede || []}, ${p.data || ""}, ${p.hook || ""},
          ${p.slides ? JSON.stringify(p.slides) : null}, 'pendente'
        )
      `;
      ordem++;
    }

    return json({ roundId: round.id }, { status: 201 });
  }

  if (req.method === "PATCH") {
    // admin atualiza status manualmente (ex: "ajuste feito")
    const body = await req.json().catch(() => null);
    const postId = body?.postId;
    const status = body?.status;
    if (!postId || !status) return json({ error: "postId e status são obrigatórios." }, { status: 400 });
    await database.sql`UPDATE posts SET status = ${status}, updated_at = now() WHERE id = ${postId}`;
    return json({ ok: true }, { status: 200 });
  }

  return json({ error: "method" }, { status: 405 });
};

export const config: Config = { path: "/api/admin/rounds" };
