import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

interface RouteParams {
  params: { id: string };
}

interface UpdateDesignBody {
  title?: string | null;
}

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, tenantId } = await requireTenant(req);

  const body: UpdateDesignBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });

  if (body.title === undefined) throw Errors.badRequest("Nothing to update.");

  const { data: design, error } = await supabase
    .from("designs")
    .update({ title: body.title?.trim() || null })
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .select("id, title")
    .maybeSingle();

  if (error) throw new AppError(500, "Could not update this design.", "internal_error");
  if (!design) throw Errors.notFound("Design");

  return NextResponse.json({ design });
});

export const DELETE = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, tenantId } = await requireTenant(req);

  const { error, count } = await supabase
    .from("designs")
    .delete({ count: "exact" })
    .eq("id", params.id)
    .eq("tenant_id", tenantId);

  if (error) throw new AppError(500, "Could not delete this design.", "internal_error");
  if (!count) throw Errors.notFound("Design");

  return NextResponse.json({ ok: true });
});
