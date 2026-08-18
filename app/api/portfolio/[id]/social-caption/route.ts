import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { generateSocialCaption, type SocialPlatform } from "@/lib/social-copy";

interface RouteParams {
  params: { id: string };
}

interface SocialCaptionBody {
  platform: SocialPlatform;
}

const VALID_PLATFORMS = new Set<SocialPlatform>(["tiktok", "twitter", "reels"]);

export const POST = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, tenantId } = await requireTenant(req);

  const body: SocialCaptionBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });
  if (!body.platform || !VALID_PLATFORMS.has(body.platform)) {
    throw Errors.badRequest("platform must be one of: tiktok, twitter, reels.");
  }

  const { data: item, error: itemErr } = await supabase
    .from("portfolio_items")
    .select("caption, materials")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (itemErr) throw new AppError(500, "Could not look up this portfolio item.", "internal_error");
  if (!item) throw Errors.notFound("Portfolio item");

  let result;
  try {
    result = await generateSocialCaption({
      title: item.caption ?? undefined,
      materials: item.materials ?? undefined,
      platform: body.platform,
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Give it at least")) {
      throw Errors.badRequest(err.message);
    }
    throw new AppError(502, err instanceof Error ? err.message : "Could not generate a caption.", "upstream_error");
  }

  return NextResponse.json(result);
});
