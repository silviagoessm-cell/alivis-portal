import type { Context, Config } from "@netlify/functions";
import { db } from "../../lib/db.ts";
import { getSessionFromRequest, json } from "../../lib/auth.ts";

const FORMATO_MAP: Record<string, { formato: string; label: string; icon: string }> = {
  "Reels": { formato: "reels", label: "Reels", icon: "🎞️" },
  "Carrossel": { formato: "carrossel", label: "Carrossel", icon: "🖼️" },
  "Post Estático": { formato: "static", label: "Post estático", icon: "🖼️" },
  "Stories": { formato: "stories", label: "Stories", icon: "📸" },
  "TikTok": { formato: "reels", label: "TikTok", icon: "🎞️" },
  "Live": { formato: "static", label: "Live", icon: "🖼️" },
};

function plainText(richTextArray: any[]): string {
  if (!Array.isArray(richTextArray)) return "";
  return richTextArray.map((t) => t.plain_text || "").join("");
}

function prop(properties: any, names: string[]): any {
  for (const name of names) {
    if (properties?.[name]) return properties[name];
  }
  return null;
}

async function queryNotion(databaseId: string, token: string, body: Record<string, unknown>) {
  return fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export default async (req: Request, _context: Context) => {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return json({ error: "Não autorizado." }, { status: 401 });
  }
  if (req.method !== "GET") return json({ error: "method" }, { status: 405 });

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return json({ error: "clientId é obrigatório." }, { status: 400 });

  const notionToken = Netlify.env.get("NOTION_TOKEN");
  if (!notionToken) {
    return json({ error: "Integração do Notion ainda não configurada (falta NOTION_TOKEN)." }, { status: 500 });
  }

  const database = db();
  const [client] = await database.sql`SELECT notion_database_id FROM clients WHERE id = ${clientId}`;
  if (!client?.notion_database_id) {
    return json({ error: "Esse cliente ainda não tem um banco de posts do Notion vinculado. Edite o cliente e cole o ID do banco." }, { status: 400 });
  }
  const notionDatabaseId: string = client.notion_database_id;

  // tenta filtrar pelos posts aguardando aprovação do cliente; se a propriedade não existir nesse banco, busca tudo
  let notionRes = await queryNotion(notionDatabaseId, notionToken, {
    filter: { property: "Aprovação Arte", select: { equals: "⏳ Aguardando" } },
    page_size: 50,
  });

  if (notionRes.status === 400) {
    notionRes = await queryNotion(notionDatabaseId, notionToken, { page_size: 50 });
  }

  if (!notionRes.ok) {
    const errText = await notionRes.text();
    return json({ error: `Erro ao buscar no Notion (confira se o banco foi compartilhado com a integração): ${errText}` }, { status: 502 });
  }

  const notionData = await notionRes.json();
  const posts = (notionData.results || []).map((page: any) => {
    const props = page.properties || {};

    const tituloProp = prop(props, ["Título do Post", "Nome", "Name"]);
    const titulo = tituloProp?.title ? plainText(tituloProp.title) : "";

    const legendaProp = prop(props, ["Legenda"]);
    const textoProp = prop(props, ["Texto do Post"]);
    const legenda = legendaProp?.rich_text ? plainText(legendaProp.rich_text) : "";
    const texto = textoProp?.rich_text ? plainText(textoProp.rich_text) : "";
    const hook = legenda || texto || titulo || "(sem texto)";

    const formatoProp = prop(props, ["Formato de Post"]);
    const formatoNotion = formatoProp?.select?.name || "";
    const formatoInfo = FORMATO_MAP[formatoNotion] || { formato: "static", label: formatoNotion || "Post", icon: "🖼️" };

    const redeProp = prop(props, ["Rede"]);
    const rede = redeProp?.select?.name
      ? [redeProp.select.name]
      : redeProp?.multi_select
      ? redeProp.multi_select.map((r: any) => r.name)
      : [];

    const dataProp = prop(props, ["Data Postagem", "Data"]);
    const dataStart = dataProp?.date?.start || "";
    let dataFormatada = "";
    if (dataStart) {
      const d = new Date(dataStart + "T12:00:00");
      if (!Number.isNaN(d.getTime())) {
        dataFormatada = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
      }
    }

    return {
      formato: formatoInfo.formato,
      label: formatoInfo.label,
      icon: formatoInfo.icon,
      rede,
      data: dataFormatada,
      hook,
      titulo,
    };
  });

  return json({ posts }, { status: 200 });
};

export const config: Config = { path: "/api/admin/notion-import" };
