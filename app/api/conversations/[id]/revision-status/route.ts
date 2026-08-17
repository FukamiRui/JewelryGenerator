import { NextRequest, NextResponse } from "next/server";
import { requireUser, getServiceClient } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";
import { getRevisionStatus } from "@/lib/design-revisions";

interface RouteParams {
  params: { id: string };
}

export const GET = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, userId } = await requireUser(req);

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id, tenant_id, customer_id, created_at, revision_grant_at")
    .eq("id", params.id)
    .single();

  if (error || !conversation) throw Errors.notFound("Conversation");

  const service = getServiceClient();

  if (conversation.customer_id !== userId) {
    const { data: membership } = await service
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .eq("tenant_id", conversation.tenant_id)
      .maybeSingle();
    if (!membership) throw Errors.forbidden("You don't have access to this conversation.");
  }
  const { data: tenant } = await service
    .from("tenants")
    .select("max_design_revisions")
    .eq("id", conversation.tenant_id)
    .single();

  if (!tenant) throw new AppError(500, "Could not load this shop's settings.", "internal_error");

  const status = await getRevisionStatus(service, conversation, tenant.max_design_revisions);

  return NextResponse.json(status);
});
