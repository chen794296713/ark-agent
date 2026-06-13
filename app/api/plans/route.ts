import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { json } from "@/lib/api";
import { serializePlan } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(plans).orderBy(asc(plans.sortOrder));
  return json({ plans: rows.map(serializePlan) });
}
