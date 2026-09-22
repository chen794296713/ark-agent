import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentRoles } from "@/lib/db/schema";
import { json } from "@/lib/api";
import { serializeRole } from "@/lib/serializers";
import { listOpenClawManagerAgents } from "@/app/lib/openclaw_manager_api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLE_HUES = ["#D8FF3E", "#E8804F", "#4FD1C5", "#6AA6FF", "#FBBF24", "#A78BFA"];
const CUSTOM_ROLE = {
  id: "custom",
  name: "Custom role",
  blurb: "Define a role from scratch",
  longBlurb: null,
  hue: "#9AA3B2",
  mono: "+",
  defaultEngine: "openclaw" as const,
  defaultInstructions: null,
  defaultRules: null,
  minPlan: "associate" as const,
  sortOrder: -1,
};

export async function GET() {
  await db
    .insert(agentRoles)
    .values(CUSTOM_ROLE)
    .onConflictDoUpdate({
      target: agentRoles.id,
      set: {
        name: CUSTOM_ROLE.name,
        blurb: CUSTOM_ROLE.blurb,
        hue: CUSTOM_ROLE.hue,
        mono: CUSTOM_ROLE.mono,
        sortOrder: CUSTOM_ROLE.sortOrder,
      },
    });

  try {
    const templates = await listOpenClawManagerAgents();
    if (templates.length) {
      // Keep the external templates compatible with the existing create-agent
      // contract and foreign key by mirroring them into the local role catalog.
      await db
        .insert(agentRoles)
        .values(
          templates.map((template, index) => ({
            id: `ocm-${template.id}`,
            name: template.name.slice(0, 80),
            blurb: template.description || template.name,
            longBlurb: template.upload_filename || null,
            hue: ROLE_HUES[index % ROLE_HUES.length],
            mono: template.name.trim().slice(0, 1).toUpperCase() || "A",
            defaultEngine: (template.category_name || "openclaw").toLowerCase().includes("hermes")
              ? "hermes" as const
              : "openclaw" as const,
            defaultInstructions: null,
            defaultRules: null,
            minPlan: "associate" as const,
            sortOrder: index,
          })),
        )
        .onConflictDoUpdate({
          target: agentRoles.id,
          set: {
            name: sql`excluded.name`,
            blurb: sql`excluded.blurb`,
            longBlurb: sql`excluded.long_blurb`,
            hue: sql`excluded.hue`,
            mono: sql`excluded.mono`,
            defaultEngine: sql`excluded.default_engine`,
            sortOrder: sql`excluded.sort_order`,
          },
        });

      return json({
        roles: [
          CUSTOM_ROLE,
          ...templates.map((template, index) => ({
            id: `ocm-${template.id}`,
            name: template.name,
            blurb: template.description || template.name,
            longBlurb: template.upload_filename || null,
            hue: ROLE_HUES[index % ROLE_HUES.length],
            mono: template.name.trim().slice(0, 1).toUpperCase() || "A",
            defaultEngine: (template.category_name || "openclaw").toLowerCase().includes("hermes")
              ? "hermes" as const
              : "openclaw" as const,
            defaultInstructions: null,
            defaultRules: null,
            minPlan: "associate" as const,
            managerAgentId: template.id,
            categoryId: template.category_id,
            categoryName: template.category_name,
            uploadFilename: template.upload_filename,
          })),
        ],
      });
    }
  } catch (error) {
    console.error("Failed to load OpenClaw Manager templates", error);
  }

  // Preserve the local catalog as a temporary fallback when the manager is
  // unavailable, so an outage does not make the hire flow unusable.
  const rows = await db.select().from(agentRoles).orderBy(asc(agentRoles.sortOrder));
  return json({ roles: rows.map(serializeRole) });
}
