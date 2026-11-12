import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { clientByToken } from "../../lib/clients.ts";

// Foto de perfil e capa do cliente, entregues só a quem tem o link.
export default async (_req: Request, context: Context) => {
  const client = await clientByToken(context.params.token);
  if (!client) return new Response("Não encontrada.", { status: 404 });
  const kind = context.params.kind;
  const key = kind === "avatar" ? client.avatar_key : kind === "cover" ? client.cover_key : null;
  if (!key) return new Response("Não encontrada.", { status: 404 });
  const hit = await getStore("perfil").getWithMetadata(key, { type: "arrayBuffer" });
  if (!hit) return new Response("Não encontrada.", { status: 404 });
  const type = (hit.metadata as { type?: string } | null)?.type || "image/jpeg";
  return new Response(hit.data as ArrayBuffer, {
    headers: { "content-type": type, "cache-control": "private, max-age=31536000, immutable" },
  });
};

export const config: Config = { path: "/api/c/:token/perfil/:kind", method: "GET" };
