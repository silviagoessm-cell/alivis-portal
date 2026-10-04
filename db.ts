import { getDatabase } from "@netlify/database";

export function db() {
  return getDatabase();
}
