import { getAuthContext } from "@/lib/auth";
import { json, unauthorized } from "@/lib/api";
import { publicUser, publicWorkspace } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorized();
  return json({ user: publicUser(ctx.user), workspace: publicWorkspace(ctx.workspace) });
}
