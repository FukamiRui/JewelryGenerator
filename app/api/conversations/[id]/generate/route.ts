import { NextRequest, NextResponse } from "next/server";
import { requireCustomer, getServiceClient } from "@/lib/supabase";
import { withErrorHandling, Errors } from "@/lib/api-error";
import { generateDesignForTenant } from "@/lib/design-generation";
import { checkGenerationRateLimit } from "@/lib/rate-limit";
import { requireRevisionAllowance, getRevisionStatus } from "@/lib/design-revisions";

interface RouteParams {
  params: { id: string };
}

interface GenerateInChatBody {
  category_id: string;
  metal_material_id: string;
  gemstone_material_ids: string[];
  finish_material_id: string | null;
  estimated_weight_grams: number;
}

export const POST = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, customerId } = await requireCustomer(req);

  const body: GenerateInChatBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });
  if (!body.category_id || !body.metal_material_id) {
    throw Errors.badRequest("category_id and metal_material_id are required.");
  }
  if (!body.estimated_weight_grams || body.estimated_weight_grams <= 0) {
    throw Errors.badRequest("estimated_weight_grams must be a positive number.");
  }

  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .select("id, tenant_id, customer_id, status, created_at, revision_grant_at")
    .eq("id", params.id)
    .single();

  if (convErr || !conversation) throw Errors.notFound("Conversation");
  if (conversation.customer_id !== customerId) {
    throw Errors.forbidden("Only the customer in this conversation can generate designs.");
  }
  if (conversation.status === "closed") throw Errors.badRequest("This conversation is closed.");

  const service = getServiceClient();

  const { data: tenant, error: tenantErr } = await service
    .from("tenants")
    .select(
      "id, monthly_credit_limit, credits_used_this_month, min_seconds_between_generations, max_generations_per_conversation_per_day, max_daily_credit_share_per_customer_pct, max_design_revisions"
    )
    .eq("id", conversation.tenant_id)
    .single();

  if (tenantErr || !tenant) throw Errors.notFound("Shop");
  if (tenant.credits_used_this_month >= tenant.monthly_credit_limit) {
    throw Errors.rateLimited(
      "This shop has reached its monthly design generation limit. Please try again later or contact the shop."
    );
  }

  await checkGenerationRateLimit(
    service,
    tenant,
    conversation.tenant_id,
    conversation.id,
    customerId
  );

  await requireRevisionAllowance(service, conversation, tenant.max_design_revisions);

  const result = await generateDesignForTenant(service, conversation.tenant_id, {
    category_id: body.category_id,
    metal_material_id: body.metal_material_id,
    gemstone_material_ids: body.gemstone_material_ids,
    finish_material_id: body.finish_material_id,
    estimated_weight_grams: body.estimated_weight_grams,
  });

  const { data: message, error: msgErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      sender_type: "customer",
      sender_id: customerId,
      body: null,
      design_id: result.designId,
    })
    .select("id, created_at")
    .single();

  // Re-check status after inserting the message so the count reflects
  // what the customer just used (getRevisionStatus counts messages, and
  // this one now exists).
  const revisionStatus = await getRevisionStatus(service, conversation, tenant.max_design_revisions);

  if (msgErr || !message) {
    console.error("[conversations/generate] message insert failed:", msgErr);
    return NextResponse.json({
      design_id: result.designId,
      generated_image_url: result.imageUrl,
      price: result.price,
      cached: result.cached,
      message_id: null,
      revision_status: revisionStatus,
      warning: "Design was generated but could not be posted to the chat automatically.",
    });
  }

  return NextResponse.json(
    {
      design_id: result.designId,
      generated_image_url: result.imageUrl,
      price: result.price,
      cached: result.cached,
      message_id: message.id,
      created_at: message.created_at,
      revision_status: revisionStatus,
    },
    { status: 201 }
  );
});
