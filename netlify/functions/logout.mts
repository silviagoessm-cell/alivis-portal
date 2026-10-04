import type { Context, Config } from "@netlify/functions";
import { json } from "../../lib/auth.ts";

export default async (_req: Request, _context: Context) => {
  return json({ ok: true }, { status: 200 }, null);
};

export const config: Config = { path: "/api/logout" };
