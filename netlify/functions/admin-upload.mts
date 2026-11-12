import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { db } from "../../lib/db.ts";
import { getSessionFromRequest, json } from "../../lib/auth.ts";

// Admin envia a foto de perfil ou a imagem de capa (print) de um cliente.
export default async (req: Request, _context: Context) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") return json({ error: "Não autorizado." }, { status: 401 });
  if (req.method !== "POST") return json({ error: "method" }, { status: 405 });

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") || "";
  const kind = url.searchParams.get("kind");
  if (!/^[0-9a-f-]{36}$/.test(clientId) || (kind !== "avatar" && kind !== "cover")) {
    return json({ error: "Dados inválidos." }, { status: 400 });
  }
  const type = req.headers.get("content-type") || "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) {
    return json({ error: "Envie uma imagem JPG, PNG ou WebP." }, { status: 400 });
  }
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > 4_000_000) {
    return json({ error: "Imagem muito grande (máximo 4 MB)." }, { status: 413 });
  }

  const database = db();
  const [client] = await database.sql`SELECT avatar_key, cover_key FROM clients WHERE id = ${clientId}`;
  if (!client) return json({ error: "Cliente não encontrado." }, { status: 404 });

  const store = getStore("perfil");
  const key = `${clientId}-${kind}-${crypto.randomUUID()}`;
  await store.set(key, bytes, { metadata: { type } });
  if (kind === "avatar") await database.sql`UPDATE clients SET avatar_key = ${key} WHERE id = ${clientId}`;
  else await database.sql`UPDATE clients SET cover_key = ${key} WHERE id = ${clientId}`;
  const old = kind === "avatar" ? client.avatar_key : client.cover_key;
  if (old) { try { await store.delete(old); } catch {} }

  return json({ ok: true, key }, { status: 201 });
};

export const config: Config = { path: "/api/admin/upload" };
