import type { Context, Config } from "@netlify/functions";
import { json } from "../../lib/auth.ts";
import { clientByToken } from "../../lib/clients.ts";
import { applyFeedback, NotionError } from "../../lib/notion.ts";

// Aprovação / pedido de ajuste do cliente: grava direto no Notion.
export default async (req: Request, context: Context) => {
  const client = await clientByToken(context.params.token);
  if (!client || !client.notion_database_id) return json({ error: "Link inválido." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const postId = String(body?.postId || "");
  const status = body?.status; // "aprovado" | "ajuste" | "pendente"
  const feedback = body?.feedback ? String(body.feedback).trim() : null;
  if (!/^[0-9a-f-]{32,36}$/.test(postId) || !["aprovado", "ajuste", "pendente"].includes(status)) {
    return json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (status === "ajuste" && !feedback) return json({ error: "Descreva o ajuste." }, { status: 400 });

  try {
    await applyFeedback(client.notion_database_id, postId, status, feedback);
    return json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("client-feedback", e);
    if (e instanceof NotionError && e.status === 404) return json({ error: "Post não encontrado." }, { status: 404 });
    return json({ error: "Não consegui salvar agora. Tente novamente." }, { status: 502 });
  }
};

export const config: Config = { path: "/api/c/:token/feedback", method: "POST" };
