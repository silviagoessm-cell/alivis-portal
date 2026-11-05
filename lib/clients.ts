import { db } from "./db.ts";

export type PortalClient = { id: string; brand_name: string; notion_database_id: string | null };

export async function clientByToken(token: string | undefined): Promise<PortalClient | null> {
  if (!token || !/^[0-9a-f]{48}$/.test(token)) return null;
  const rows = await db().sql`SELECT id, brand_name, notion_database_id FROM clients WHERE link_token = ${token}`;
  return (rows[0] as PortalClient) || null;
}
