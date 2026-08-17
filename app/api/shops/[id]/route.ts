import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, getOptionalCustomerId } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { computeAverageResponseHours } from "@/lib/response-time";

interface RouteParams {
  params: { id: string };
}

export const GET = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const service = getServiceClient();
  const viewerCustomerId = await getOptionalCustomerId(req);

  const { data: shop, error: shopErr } = await service
    .from("tenants")
    .select(
      "id, company_name, bio, logo_url, cover_image_url, location, specialty_materials, stripe_charges_enabled, returns_accepted, return_policy_note"
    )
    .eq("id", params.id)
    .eq("is_public", true)
    .maybeSingle();

  if (shopErr) throw new AppError(500, "Could not load this shop.", "internal_error");
  if (!shop) throw Errors.notFound("Shop");

  const [
    { data: portfolio },
    { data: reviews },
    { data: categories },
    { data: materials },
    averageResponseHours,
    { count: followerCount },
    isFollowing,
  ] = await Promise.all([
    service
      .from("portfolio_items")
      .select("id, media_type, image_url, video_url, caption, description, materials, sort_order, boost_expires_at")
      .eq("tenant_id", params.id)
      .order("sort_order", { ascending: true }),
    service
      .from("reviews")
      .select("id, rating, comment, created_at, customers(display_name)")
      .eq("tenant_id", params.id)
      .order("created_at", { ascending: false })
      .limit(50),
    service
      .from("categories")
      .select("id, name, ai_prompt_tag, base_processing_cost")
      .or(`tenant_id.eq.${params.id},tenant_id.is.null`)
      .eq("is_active", true),
    service
      .from("materials")
      .select("id, material_type, name, ai_prompt_tag, cost_per_gram_or_carat, price_markup_ratio")
      .or(`tenant_id.eq.${params.id},tenant_id.is.null`)
      .eq("is_active", true),
    computeAverageResponseHours(service, params.id),
    service.from("follows").select("customer_id", { count: "exact", head: true }).eq("tenant_id", params.id),
    viewerCustomerId
      ? service
          .from("follows")
          .select("customer_id")
          .eq("tenant_id", params.id)
          .eq("customer_id", viewerCustomerId)
          .maybeSingle()
          .then(({ data }) => !!data)
      : Promise.resolve(false),
  ]);

  const ratings = reviews ?? [];
  const averageRating = ratings.length
    ? Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length) * 10) / 10
    : null;

  return NextResponse.json({
    shop: {
      id: shop.id,
      company_name: shop.company_name,
      bio: shop.bio,
      logo_url: shop.logo_url,
      cover_image_url: shop.cover_image_url,
      location: shop.location,
      specialty_materials: shop.specialty_materials,
    },
    verified: shop.stripe_charges_enabled,
    returns_accepted: shop.returns_accepted,
    return_policy_note: shop.return_policy_note,
    average_response_hours: averageResponseHours,
    follower_count: followerCount ?? 0,
    is_following: isFollowing,
    average_rating: averageRating,
    review_count: ratings.length,
    reviews: ratings,
    portfolio: portfolio ?? [],
    catalog: {
      categories: categories ?? [],
      materials: materials ?? [],
    },
  });
});
