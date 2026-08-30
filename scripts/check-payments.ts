/**
 * Payment-configuration self-check — `npm run payments:check`.
 *
 * The mode resolver in lib/payments/config.ts is what stands between a missing
 * environment variable and handing out paid seats for free: `mock` fulfils a
 * checkout inline, so a production deployment must never reach it by accident.
 * These assertions pin that behaviour, plus the Alipay callback-token check that
 * is the only thing authenticating the CN notify endpoint.
 *
 * Needs no database, no network and no provider credentials. Runs under the
 * `react-server` export condition so the `import "server-only"` guards resolve.
 */
process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
let fails = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}  got=${JSON.stringify(got)}${ok ? "" : ` want=${JSON.stringify(want)}`}`);
};

async function modes(env: Record<string, string | undefined>) {
  for (const k of ["NODE_ENV","PAYMENTS_MODE","STRIPE_SECRET_KEY","ALIPAY_ENABLED","ALIPAY_CALLBACK_SECRET"]) {
    delete (process.env as Record<string, string | undefined>)[k];
  }
  Object.assign(process.env, env);
  // config.ts reads process.env per call, so a fresh import is not required
  const { stripeConfig, alipayConfig } = await import("@/lib/payments/config");
  return { stripe: stripeConfig().mode, alipay: alipayConfig().mode };
}

(async () => {
  // --- production: absent credentials must NOT become mock -----------------
  let m = await modes({ NODE_ENV: "production", STRIPE_SECRET_KEY: "sk_live_x" });
  eq("prod, stripe key only     -> stripe", m.stripe, "live");
  eq("prod, stripe key only     -> alipay", m.alipay, "unconfigured");

  m = await modes({ NODE_ENV: "production" });
  eq("prod, no keys at all      -> stripe", m.stripe, "unconfigured");
  eq("prod, no keys at all      -> alipay", m.alipay, "unconfigured");

  // the exact hole that was reported: ALIPAY_ENABLED on, secret missing
  m = await modes({ NODE_ENV: "production", ALIPAY_ENABLED: "true" });
  eq("prod, alipay on w/o secret-> alipay", m.alipay, "unconfigured");

  m = await modes({ NODE_ENV: "production", ALIPAY_ENABLED: "true", ALIPAY_CALLBACK_SECRET: "s" });
  eq("prod, alipay on w/ secret -> alipay", m.alipay, "live");

  // PAYMENTS_MODE=live cannot conjure credentials
  m = await modes({ NODE_ENV: "production", PAYMENTS_MODE: "live" });
  eq("prod, forced live, no keys-> stripe", m.stripe, "unconfigured");
  eq("prod, forced live, no keys-> alipay", m.alipay, "unconfigured");

  // the only way into mock in production is the explicit opt-in
  m = await modes({ NODE_ENV: "production", PAYMENTS_MODE: "mock" });
  eq("prod, explicit mock       -> stripe", m.stripe, "mock");
  eq("prod, explicit mock       -> alipay", m.alipay, "mock");

  // --- development: the demo must still work with nothing configured -------
  m = await modes({ NODE_ENV: "development" });
  eq("dev, no keys              -> stripe", m.stripe, "mock");
  eq("dev, no keys              -> alipay", m.alipay, "mock");

  const { verifyAlipayCallbackToken } = await import("@/lib/payments/alipay");
  // NODE_ENV is typed read-only; the whole point here is to exercise both branches.
  (process.env as Record<string, string | undefined>).NODE_ENV = "development";
  delete process.env.ALIPAY_CALLBACK_SECRET;
  eq("dev, no secret, no token  -> reject", verifyAlipayCallbackToken(null), false);
  eq("dev, no secret, any token -> reject", verifyAlipayCallbackToken("anything"), false);
  process.env.ALIPAY_CALLBACK_SECRET = "correct-horse";
  eq("secret set, wrong token   -> reject", verifyAlipayCallbackToken("wrong"), false);
  eq("secret set, short token   -> reject", verifyAlipayCallbackToken("c"), false);
  eq("secret set, right token   -> accept", verifyAlipayCallbackToken("correct-horse"), true);

  console.log(fails === 0 ? "\nALL MODE CHECKS PASSED" : `\n${fails} CHECK(S) FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})();
