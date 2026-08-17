import { NextRequest, NextResponse } from "next/server";
import { requireTenant, requireUser } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { PLATFORM_FEE_RATE } from "@/lib/stripe";

const FULFILLMENT_TYPES = ["shop_visit", "online_payment"] as const;

interface CreateOrderBody {
  conversation_id: string;
  design_id?: string | null;
  fulfillment_type: (typeof FULFILLMENT_TYPES)[number];
  amount_usd: number;
  proposed_datetime?: string | null;
  appointment_note?: string | null;
}

// Shop proposes an order (a price + fulfillment plan) from within a conversation.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);

  const body: CreateOrderBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });

  if (!body.conversation_id) throw Errors.badRequest("conversation_id is required.");
  if (!FULFILLMENT_TYPES.includes(body.fulfillment_type)) {
    throw Errors.badRequest("fulfillment_type must be 'shop_visit' or 'online_payment'.");
  }
  if (!body.amount_usd || body.amount_usd <= 0) {
    throw Errors.badRequest("amount_usd must be a positive number.");
  }

  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .select("id, tenant_id, customer_id, status")
    .eq("id", body.conversation_id)
    .single();

  if (convErr || !conversation) throw Errors.notFound("Conversation");
  if (conversation.tenant_id !== tenantId) {
    throw Errors.forbidden("This conversation doesn't belong to your store.");
  }
  if (conversation.status === "closed") throw Errors.badRequest("This conversation is closed.");

  if (body.design_id) {
    const { data: design } = await supabase
      .from("designs")
      .select("id")
      .eq("id", body.design_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!design) throw Errors.badRequest("design_id does not belong to your store.");
  }

  const amountUsd = Math.round(body.amount_usd * 100) / 100;
  const platformFeeUsd = Math.round(amountUsd * PLATFORM_FEE_RATE * 100) / 100;

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      conversation_id: body.conversation_id,
      customer_id: conversation.customer_id,
      tenant_id: tenantId,
      design_id: body.design_id ?? null,
      fulfillment_type: body.fulfillment_type,
      amount_usd: amountUsd,
      platform_fee_usd: platformFeeUsd,
      proposed_datetime: body.proposed_datetime ?? null,
      appointment_note: body.appointment_note ?? null,
    })
    .select("*")
    .single();

  if (error || !order) throw new AppError(500, "Could not create the order.", "internal_error");

  return NextResponse.json({ order }, { status: 201 });
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { supabase } = await requireUser(req);
  const conversationId = req.nextUrl.searchParams.get("conversation_id");
  if (!conversationId) throw Errors.badRequest("conversation_id query param is required.");

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw new AppError(500, "Could not load orders.", "internal_error");
  return NextResponse.json({ orders });
});
