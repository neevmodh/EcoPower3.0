// Razorpay webhook receiver. Signature verification is the point of this
// endpoint — the Orders/Checkout flow itself lands in #39. Keys are in repo
// secrets as RAZORPAY_WEBHOOK_SECRET (#64).
import crypto from "node:crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "webhook secret not configured" }, { status: 503 });
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return Response.json({ error: "missing signature" }, { status: 400 });
  }

  const body = await request.text();
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");

  // timingSafeEqual throws on length mismatch — compare buffers of equal size.
  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

  if (!valid) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  // #39 dispatches on event type from here.
  return Response.json({ received: true });
}
