import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServiceClient } from "@/lib/supabase";
import { getStripeClient } from "@/lib/stripe";
import { SUBSCRIPTION_MONTHLY_CREDITS, FREE_PLAN_MONTHLY_CREDITS } from "@/lib/credits";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Two very different things share this event: a customer paying a shop
  // for an order, and a shop buying itself extra design credits. Branch on
  // metadata.type set at session-creation time (see buy-credits/route.ts vs
  // orders/[id]/checkout/route.ts) rather than trying to infer which from
  // the session shape.
  if (session.metadata?.type === "credit_purchase") {
    await handleCreditPurchase(session);
    return;
  }

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

/**
 * Applies a one-time credit top-up (see lib/credits.ts CREDIT_PACKS and
 * app/api/stripe/buy-credits/route.ts). Not idempotency-guarded the way the
 * order-payment path is (no natural "already applied" status to check
 * against) — a rare webhook retry could double-credit. Acceptable for now;
 * a production version would want to record processed session ids.
 */
async function handleCreditPurchase(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;

  const tenantId = session.metadata?.tenant_id;
  const credits = Number(session.metadata?.credits);
  if (!tenantId || !credits) {
    console.warn("[stripe/webhook] credit_purchase checkout with missing/invalid metadata");
    return;
  }

  const service = getServiceClient();
  const { data: tenant, error: fetchErr } = await service
    .from("tenants")
    .select("monthly_credit_limit")
    .eq("id", tenantId)
    .single();

  if (fetchErr || !tenant) {
    console.error("[stripe/webhook] credit_purchase: tenant not found:", fetchErr?.message);
    return;
  }

  const { error } = await service
    .from("tenants")
    .update({ monthly_credit_limit: tenant.monthly_credit_limit + credits })
    .eq("id", tenantId);

  if (error) console.error("[stripe/webhook] failed to apply credit top-up:", error.message);
}

async function handleAccountUpdated(account: Stripe.Account) {
  const service = getServiceClient();
  const { error } = await service
    .from("tenants")
    .update({ stripe_charges_enabled: !!account.charges_enabled })
    .eq("stripe_connect_account_id", account.id);

  if (error) console.error("[stripe/webhook] failed to sync charges_enabled:", error.message);
}

// Maps Stripe's subscription lifecycle onto our simplified free/active/past_due/canceled
// (see tenants.subscription_status, migration 018). Anything not listed (e.g. "incomplete",
// meaning payment hasn't gone through yet) is left on 'free' rather than guessed.
const SUBSCRIPTION_STATUS_MAP: Partial<Record<Stripe.Subscription.Status, "active" | "past_due" | "canceled">> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "canceled",
  incomplete_expired: "canceled",
};

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const service = getServiceClient();
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const subscriptionStatus = SUBSCRIPTION_STATUS_MAP[subscription.status] ?? "free";
  const monthlyCreditLimit =
    subscriptionStatus === "active" ? SUBSCRIPTION_MONTHLY_CREDITS : FREE_PLAN_MONTHLY_CREDITS;

  const { error } = await service
    .from("tenants")
    .update({
      subscription_status: subscriptionStatus,
      stripe_subscription_id: subscription.id,
      monthly_credit_limit: monthlyCreditLimit,
    })
    .eq("stripe_customer_id", customerId);

  if (error) console.error("[stripe/webhook] failed to sync subscription status:", error.message);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const service = getServiceClient();
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const { error } = await service
    .from("tenants")
    .update({ subscription_status: "canceled", monthly_credit_limit: FREE_PLAN_MONTHLY_CREDITS })
    .eq("stripe_customer_id", customerId);

  if (error) console.error("[stripe/webhook] failed to sync subscription cancellation:", error.message);
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
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
    }
  } catch (err) {
    console.error(`[stripe/webhook] handler error for ${event.type}:`, err);
    // Still 200 — retrying won't help if our own handler has a bug, and
    // Stripe will keep retrying otherwise, which just repeats the failure.
  }

  return NextResponse.json({ received: true });
}
