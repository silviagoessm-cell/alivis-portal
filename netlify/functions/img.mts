import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { getSessionFromRequest } from "../../lib/auth.ts";

// Entrega a imagem só para quem está logado (admin ou cliente).
export default async (req: Request, context: Context) => {
  const session = getSessionFromRequest(req);
  if (!session) return new Response("Não autorizado.", { status: 401 });

  const key = context.params.key;
  if (!key || !/^[0-9a-f-]{36}$/.test(key)) return new Response("Não encontrada.", { status: 404 });

  const result = await getStore("imagens").getWithMetadata(key, { type: "arrayBuffer" });
  if (!result) return new Response("Não encontrada.", { status: 404 });

  const type = (result.metadata as { type?: string } | null)?.type || "image/jpeg";
  return new Response(result.data as ArrayBuffer, {
    headers: { "content-type": type, "cache-control": "private, max-age=31536000, immutable" },
  });
};

export const config: Config = { path: "/api/img/:key", method: "GET" };
