import { NextRequest, NextResponse } from "next/server";
import { requireTenant, getServiceClient } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { uploadPortfolioImage, uploadPortfolioVideo, persistGeneratedVideo } from "@/lib/image-cache";
import { generateJewelryVideo, VIDEO_GENERATION_CREDIT_COST, DEFAULT_MOTION_PROMPT } from "@/lib/fal-video";
import { checkTenantGenerationCooldown } from "@/lib/rate-limit";

// Posts a video to a shop's portfolio — either a raw upload, or one
// generated from a source image (an existing design or a fresh upload) via
// fal.ai. Both paths cost VIDEO_GENERATION_CREDIT_COST credits: a video
// post is treated as the premium/metered action regardless of how the
// footage was produced (see README "Known simplifications").
export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, tenantId } = await requireTenant(req);

  const form = await req.formData().catch(() => {
    throw Errors.badRequest("Request body must be multipart/form-data.");
  });

  const videoFile = form.get("video");
  const designId = (form.get("design_id") as string | null)?.trim() || null;
  const imageFile = form.get("image");
  const motionPrompt = (form.get("motion_prompt") as string | null)?.trim() || DEFAULT_MOTION_PROMPT;
  const caption = (form.get("title") as string | null)?.trim() || null;
  const description = (form.get("description") as string | null)?.trim() || null;
  const materials = (form.get("materials") as string | null)?.trim() || null;

  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("monthly_credit_limit, credits_used_this_month, subscription_status")
    .eq("id", tenantId)
    .single();

  if (tenantErr || !tenant) throw new AppError(500, "Could not load your store.", "internal_error");
  // Video (generated or uploaded) is a subscriber-only feature, not just a
  // metered one — a free-tier shop can't post video at any credit price.
  if (tenant.subscription_status !== "active") {
    throw Errors.subscriptionRequired("Video posts require an active subscription — subscribe to unlock.");
  }
  if (tenant.credits_used_this_month + VIDEO_GENERATION_CREDIT_COST > tenant.monthly_credit_limit) {
    throw Errors.creditLimitReached();
  }
  await checkTenantGenerationCooldown(supabase, tenantId, "portfolio_items");

  let videoUrl: string;
  let posterImageUrl: string | null = null;

  if (videoFile instanceof File && videoFile.size > 0) {
    try {
      videoUrl = await uploadPortfolioVideo(supabase, tenantId, videoFile);
    } catch (err) {
      throw Errors.badRequest(err instanceof Error ? err.message : "Could not upload that video.");
    }
  } else {
    let sourceImageUrl: string;

    if (imageFile instanceof File && imageFile.size > 0) {
      try {
        sourceImageUrl = await uploadPortfolioImage(supabase, tenantId, imageFile);
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
      if (!design || !design.generated_image_url) throw Errors.badRequest("That design isn't available to use.");
      sourceImageUrl = design.generated_image_url;
    } else {
      throw Errors.badRequest("Provide a video file, or a design_id/image to generate one from.");
    }

    posterImageUrl = sourceImageUrl;

    let rawVideoUrl: string;
    try {
      rawVideoUrl = await generateJewelryVideo(sourceImageUrl, motionPrompt);
    } catch (err) {
      console.error("[portfolio/video] fal.ai generation failed:", err);
      throw Errors.upstream("Video generation");
    }

    try {
      videoUrl = await persistGeneratedVideo(supabase, tenantId, rawVideoUrl);
    } catch (err) {
      console.error("[portfolio/video] video storage failed:", err);
      throw Errors.upstream("Video storage");
    }
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
      media_type: "video",
      video_url: videoUrl,
      image_url: posterImageUrl,
      caption,
      description,
      materials,
      sort_order: nextSortOrder,
    })
    .select("*")
    .single();

  if (error || !item) throw new AppError(500, "Could not add this video to your portfolio.", "internal_error");

  const service = getServiceClient();
  const { error: creditErr } = await service.rpc("increment_credit_usage", {
    p_tenant_id: tenantId,
    p_amount: VIDEO_GENERATION_CREDIT_COST,
  });
  if (creditErr) console.error("[portfolio/video] credit increment failed:", creditErr);

  return NextResponse.json({ item }, { status: 201 });
});
