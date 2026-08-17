import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

interface RouteParams {
  params: { id: string };
}

const BOOST_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CONCURRENT_BOOSTS = 3;

// Free promotion for now — see README "Known simplifications" for why
// there's no paid boost tier, just this per-shop concurrency cap to keep
// the feed from being dominated by one shop.
export const POST = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, tenantId } = await requireTenant(req);

  const { data: item } = await supabase
    .from("portfolio_items")
    .select("id, tenant_id")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!item) throw Errors.notFound("Portfolio item");

  const { count } = await supabase
    .from("portfolio_items")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gt("boost_expires_at", new Date().toISOString());

  if ((count ?? 0) >= MAX_CONCURRENT_BOOSTS) {
    throw Errors.badRequest(`You can only boost ${MAX_CONCURRENT_BOOSTS} pieces at a time. Wait for one to expire or unboost it first.`);
  }

  const boostExpiresAt = new Date(Date.now() + BOOST_DURATION_MS).toISOString();

  const { error } = await supabase
    .from("portfolio_items")
    .update({ boost_expires_at: boostExpiresAt })
    .eq("id", params.id);

  if (error) throw new AppError(500, "Could not boost this piece.", "internal_error");

  return NextResponse.json({ boost_expires_at: boostExpiresAt }, { status: 201 });
});

export const DELETE = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, tenantId } = await requireTenant(req);

  const { error, count } = await supabase
    .from("portfolio_items")
    .update({ boost_expires_at: null }, { count: "exact" })
    .eq("id", params.id)
    .eq("tenant_id", tenantId);

  if (error) throw new AppError(500, "Could not unboost this piece.", "internal_error");
  if (!count) throw Errors.notFound("Portfolio item");

  return NextResponse.json({ ok: true });
});
