import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { userIdentities, users, type IdentityProvider } from "@/lib/db/schema";
import { apiError, jsonPrivate, notFound, requireAuth } from "@/lib/api";
import { IDENTITY_PROVIDERS } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ provider: string }> };

/** The path segment is whatever the caller typed; only the enum values pass. */
function isIdentityProvider(value: string): value is IdentityProvider {
  return (IDENTITY_PROVIDERS as readonly string[]).includes(value);
}

/**
 * DELETE /api/me/identities/:provider — unlink a Google/WeChat sign-in.
 *
 * The refusal below is the point of the whole endpoint: an account whose
 * `passwordHash` is null signs in through providers only, so removing its last
 * identity leaves nobody — not the owner, not support — able to get back in.
 * There is no recovery flow in this codebase to undo that.
 *
 * Both facts (does a password exist, how many identities remain) are read here
 * under a row lock. The panel disables the button too, but a disabled button is
 * a hint to the user, not a control: this handler is reachable with curl.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const gate = await requireAuth();
  if (gate.res) return gate.res;
  const { provider } = await params;
  // Validated before it can reach a query — an unknown value is a 400, not a
  // Postgres enum cast blowing up as a 500.
  if (!isIdentityProvider(provider)) {
    return apiError("Unknown sign-in provider", 400, { code: "unknown_provider" });
  }

  const userId = gate.ctx.user.id;

  const outcome = await db.transaction(async (tx) => {
    // Lock the account row for the whole check-then-delete. Two unlinks racing
    // (two tabs, or one per provider) would otherwise each see the other's
    // identity as still present, both pass the guard below, and between them
    // strip the last way in — the exact outcome this endpoint refuses.
    const [owner] = await tx
      .select({ hasPassword: sql<boolean>`(${users.passwordHash} is not null)` })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");
    if (!owner) return { kind: "gone" } as const;

    const linked = await tx
      .select({ id: userIdentities.id, provider: userIdentities.provider })
      .from(userIdentities)
      .where(eq(userIdentities.userId, userId));

    const target = linked.find((row) => row.provider === provider);
    if (!target) return { kind: "not_linked" } as const;

    if (!owner.hasPassword && linked.length <= 1) return { kind: "last_way_in" } as const;

    // `userId` in the predicate as well as the row id: the id came from a query
    // already scoped to this user, but a delete that can only ever touch the
    // caller's own row does not depend on that staying true.
    await tx
      .delete(userIdentities)
      .where(and(eq(userIdentities.id, target.id), eq(userIdentities.userId, userId)));
    return { kind: "ok" } as const;
  });

  if (outcome.kind === "gone") return notFound("Account not found");
  if (outcome.kind === "not_linked") {
    return notFound("That provider is not connected to your account");
  }
  if (outcome.kind === "last_way_in") {
    return apiError(
      "That is the only way you can sign in. Set a password first, then disconnect it.",
      400,
      { code: "last_way_in" },
    );
  }

  return jsonPrivate({ ok: true, provider });
}
