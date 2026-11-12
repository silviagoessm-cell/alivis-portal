import type { Context, Config } from "@netlify/functions";
import { json } from "../../lib/auth.ts";
import { clientByToken } from "../../lib/clients.ts";
import { listPosts, groupByMonth, NotionError } from "../../lib/notion.ts";

// Página do cliente: lê direto do calendário dele no Notion (posts em "Programar" e "Ajuste").
export default async (req: Request, context: Context) => {
  const token = context.params.token;
  const client = await clientByToken(token);
  if (!client) return json({ error: "Link inválido." }, { status: 404 });
  const profile = {
    handle: client.handle || "",
    bio: client.bio || "",
    avatar: client.avatar_key ? `/api/c/${token}/perfil/avatar?v=${client.avatar_key.slice(-8)}` : null,
    cover: client.cover_key ? `/api/c/${token}/perfil/cover?v=${client.cover_key.slice(-8)}` : null,
  };
  if (!client.notion_database_id) {
    return json({ brandName: client.brand_name, profile, rounds: [] }, { status: 200 });
  }
  try {
    const posts = await listPosts(client.notion_database_id, token);
    return json({ brandName: client.brand_name, profile, rounds: groupByMonth(posts) }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (e) {
    const status = e instanceof NotionError ? e.status : 500;
    console.error("client-data", e);
    return json({ error: "Não consegui carregar o calendário agora. Tente novamente em instantes." }, { status: status === 429 ? 429 : 502 });
  }
};

export const config: Config = { path: "/api/c/:token/dados", method: "GET" };
