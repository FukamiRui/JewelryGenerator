import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors } from "@/lib/api-error";
import { generateDesignFromReferenceForTenant } from "@/lib/design-generation";
import { uploadReferenceImage } from "@/lib/image-cache";

// In-store consultation equivalent of the chat advisor's reference-photo
// path: a walk-in customer shows staff a photo (their phone, a magazine
// clipping, …) and staff generates a guided design from it directly in the
// simulator. No revision cap here — staff is present and already
// exercising judgment on every generate click, unlike the unsupervised
// online chat flow (see lib/design-revisions.ts).
export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);

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
  const customerName = (form.get("customer_name") as string | null)?.trim() || undefined;
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

  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("id, monthly_credit_limit, credits_used_this_month")
    .eq("id", tenantId)
    .single();

  if (tenantErr || !tenant) throw Errors.notFound("Tenant");
  if (tenant.credits_used_this_month >= tenant.monthly_credit_limit) {
    throw Errors.creditLimitReached();
  }

  let referenceImageUrl: string;
  try {
    referenceImageUrl = await uploadReferenceImage(supabase, tenantId, imageFile);
  } catch (err) {
    throw Errors.badRequest(err instanceof Error ? err.message : "Could not upload that image.");
  }

  const result = await generateDesignFromReferenceForTenant(
    supabase,
    tenantId,
    {
      category_id: categoryId,
      metal_material_id: metalMaterialId,
      gemstone_material_ids: gemstoneMaterialIds,
      finish_material_id: finishMaterialId,
      estimated_weight_grams: estimatedWeightGrams,
      customer_name: customerName,
    },
    referenceImageUrl,
    note
  );

  return NextResponse.json({
    design_id: result.designId,
    generated_image_url: result.imageUrl,
    generated_prompt: result.prompt,
    price: result.price,
    share_token: result.shareToken,
    cached: false,
  });
});
