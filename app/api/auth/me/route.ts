import { getRequestAuthContext } from "@/lib/auth";
import { json, unauthorized } from "@/lib/api";
import { publicUser, publicWorkspace } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getRequestAuthContext(req.method);
  if (!ctx) return unauthorized();
  return json({ user: publicUser(ctx.user), workspace: publicWorkspace(ctx.workspace) });
}
