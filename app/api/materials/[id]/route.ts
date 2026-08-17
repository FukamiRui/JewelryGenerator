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
  const { name, ai_prompt_tag, density, cost_per_gram_or_carat, price_markup_ratio, is_active } = body;

  const { data, error } = await supabase
    .from("materials")
    .update({ name, ai_prompt_tag, density, cost_per_gram_or_carat, price_markup_ratio, is_active })
    .eq("id", params.id)
    .select()
    .single();

  if (error) throw new AppError(400, "Could not update material.", "bad_request");
  if (!data) throw Errors.notFound("Material");

  return NextResponse.json({ material: data });
});

export const DELETE = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase } = await requireTenant(req);

  const { data, error } = await supabase
    .from("materials")
    .update({ is_active: false })
    .eq("id", params.id)
    .select()
    .single();

  if (error) throw new AppError(400, "Could not remove material.", "bad_request");
  if (!data) throw Errors.notFound("Material");

  return NextResponse.json({ ok: true });
});
