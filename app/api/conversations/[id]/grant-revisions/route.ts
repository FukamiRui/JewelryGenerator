import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

interface RouteParams {
  params: { id: string };
}

// Shop's "discretion" override once a customer has used all their
// self-service design tries for this request — resets the revision count
// without touching the tenant-wide max_design_revisions setting.
export const POST = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, tenantId } = await requireTenant(req);

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!conversation) throw Errors.notFound("Conversation");

  const { error } = await supabase
    .from("conversations")
    .update({ revision_grant_at: new Date().toISOString() })
    .eq("id", params.id);

  if (error) throw new AppError(500, "Could not grant more revisions.", "internal_error");

  return NextResponse.json({ ok: true });
});
