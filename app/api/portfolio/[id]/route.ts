import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

interface RouteParams {
  params: { id: string };
}

interface UpdatePortfolioItemBody {
  caption?: string | null;
  description?: string | null;
  materials?: string | null;
  sort_order?: number;
}

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, tenantId } = await requireTenant(req);

  const body: UpdatePortfolioItemBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });

  const update: Record<string, unknown> = {};
  if (body.caption !== undefined) update.caption = body.caption?.trim() || null;
  if (body.description !== undefined) update.description = body.description?.trim() || null;
  if (body.materials !== undefined) update.materials = body.materials?.trim() || null;
  if (body.sort_order !== undefined) {
    if (!Number.isInteger(body.sort_order)) throw Errors.badRequest("sort_order must be an integer.");
    update.sort_order = body.sort_order;
  }
  if (Object.keys(update).length === 0) throw Errors.badRequest("Nothing to update.");

  const { data: item, error } = await supabase
    .from("portfolio_items")
    .update(update)
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();

  if (error) throw new AppError(500, "Could not update this portfolio item.", "internal_error");
  if (!item) throw Errors.notFound("Portfolio item");

  return NextResponse.json({ item });
});

export const DELETE = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, tenantId } = await requireTenant(req);

  const { error, count } = await supabase
    .from("portfolio_items")
    .delete({ count: "exact" })
    .eq("id", params.id)
    .eq("tenant_id", tenantId);

  if (error) throw new AppError(500, "Could not remove this portfolio item.", "internal_error");
  if (!count) throw Errors.notFound("Portfolio item");

  return NextResponse.json({ ok: true });
});
