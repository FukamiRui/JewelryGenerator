import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { uploadPortfolioImage } from "@/lib/image-cache";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);

  const { data: items, error } = await supabase
    .from("portfolio_items")
    .select(
      "id, design_id, media_type, image_url, video_url, caption, description, materials, sort_order, created_at, boost_expires_at"
    )
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });

  if (error) throw new AppError(500, "Could not load your portfolio.", "internal_error");
  return NextResponse.json({ items });
});

// Adds a portfolio item: either a fresh photo upload, or a shortcut that
// reuses one of the shop's own generated designs (design_id, no file).
export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);

  // Free tier is a limited taste of the product, not a parallel free plan —
  // capped at 1 portfolio piece total so subscribing is worth more than
  // just buying the same 300 credits piecemeal (see README).
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("subscription_status")
    .eq("id", tenantId)
    .single();
  if (tenantErr || !tenant) throw new AppError(500, "Could not load your store.", "internal_error");

  if (tenant.subscription_status !== "active") {
    const { count, error: countErr } = await supabase
      .from("portfolio_items")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (countErr) throw new AppError(500, "Could not check your portfolio.", "internal_error");
    if ((count ?? 0) >= 1) {
      throw Errors.subscriptionRequired(
        "Free plan is limited to 1 portfolio piece — subscribe to add more."
      );
    }
  }

  const form = await req.formData().catch(() => {
    throw Errors.badRequest("Request body must be multipart/form-data.");
  });

  const designId = (form.get("design_id") as string | null)?.trim() || null;
  const imageFile = form.get("image");
  const caption = (form.get("title") as string | null)?.trim() || null;
  const description = (form.get("description") as string | null)?.trim() || null;
  const materials = (form.get("materials") as string | null)?.trim() || null;

  let imageUrl: string;

  if (imageFile instanceof File && imageFile.size > 0) {
    try {
      imageUrl = await uploadPortfolioImage(supabase, tenantId, imageFile);
    } catch (err) {
      throw Errors.badRequest(err instanceof Error ? err.message : "Could not upload that image.");
    }
  } else if (designId) {
    const { data: design, error: designErr } = await supabase
      .from("designs")
      .select("id, generated_image_url")
      .eq("id", designId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (designErr) throw new AppError(500, "Could not look up that design.", "internal_error");
    if (!design || !design.generated_image_url) throw Errors.badRequest("That design isn't available to add.");
    imageUrl = design.generated_image_url;
  } else {
    throw Errors.badRequest("Provide either an image file or a design_id.");
  }

  const { data: maxRow } = await supabase
    .from("portfolio_items")
    .select("sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: item, error } = await supabase
    .from("portfolio_items")
    .insert({
      tenant_id: tenantId,
      design_id: designId,
      image_url: imageUrl,
      caption,
      description,
      materials,
      sort_order: nextSortOrder,
    })
    .select("*")
    .single();

  if (error || !item) throw new AppError(500, "Could not add this to your portfolio.", "internal_error");

  return NextResponse.json({ item }, { status: 201 });
});
