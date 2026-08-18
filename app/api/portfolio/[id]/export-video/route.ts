import { NextRequest, NextResponse } from "next/server";
import { requireTenant, getServiceClient } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { exportVideoForPlatform, type SocialPlatform } from "@/lib/video-export";
import { persistExportedVideo } from "@/lib/image-cache";

interface RouteParams {
  params: { id: string };
}

interface ExportVideoBody {
  platform: SocialPlatform;
}

const VALID_PLATFORMS = new Set<SocialPlatform>(["tiktok", "twitter", "reels"]);

// Reformats an existing portfolio video for TikTok/Reels (vertical) or
// Twitter (square) via local ffmpeg — no external API, so no per-export
// cost. Downloadable only: this doesn't publish anywhere on its own.
export const POST = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, tenantId } = await requireTenant(req);

  const body: ExportVideoBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });
  if (!body.platform || !VALID_PLATFORMS.has(body.platform)) {
    throw Errors.badRequest("platform must be one of: tiktok, twitter, reels.");
  }

  const { data: item, error: itemErr } = await supabase
    .from("portfolio_items")
    .select("id, media_type, video_url")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (itemErr) throw new AppError(500, "Could not look up this portfolio item.", "internal_error");
  if (!item || item.media_type !== "video" || !item.video_url) {
    throw Errors.badRequest("This portfolio item isn't a video.");
  }

  let buffer: Buffer;
  try {
    buffer = await exportVideoForPlatform(item.video_url, body.platform);
  } catch (err) {
    console.error("[portfolio/export-video] transcode failed:", err);
    throw new AppError(502, err instanceof Error ? err.message : "Could not export this video.", "upstream_error");
  }

  let exportedUrl: string;
  try {
    // Service-role client — same pattern as persisting AI-generated images/video
    // (lib/design-generation.ts, persistGeneratedVideo): tenantId is already
    // verified via requireTenant above, and the current Storage RLS policies
    // don't grant authenticated users direct INSERT (see README's Known
    // Simplifications), so writes go through the trusted server-side client.
    exportedUrl = await persistExportedVideo(getServiceClient(), tenantId, buffer);
  } catch (err) {
    throw new AppError(500, err instanceof Error ? err.message : "Could not save the exported video.", "internal_error");
  }

  return NextResponse.json({ platform: body.platform, video_url: exportedUrl });
});
