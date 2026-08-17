import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { getStripeClient, computeOrderFees, usdToCents } from "@/lib/stripe";

interface RouteParams {
  params: { id: string };
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;

// Customer starts payment for a shop-proposed online_payment order.
export const POST = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, customerId } = await requireCustomer(req);
  const stripe = getStripeClient();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, conversation_id, customer_id, tenant_id, status, fulfillment_type, amount_usd")
    .eq("id", params.id)
    .single();

  if (orderErr || !order) throw Errors.notFound("Order");
  if (order.customer_id !== customerId) throw Errors.forbidden("This order isn't yours.");
  if (order.fulfillment_type !== "online_payment") {
    throw Errors.badRequest("This order is a shop-visit order and doesn't take online payment.");
  }
  if (order.status !== "proposed") {
    throw Errors.badRequest("This order is no longer pending payment.");
  }

  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("company_name, stripe_connect_account_id, stripe_charges_enabled")
    .eq("id", order.tenant_id)
    .single();

  if (tenantErr || !tenant) throw new AppError(500, "Could not load the shop.", "internal_error");
  if (!tenant.stripe_connect_account_id || !tenant.stripe_charges_enabled) {
    throw Errors.badRequest("This shop hasn't finished setting up payments yet. Please check back later.");
  }

  const fees = computeOrderFees(order.amount_usd);
  const applicationFeeUsd = Math.round((fees.platformFeeUsd + fees.stripeFeeUsd) * 100) / 100;

  await supabase
    .from("orders")
    .update({ stripe_fee_usd: fees.stripeFeeUsd, customer_charge_usd: fees.customerChargeUsd })
    .eq("id", order.id);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `Order from ${tenant.company_name}` },
          unit_amount: usdToCents(fees.customerChargeUsd),
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: usdToCents(applicationFeeUsd),
      transfer_data: { destination: tenant.stripe_connect_account_id },
    },
    metadata: { order_id: order.id },
    success_url: `${SITE_URL}/customer/messages/${order.conversation_id}?payment=success`,
    cancel_url: `${SITE_URL}/customer/messages/${order.conversation_id}?payment=cancelled`,
  });

  if (!session.url) throw new AppError(502, "Stripe did not return a checkout URL.", "upstream_error");

  return NextResponse.json({ url: session.url });
});
