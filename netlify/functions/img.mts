import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { clientByToken } from "../../lib/clients.ts";
import { fetchBlockImage } from "../../lib/notion.ts";

const MAX_CACHEABLE = 5_000_000; // acima disso a resposta passaria do limite da função: redireciona

// Entrega as imagens do corpo da página do Notion (cópia em cache, porque o link do Notion expira).
export default async (req: Request, context: Context) => {
  const client = await clientByToken(context.params.token);
  if (!client) return new Response("Link inválido.", { status: 404 });
  const blockId = context.params.blockId;
  if (!blockId || !/^[0-9a-f-]{32,36}$/.test(blockId)) return new Response("Não encontrada.", { status: 404 });

  const v = new URL(req.url).searchParams.get("v") || "";
  const key = `${blockId}-${v.replace(/[^0-9a-zA-Z]/g, "")}`;
  const store = getStore("notion-img");
  const headers = { "cache-control": "private, max-age=31536000, immutable" };

  const hit = await store.getWithMetadata(key, { type: "arrayBuffer" });
  if (hit) {
    const type = (hit.metadata as { type?: string } | null)?.type || "image/jpeg";
    return new Response(hit.data as ArrayBuffer, { headers: { ...headers, "content-type": type } });
  }

  try {
    const { url } = await fetchBlockImage(blockId);
    const src = await fetch(url);
    if (!src.ok) return new Response("Não encontrada.", { status: 404 });
    const type = src.headers.get("content-type") || "image/jpeg";
    const bytes = await src.arrayBuffer();
    if (bytes.byteLength > MAX_CACHEABLE) return Response.redirect(url, 302);
    await store.set(key, bytes, { metadata: { type } });
    return new Response(bytes, { headers: { ...headers, "content-type": type } });
  } catch (e) {
    console.error("img", e);
    return new Response("Não encontrada.", { status: 404 });
  }
};

export const config: Config = { path: "/api/c/:token/img/:blockId", method: "GET" };
