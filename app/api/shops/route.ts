import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { withErrorHandling, AppError } from "@/lib/api-error";
import { haversineDistanceKm } from "@/lib/geo";

const FETCH_LIMIT = 200;
const RESULT_LIMIT = 50;

export const GET = withErrorHandling(async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const search = params.get("q");
  const location = params.get("location");
  const materials = params.get("materials")?.split(",").map((m) => m.trim()).filter(Boolean) ?? [];
  const verifiedOnly = params.get("verified") === "true";
  const returnsOnly = params.get("returns_accepted") === "true";
  const minRating = params.get("min_rating") ? Number(params.get("min_rating")) : null;
  const viewerLat = params.get("lat") ? Number(params.get("lat")) : null;
  const viewerLng = params.get("lng") ? Number(params.get("lng")) : null;
  const sortByDistance = viewerLat !== null && viewerLng !== null && !Number.isNaN(viewerLat) && !Number.isNaN(viewerLng);

  const service = getServiceClient();

  let query = service
    .from("tenants")
    .select(
      "id, company_name, bio, logo_url, cover_image_url, location, latitude, longitude, specialty_materials, stripe_charges_enabled, returns_accepted"
    )
    .eq("is_public", true)
    .order("company_name", { ascending: true })
    .limit(FETCH_LIMIT);

  if (search) query = query.ilike("company_name", `%${search}%`);
  if (location) query = query.ilike("location", `%${location}%`);
  if (materials.length > 0) query = query.overlaps("specialty_materials", materials);
  if (verifiedOnly) query = query.eq("stripe_charges_enabled", true);
  if (returnsOnly) query = query.eq("returns_accepted", true);

  const { data: shops, error } = await query;
  if (error) throw new AppError(500, "Could not load shops.", "internal_error");

  const shopIds = (shops ?? []).map((s) => s.id);
  const { data: reviews } = shopIds.length
    ? await service.from("reviews").select("tenant_id, rating").in("tenant_id", shopIds)
    : { data: [] as { tenant_id: string; rating: number }[] };

  const ratingByTenant = new Map<string, { sum: number; count: number }>();
  for (const r of reviews ?? []) {
    const entry = ratingByTenant.get(r.tenant_id) ?? { sum: 0, count: 0 };
    entry.sum += r.rating;
    entry.count += 1;
    ratingByTenant.set(r.tenant_id, entry);
  }

  let result = (shops ?? []).map((s) => {
    const stats = ratingByTenant.get(s.id);
    const hasCoords = s.latitude !== null && s.longitude !== null;
    return {
      id: s.id,
      company_name: s.company_name,
      bio: s.bio,
      logo_url: s.logo_url,
      cover_image_url: s.cover_image_url,
      location: s.location,
      specialty_materials: s.specialty_materials,
      verified: s.stripe_charges_enabled,
      returns_accepted: s.returns_accepted,
      average_rating: stats ? Math.round((stats.sum / stats.count) * 10) / 10 : null,
      review_count: stats?.count ?? 0,
      distance_km:
        sortByDistance && hasCoords
          ? Math.round(haversineDistanceKm(viewerLat!, viewerLng!, s.latitude!, s.longitude!) * 10) / 10
          : null,
    };
  });

  if (minRating) {
    result = result.filter((s) => (s.average_rating ?? 0) >= minRating);
  }

  if (sortByDistance) {
    // Shops without coordinates can't be placed on the map — push them to
    // the end rather than dropping them, so "near me" degrades to "no
    // distance info" instead of hiding shops that just haven't set a pin.
    result.sort((a, b) => {
      if (a.distance_km === null && b.distance_km === null) return 0;
      if (a.distance_km === null) return 1;
      if (b.distance_km === null) return -1;
      return a.distance_km - b.distance_km;
    });
  }

  result = result.slice(0, RESULT_LIMIT);

  // Stable option lists for filter dropdowns — computed across all public
  // shops, not just the current filtered result, so options don't shrink
  // as the user filters.
  const { data: allTenants } = await service
    .from("tenants")
    .select("location, specialty_materials")
    .eq("is_public", true)
    .limit(FETCH_LIMIT);

  const locations = [...new Set((allTenants ?? []).map((t) => t.location).filter((v): v is string => !!v))].sort();
  const materialOptions = [
    ...new Set((allTenants ?? []).flatMap((t) => t.specialty_materials ?? [])),
  ].sort();

  return NextResponse.json({
    shops: result,
    filters: { locations, materials: materialOptions },
  });
});
