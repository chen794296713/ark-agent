import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentRoles } from "@/lib/db/schema";
import { json } from "@/lib/api";
import { serializeRole } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(agentRoles).orderBy(asc(agentRoles.sortOrder));
  return json({ roles: rows.map(serializeRole) });
}
