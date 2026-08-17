import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServiceClient } from "@/lib/supabase";
import { getStripeClient } from "@/lib/stripe";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id;
  if (!orderId) {
    console.warn("[stripe/webhook] checkout.session.completed with no order_id metadata");
    return;
  }
  if (session.payment_status !== "paid") return;

  const service = getServiceClient();
  const { error } = await service
    .from("orders")
    .update({
      status: "confirmed",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id:
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    })
    .eq("id", orderId)
    .eq("status", "proposed"); // idempotent: no-op if already processed

  if (error) console.error("[stripe/webhook] failed to mark order paid:", error.message);
}

async function handleAccountUpdated(account: Stripe.Account) {
  const service = getServiceClient();
  const { error } = await service
    .from("tenants")
    .update({ stripe_charges_enabled: !!account.charges_enabled })
    .eq("stripe_connect_account_id", account.id);

  if (error) console.error("[stripe/webhook] failed to sync charges_enabled:", error.message);
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", (err as Error).message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;
    }
  } catch (err) {
    console.error(`[stripe/webhook] handler error for ${event.type}:`, err);
    // Still 200 — retrying won't help if our own handler has a bug, and
    // Stripe will keep retrying otherwise, which just repeats the failure.
  }

  return NextResponse.json({ received: true });
}
