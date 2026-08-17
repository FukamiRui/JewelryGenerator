import { NextRequest, NextResponse } from "next/server";
import { requireCustomer, getServiceClient } from "@/lib/supabase";
import { withErrorHandling, Errors } from "@/lib/api-error";
import { generateDesignFromReferenceForTenant } from "@/lib/design-generation";
import { checkGenerationRateLimit } from "@/lib/rate-limit";
import { getRevisionStatus } from "@/lib/design-revisions";
import { uploadReferenceImage } from "@/lib/image-cache";

interface RouteParams {
  params: { id: string };
}

// The advisor's "upload a reference photo instead" escape hatch — offered
// once a customer exhausts their text-only revisions (lib/design-revisions.ts).
// Deliberately NOT gated by requireRevisionAllowance: it's the alternate
// path once the base limit is hit, not a way around it. Still subject to
// the same spam/cost guardrails (credit limit, checkGenerationRateLimit) as
// ordinary generation.
export const POST = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, customerId } = await requireCustomer(req);

  const form = await req.formData().catch(() => {
    throw Errors.badRequest("Request body must be multipart/form-data.");
  });

  const imageFile = form.get("image");
  if (!(imageFile instanceof File) || imageFile.size === 0) {
    throw Errors.badRequest("A reference image is required.");
  }
  const note = (form.get("note") as string | null)?.trim() || null;
  const categoryId = (form.get("category_id") as string | null)?.trim();
  const metalMaterialId = (form.get("metal_material_id") as string | null)?.trim();
  const finishMaterialId = (form.get("finish_material_id") as string | null)?.trim() || null;
  const estimatedWeightGrams = Number(form.get("estimated_weight_grams"));
  let gemstoneMaterialIds: string[] = [];
  try {
    gemstoneMaterialIds = JSON.parse((form.get("gemstone_material_ids") as string | null) ?? "[]");
  } catch {
    throw Errors.badRequest("gemstone_material_ids must be valid JSON.");
  }

  if (!categoryId || !metalMaterialId) {
    throw Errors.badRequest("category_id and metal_material_id are required.");
  }
  if (!estimatedWeightGrams || estimatedWeightGrams <= 0) {
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

  await checkGenerationRateLimit(service, tenant, conversation.tenant_id, conversation.id, customerId);

  let referenceImageUrl: string;
  try {
    referenceImageUrl = await uploadReferenceImage(supabase, conversation.tenant_id, imageFile);
  } catch (err) {
    throw Errors.badRequest(err instanceof Error ? err.message : "Could not upload that image.");
  }

  const result = await generateDesignFromReferenceForTenant(
    service,
    conversation.tenant_id,
    {
      category_id: categoryId,
      metal_material_id: metalMaterialId,
      gemstone_material_ids: gemstoneMaterialIds,
      finish_material_id: finishMaterialId,
      estimated_weight_grams: estimatedWeightGrams,
    },
    referenceImageUrl,
    note
  );

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

  const revisionStatus = await getRevisionStatus(service, conversation, tenant.max_design_revisions);

  if (msgErr || !message) {
    console.error("[generate-from-reference] message insert failed:", msgErr);
    return NextResponse.json({
      design_id: result.designId,
      generated_image_url: result.imageUrl,
      price: result.price,
      cached: false,
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
      cached: false,
      message_id: message.id,
      created_at: message.created_at,
      revision_status: revisionStatus,
    },
    { status: 201 }
  );
});
