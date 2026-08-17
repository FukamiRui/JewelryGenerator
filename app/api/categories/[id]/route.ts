import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

interface RouteParams {
  params: { id: string };
}

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase } = await requireTenant(req);

  const body = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });
  const { name, ai_prompt_tag, base_processing_cost, sort_order, is_active } = body;

  const { data, error } = await supabase
    .from("categories")
    .update({ name, ai_prompt_tag, base_processing_cost, sort_order, is_active })
    .eq("id", params.id)
    .select()
    .single();

  // RLS silently returns 0 rows for another tenant's row or a system default —
  // that shows up here as a missing row, which we report as 404, not a leak.
  if (error) throw new AppError(400, "Could not update category.", "bad_request");
  if (!data) throw Errors.notFound("Category");

  return NextResponse.json({ category: data });
});

export const DELETE = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase } = await requireTenant(req);

  // Soft delete — keeps historical designs that reference this category intact.
  const { data, error } = await supabase
    .from("categories")
    .update({ is_active: false })
    .eq("id", params.id)
    .select()
    .single();

  if (error) throw new AppError(400, "Could not remove category.", "bad_request");
  if (!data) throw Errors.notFound("Category");

  return NextResponse.json({ ok: true });
});
