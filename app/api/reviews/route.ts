import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

interface CreateReviewBody {
  order_id: string;
  rating: number;
  comment?: string | null;
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, customerId } = await requireCustomer(req);

  const body: CreateReviewBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });

  if (!body.order_id) throw Errors.badRequest("order_id is required.");
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
    throw Errors.badRequest("rating must be an integer between 1 and 5.");
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, customer_id, tenant_id, status")
    .eq("id", body.order_id)
    .single();

  if (orderErr || !order) throw Errors.notFound("Order");
  if (order.customer_id !== customerId) throw Errors.forbidden("This order isn't yours.");
  if (order.status !== "completed") throw Errors.badRequest("You can only review a completed order.");

  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("order_id", body.order_id)
    .maybeSingle();
  if (existing) throw Errors.badRequest("You've already reviewed this order.");

  const { data: review, error } = await supabase
    .from("reviews")
    .insert({
      order_id: body.order_id,
      customer_id: customerId,
      tenant_id: order.tenant_id,
      rating: body.rating,
      comment: body.comment?.trim() || null,
    })
    .select("*")
    .single();

  if (error || !review) throw new AppError(500, "Could not submit your review.", "internal_error");

  return NextResponse.json({ review }, { status: 201 });
});
