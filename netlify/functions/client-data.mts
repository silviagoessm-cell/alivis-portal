import type { Context, Config } from "@netlify/functions";
import { db } from "../../lib/db.ts";
import { getSessionFromRequest, json } from "../../lib/auth.ts";

export default async (req: Request, _context: Context) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "cliente") {
    return json({ error: "Não autorizado." }, { status: 401 });
  }
  const database = db();

  const rounds = await database.sql`
    SELECT id, label, created_at FROM rounds WHERE client_id = ${session.clientId} ORDER BY created_at DESC
  `;
  const posts = await database.sql`
    SELECT p.* FROM posts p
    JOIN rounds r ON r.id = p.round_id
    WHERE r.client_id = ${session.clientId}
    ORDER BY r.created_at DESC, p.ordem ASC
  `;

  const roundsWithPosts = rounds.map((r: any) => ({
    ...r,
    posts: posts.filter((p: any) => p.round_id === r.id),
  }));

  return json({ brandName: session.brandName, rounds: roundsWithPosts }, { status: 200 });
};

export const config: Config = { path: "/api/cliente/dados" };
