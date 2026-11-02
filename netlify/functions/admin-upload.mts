import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { getSessionFromRequest, json } from "../../lib/auth.ts";

// Recebe UMA imagem (já reduzida pelo navegador) e devolve o endereço dela.
// O admin chama isso em fila para todas as imagens escolhidas de uma vez.
export default async (req: Request, _context: Context) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return json({ error: "Não autorizado." }, { status: 401 });
  }
  if (req.method !== "POST") return json({ error: "method" }, { status: 405 });

  const type = req.headers.get("content-type") || "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) {
    return json({ error: "Envie uma imagem JPG, PNG ou WebP." }, { status: 400 });
  }
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > 4_000_000) {
    return json({ error: "Imagem vazia ou maior que 4 MB." }, { status: 400 });
  }

  const key = crypto.randomUUID();
  await getStore("imagens").set(key, bytes, { metadata: { type } });
  return json({ url: `/api/img/${key}` }, { status: 201 });
};

export const config: Config = { path: "/api/admin/upload", method: "POST" };
