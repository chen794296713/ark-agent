import { apiError, json } from "@/lib/api";
import { closeOrder, fulfilOrder, needsAttention } from "@/lib/payments/orders";
import { isAlipayTradeStatus, verifyAlipayCallbackToken } from "@/lib/payments/alipay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Alipay notify — the ONLY place an Alipay payment grants a seat.
 *
 * The GoHire gateway delivers the result as either a GET query string or a POST
 * body, so both verbs share one handler. It sends no signature, so the request
 * is authenticated by the secret token we baked into the `notify_url` we handed
 * the gateway (see lib/payments/alipay.ts) — without it, anyone who guessed an
 * order number could grant themselves a seat.
 *
 * Contract with the gateway: HTTP 200 + `{"code":0,"message":"success"}` means
 * handled; a 4xx tells it the callback was malformed.
 */
async function handle(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!verifyAlipayCallbackToken(token)) {
    console.error("[alipay-callback] rejected: bad or missing token");
    return json({ code: 40003, message: "unauthorized callback" }, 401);
  }

  // Parameters arrive in the query string, a JSON body, or a form post.
  const params = new Map<string, string>();
  url.searchParams.forEach((v, k) => params.set(k, v));
  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") || "";
    try {
      if (contentType.includes("application/json")) {
        const body = (await req.json()) as Record<string, unknown>;
        for (const [k, v] of Object.entries(body)) {
          if (v != null) params.set(k, String(v));
        }
      } else if (
        contentType.includes("application/x-www-form-urlencoded") ||
        contentType.includes("multipart/form-data")
      ) {
        const form = await req.formData();
        form.forEach((v, k) => params.set(k, String(v)));
      }
    } catch {
      /* an unparseable body is fine as long as the query string carried the params */
    }
  }

  const payStatus = params.get("pay_status");
  const outTradeNo = params.get("out_trade_no");
  if (!payStatus || !outTradeNo) {
    return json({ code: 40001, message: "invalid callback params" }, 400);
  }
  if (!isAlipayTradeStatus(payStatus)) {
    return json({ code: 40001, message: "unknown pay_status" }, 400);
  }

  // The bearer token must never be persisted. It arrives in the query string
  // (the gateway signs nothing, so the URL itself is the credential), and both
  // payment_events.payload and payment_orders.provider_payload are read by
  // anyone with SELECT on a replica or a nightly dump.
  params.delete("token");
  const payload = Object.fromEntries(params) as Record<string, unknown>;

  // The gateway sends no event id, so synthesise a stable one per (order,
  // status). A redelivery of the same status deduplicates; a genuine status
  // change still gets through. The row is written inside fulfilOrder's
  // transaction, so a mid-fulfilment failure does not permanently swallow the
  // gateway's retry.
  const eventKey = `${outTradeNo}:${payStatus}`;

  try {
    if (payStatus === "TRADE_SUCCESS") {
      // `"alipay"` is enforced inside the claim: without it, whoever holds the
      // callback token could settle a USD Stripe order through this endpoint.
      const result = await fulfilOrder(
        outTradeNo,
        "alipay",
        {
          alipayTradeStatus: payStatus,
          providerRef: outTradeNo,
          providerPayload: payload,
        },
        { provider: "alipay", eventId: eventKey, eventType: payStatus },
      );
      if (!result) {
        // Unknown order number, or one belonging to the other provider. Both are
        // "not ours to settle" and must not be acknowledged as handled.
        console.error("[alipay-callback] no matching alipay order", outTradeNo);
        return json({ code: 40002, message: "order not found" }, 404);
      }
      if (!result.fulfilled && needsAttention(result.blockedBy)) {
        // Money moved against an order we had written off. Answering "success"
        // here would strand a paying customer with no seat and no signal.
        console.error(
          "[alipay-callback] TRADE_SUCCESS on a non-claimable order",
          outTradeNo,
          result.blockedBy,
        );
        return json({ code: 50002, message: "order not in a payable state" }, 409);
      }
    } else if (payStatus === "TRADE_CLOSED") {
      await closeOrder(outTradeNo, "closed", "Alipay reported TRADE_CLOSED", payload);
    }
    // WAIT_BUYER_PAY needs no action — the order is already `pending`.
  } catch (err) {
    console.error("[alipay-callback] handler failed", outTradeNo, err);
    return apiError("Handler error", 500);
  }

  return json({ code: 0, message: "success" });
}

export const GET = handle;
export const POST = handle;
