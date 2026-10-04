import type { Context, Config } from "@netlify/functions";
import { getSessionFromRequest, json } from "../../lib/auth.ts";

export default async (req: Request, _context: Context) => {
  const session = getSessionFromRequest(req);
  if (!session) return json({ role: null }, { status: 200 });
  return json(session, { status: 200 });
};

export const config: Config = { path: "/api/me" };
