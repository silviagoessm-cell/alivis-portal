import { getStore } from "@netlify/blobs";

const NOTION_VERSION = "2022-06-28";

export class NotionError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function normalizeNotionId(raw: string): string | null {
  const match = String(raw || "").replace(/-/g, "").match(/[0-9a-fA-F]{32}/);
  if (!match) return null;
  const h = match[0].toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function friendly(status: number, body: string): string {
  if (status === 401) return "O token do Notion é inválido (confira NOTION_TOKEN no Netlify).";
  if (status === 404) return "O Notion não encontrou esse calendário. Abra o calendário no Notion, clique em ⋯ → Conexões e adicione a integração do portal.";
  if (status === 429) return "O Notion pediu para aguardar um instante. Tente de novo em alguns segundos.";
  return `Erro do Notion (${status}): ${body.slice(0, 300)}`;
}

async function nfetch(path: string, init: RequestInit = {}): Promise<any> {
  const token = Netlify.env.get("NOTION_TOKEN");
  if (!token) throw new NotionError(500, "Integração do Notion não configurada (falta NOTION_TOKEN no Netlify).");
  const res = await fetch("https://api.notion.com/v1" + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new NotionError(res.status, friendly(res.status, text));
  }
  return res.json();
}

const plain = (rt: any[]): string => (Array.isArray(rt) ? rt.map((t) => t.plain_text || "").join("") : "");

/** Aceita o ID do banco ou o de uma página que contém o banco; devolve o ID do banco. */
export async function resolveDatabaseId(id: string): Promise<string> {
  try {
    await nfetch(`/databases/${id}`);
    return id;
  } catch (e) {
    if (!(e instanceof NotionError) || e.status !== 404) throw e;
  }
  // talvez seja uma página: procura o primeiro banco dentro dela
  const kids = await nfetch(`/blocks/${id}/children?page_size=100`);
  const db = (kids.results || []).find((b: any) => b.type === "child_database");
  if (!db) throw new NotionError(404, friendly(404, ""));
  return db.id;
}

const NEED_PROPS: Record<string, any> = {
  "Aprovação do cliente": { select: { options: [{ name: "Pendente", color: "yellow" }, { name: "Aprovado", color: "green" }] } },
  "Comentário do cliente": { rich_text: {} },
};

/** Cria no banco as colunas que o portal escreve, se ainda não existirem. */
export async function ensureSchema(dbId: string): Promise<string[]> {
  const db = await nfetch(`/databases/${dbId}`);
  const missing: Record<string, any> = {};
  for (const [name, def] of Object.entries(NEED_PROPS)) {
    if (!db.properties?.[name]) missing[name] = def;
  }
  const names = Object.keys(missing);
  if (names.length) await nfetch(`/databases/${dbId}`, { method: "PATCH", body: JSON.stringify({ properties: missing }) });
  return names;
}

const FORMATOS: Record<string, { formato: string; label: string; icon: string }> = {
  "Estático": { formato: "static", label: "Post estático", icon: "🖼️" },
  "Post Estático": { formato: "static", label: "Post estático", icon: "🖼️" },
  "Carrossel": { formato: "carrossel", label: "Carrossel", icon: "🖼️" },
  "Reels": { formato: "reels", label: "Reels", icon: "🎞️" },
  "Stories": { formato: "stories", label: "Stories", icon: "📸" },
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export type PortalPost = {
  id: string;
  formato: string;
  label: string;
  icon: string;
  rede: string[];
  data_programada: string;
  data_iso: string;
  hook: string;
  legenda: string;
  slides: { img: string }[] | null;
  status: "pendente" | "aprovado" | "ajuste" | "revisao";
  feedback: string | null;
};

type BodyInfo = { lastEdited: string; legenda: string; imgs: { id: string; v: string }[] };

function bodyFromBlocks(blocks: any[]): { legenda: string; imgs: { id: string; v: string }[] } {
  const imgs: { id: string; v: string }[] = [];
  const parts: { text: string; list: boolean }[] = [];
  let inLegenda = false;
  for (const b of blocks) {
    if (b.type === "image") {
      imgs.push({ id: b.id, v: b.last_edited_time || "" });
      inLegenda = false;
      continue;
    }
    if (/^heading_[123]$/.test(b.type)) {
      const t = plain(b[b.type].rich_text).toLowerCase();
      inLegenda = t.includes("legenda");
      continue;
    }
    if (!inLegenda) continue;
    if (b.type === "paragraph" || b.type === "bulleted_list_item" || b.type === "numbered_list_item") {
      const text = plain(b[b.type].rich_text).trim();
      if (!text) continue;
      const list = b.type !== "paragraph";
      parts.push({ text: b.type === "bulleted_list_item" ? "- " + text : text, list });
    }
  }
  let out = "";
  parts.forEach((p, i) => {
    out += i === 0 ? p.text : (p.list && parts[i - 1].list ? "\n" : "\n\n") + p.text;
  });
  return { legenda: out.trim(), imgs };
}

async function listAllChildren(blockId: string): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const r = await nfetch(`/blocks/${blockId}/children?page_size=100${cursor ? "&start_cursor=" + cursor : ""}`);
    all.push(...(r.results || []));
    if (!r.has_more) break;
    cursor = r.next_cursor;
  }
  return all;
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

async function bodyOf(page: any): Promise<BodyInfo> {
  const cache = getStore("notion-cache");
  const key = `body-${page.id}`;
  try {
    const hit = (await cache.get(key, { type: "json" })) as BodyInfo | null;
    if (hit && hit.lastEdited === page.last_edited_time) return hit;
  } catch {}
  const blocks = await listAllChildren(page.id);
  const info: BodyInfo = { lastEdited: page.last_edited_time, ...bodyFromBlocks(blocks) };
  try {
    await cache.setJSON(key, info);
  } catch {}
  return info;
}

function fmtData(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${parseInt(m[3], 10)} ${MESES[parseInt(m[2], 10) - 1].slice(0, 3)}`;
}

export function mapPage(page: any, body: BodyInfo, token: string): PortalPost {
  const props = page.properties || {};
  const titleProp: any = props["Gancho"] || Object.values(props).find((p: any) => p?.type === "title");
  const hook = plain(titleProp?.title) || "(sem gancho)";
  const fmtName = props["Formato de conteúdo"]?.select?.name || props["Formato de Post"]?.select?.name || "";
  const fmt = FORMATOS[fmtName] || { formato: "static", label: fmtName || "Post", icon: "🖼️" };
  const redeP = props["Rede"];
  const rede: string[] = redeP?.select?.name ? [redeP.select.name] : (redeP?.multi_select || []).map((r: any) => r.name);
  const dataIso: string = props["Data"]?.date?.start || "";
  const st = props["Status"]?.status?.name || "";
  const aprov = props["Aprovação do cliente"]?.select?.name || "";
  const comentario = plain(props["Comentário do cliente"]?.rich_text).trim();
  const legendaProp = plain(props["Legenda"]?.rich_text).trim();

  let status: PortalPost["status"] = "pendente";
  if (st === "Ajuste") status = comentario ? "ajuste" : "revisao";
  else if (aprov === "Aprovado") status = "aprovado";

  const imgs = body.imgs.map((i) => ({
    img: `/api/c/${token}/img/${i.id}?v=${encodeURIComponent(i.v)}`,
  }));
  return {
    id: page.id,
    formato: fmt.formato,
    label: fmt.label,
    icon: fmt.icon,
    rede,
    data_programada: fmtData(dataIso),
    data_iso: dataIso,
    hook,
    legenda: body.legenda || legendaProp,
    slides: imgs.length ? imgs : null,
    status,
    feedback: comentario || null,
  };
}

export async function listPosts(dbId: string, token: string): Promise<PortalPost[]> {
  const pages: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 3; i++) {
    const r = await nfetch(`/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
        filter: { or: [{ property: "Status", status: { equals: "Programar" } }, { property: "Status", status: { equals: "Ajuste" } }] },
        sorts: [{ property: "Data", direction: "ascending" }],
      }),
    });
    pages.push(...(r.results || []));
    if (!r.has_more) break;
    cursor = r.next_cursor;
  }
  const bodies = await pool(pages, 6, bodyOf);
  return pages.map((p, i) => mapPage(p, bodies[i], token));
}

export function groupByMonth(posts: PortalPost[]) {
  const groups = new Map<string, PortalPost[]>();
  for (const p of posts) {
    const key = p.data_iso ? p.data_iso.slice(0, 7) : "sem-data";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === "sem-data" ? 1 : b === "sem-data" ? -1 : a.localeCompare(b)));
  return keys.map((k) => ({
    id: k,
    label: k === "sem-data" ? "Sem data definida" : `${MESES[parseInt(k.slice(5), 10) - 1]} ${k.slice(0, 4)}`.replace(/^./, (c) => c.toUpperCase()),
    posts: groups.get(k)!,
  }));
}

/** Confere que a página pertence ao banco do cliente e grava a resposta dele no Notion. */
export async function applyFeedback(dbId: string, postId: string, status: string, feedback: string | null) {
  const page = await nfetch(`/pages/${postId}`);
  const parent = page.parent?.database_id || "";
  if (parent.replace(/-/g, "") !== dbId.replace(/-/g, "")) throw new NotionError(404, "Post não encontrado.");
  const current = page.properties?.["Status"]?.status?.name;
  const props: Record<string, any> = {};
  if (status === "aprovado") {
    props["Aprovação do cliente"] = { select: { name: "Aprovado" } };
    props["Comentário do cliente"] = { rich_text: [] };
    if (current === "Ajuste") props["Status"] = { status: { name: "Programar" } };
  } else if (status === "ajuste") {
    props["Status"] = { status: { name: "Ajuste" } };
    props["Aprovação do cliente"] = { select: { name: "Pendente" } };
    props["Comentário do cliente"] = { rich_text: [{ type: "text", text: { content: String(feedback || "").slice(0, 1900) } }] };
  } else {
    props["Aprovação do cliente"] = { select: { name: "Pendente" } };
    props["Comentário do cliente"] = { rich_text: [] };
    if (current === "Ajuste") props["Status"] = { status: { name: "Programar" } };
  }
  const send = () => nfetch(`/pages/${postId}`, { method: "PATCH", body: JSON.stringify({ properties: props }) });
  try {
    await send();
  } catch (e) {
    if (e instanceof NotionError && e.status === 400) {
      await ensureSchema(dbId); // colunas ainda não existem: cria e tenta de novo
      await send();
    } else throw e;
  }
}

/** Baixa a imagem de um bloco (URL do Notion expira, então sempre pega uma nova). */
export async function fetchBlockImage(blockId: string): Promise<{ url: string }> {
  const b = await nfetch(`/blocks/${blockId}`);
  if (b.type !== "image") throw new NotionError(404, "Imagem não encontrada.");
  const url = b.image?.file?.url || b.image?.external?.url;
  if (!url) throw new NotionError(404, "Imagem não encontrada.");
  return { url };
}
