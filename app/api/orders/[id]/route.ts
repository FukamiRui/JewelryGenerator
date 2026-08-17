import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

interface RouteParams {
  params: { id: string };
}

const ADVANCE_STEPS: Record<string, string> = {
  confirmed: "in_progress",
  in_progress: "ready",
  ready: "completed",
};

interface PatchOrderBody {
  action: "confirm" | "advance" | "cancel";
}

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, userId } = await requireUser(req);

  const body: PatchOrderBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, customer_id, tenant_id, status, fulfillment_type")
    .eq("id", params.id)
    .single();

  if (orderErr || !order) throw Errors.notFound("Order");

  const isCustomer = order.customer_id === userId;
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("tenant_id", order.tenant_id)
    .maybeSingle();
  const isShop = !!membership;

  if (!isCustomer && !isShop) throw Errors.forbidden("You don't have access to this order.");

  let nextStatus: string;

  if (body.action === "confirm") {
    if (!isCustomer) throw Errors.forbidden("Only the customer can confirm an order.");
    if (order.status !== "proposed") throw Errors.badRequest("This order is no longer pending confirmation.");
    if (order.fulfillment_type === "online_payment") {
      throw Errors.badRequest("Online-payment orders are confirmed by paying, not by this action.");
    }
    nextStatus = "confirmed";
  } else if (body.action === "advance") {
    if (!isShop) throw Errors.forbidden("Only the shop can advance an order's status.");
    const next = ADVANCE_STEPS[order.status];
    if (!next) throw Errors.badRequest(`Order can't be advanced from status '${order.status}'.`);
    nextStatus = next;
  } else if (body.action === "cancel") {
    if (order.status !== "proposed") {
      throw Errors.badRequest(
        "Only a pending, unconfirmed order can be cancelled this way — contact the other party for anything further along."
      );
    }
    nextStatus = "cancelled";
  } else {
    throw Errors.badRequest("action must be 'confirm', 'advance', or 'cancel'.");
  }

  const { data: updated, error: updateErr } = await supabase
    .from("orders")
    .update({ status: nextStatus })
    .eq("id", params.id)
    .select("*")
    .single();

  if (updateErr || !updated) throw new AppError(500, "Could not update the order.", "internal_error");

  return NextResponse.json({ order: updated });
});
