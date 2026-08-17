import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, getOptionalCustomerId } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

// How many recent candidates we scan before splitting into
// boosted-first / recency order and paginating in JS — see the shop
// directory's rating filter for the same bounded-scan approach.
const CANDIDATE_LIMIT = 300;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

interface PortfolioItemRow {
  id: string;
  tenant_id: string;
  media_type: "image" | "video";
  image_url: string | null;
  video_url: string | null;
  caption: string | null;
  description: string | null;
  materials: string | null;
  created_at: string;
  boost_expires_at: string | null;
  tenants: {
    id: string;
    company_name: string;
    logo_url: string | null;
    stripe_charges_enabled: boolean;
  } | null;
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const mode = params.get("mode") === "following" ? "following" : "discover";
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(params.get("limit")) || DEFAULT_PAGE_SIZE));

  const service = getServiceClient();
  const viewerCustomerId = await getOptionalCustomerId(req);

  let followedTenantIds: string[] | null = null;
  if (mode === "following") {
    if (!viewerCustomerId) throw Errors.unauthorized();
    const { data: follows } = await service
      .from("follows")
      .select("tenant_id")
      .eq("customer_id", viewerCustomerId);
    followedTenantIds = (follows ?? []).map((f) => f.tenant_id);
    if (followedTenantIds.length === 0) {
      return NextResponse.json({ items: [], has_more: false, mode });
    }
  }

  let query = service
    .from("portfolio_items")
    .select(
      "id, tenant_id, media_type, image_url, video_url, caption, description, materials, created_at, boost_expires_at, tenants!inner(id, company_name, logo_url, stripe_charges_enabled)"
    )
    .eq("tenants.is_public", true)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (followedTenantIds) query = query.in("tenant_id", followedTenantIds);

  const { data, error } = await query;
  if (error) throw new AppError(500, "Could not load the feed.", "internal_error");

  const candidates = (data ?? []) as unknown as PortfolioItemRow[];
  const now = Date.now();
  const boosted = candidates.filter((c) => c.boost_expires_at && new Date(c.boost_expires_at).getTime() > now);
  const rest = candidates.filter((c) => !(c.boost_expires_at && new Date(c.boost_expires_at).getTime() > now));
  const ordered = [...boosted, ...rest];

  const page = ordered.slice(offset, offset + limit);
  const hasMore = ordered.length > offset + limit;
  const pageIds = page.map((p) => p.id);

  let likeCounts = new Map<string, number>();
  let saveCounts = new Map<string, number>();
  let commentCounts = new Map<string, number>();
  let likedByViewer = new Set<string>();
  let savedByViewer = new Set<string>();

  if (pageIds.length > 0) {
    const [{ data: likes }, { data: saves }, { data: comments }] = await Promise.all([
      service.from("portfolio_likes").select("portfolio_item_id").in("portfolio_item_id", pageIds),
      service.from("portfolio_saves").select("portfolio_item_id").in("portfolio_item_id", pageIds),
      service.from("portfolio_comments").select("portfolio_item_id").in("portfolio_item_id", pageIds),
    ]);

    const tally = (rows: { portfolio_item_id: string }[] | null) => {
      const map = new Map<string, number>();
      for (const r of rows ?? []) map.set(r.portfolio_item_id, (map.get(r.portfolio_item_id) ?? 0) + 1);
      return map;
    };
    likeCounts = tally(likes);
    saveCounts = tally(saves);
    commentCounts = tally(comments);

    if (viewerCustomerId) {
      const [{ data: myLikes }, { data: mySaves }] = await Promise.all([
        service
          .from("portfolio_likes")
          .select("portfolio_item_id")
          .eq("customer_id", viewerCustomerId)
          .in("portfolio_item_id", pageIds),
        service
          .from("portfolio_saves")
          .select("portfolio_item_id")
          .eq("customer_id", viewerCustomerId)
          .in("portfolio_item_id", pageIds),
      ]);
      likedByViewer = new Set((myLikes ?? []).map((r) => r.portfolio_item_id));
      savedByViewer = new Set((mySaves ?? []).map((r) => r.portfolio_item_id));
    }
  }

  const items = page
    .filter((p) => p.tenants)
    .map((p) => ({
      id: p.id,
      media_type: p.media_type,
      image_url: p.image_url,
      video_url: p.video_url,
      caption: p.caption,
      description: p.description,
      materials: p.materials,
      created_at: p.created_at,
      boosted: !!(p.boost_expires_at && new Date(p.boost_expires_at).getTime() > now),
      shop: {
        id: p.tenants!.id,
        company_name: p.tenants!.company_name,
        logo_url: p.tenants!.logo_url,
        verified: p.tenants!.stripe_charges_enabled,
      },
      likes_count: likeCounts.get(p.id) ?? 0,
      saves_count: saveCounts.get(p.id) ?? 0,
      comments_count: commentCounts.get(p.id) ?? 0,
      liked: likedByViewer.has(p.id),
      saved: savedByViewer.has(p.id),
    }));

  return NextResponse.json({ items, has_more: hasMore, mode });
});
