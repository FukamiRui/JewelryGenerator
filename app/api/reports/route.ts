import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

interface CreateReportBody {
  conversation_id: string;
  message_id?: string | null;
  reason: string;
  details?: string | null;
}

// Either participant in a conversation (customer or shop) can report the
// other side. This is the trust/safety backstop for the marketplace —
// separate from reviews, which are about a completed order's quality.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, userId } = await requireUser(req);

  const body: CreateReportBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });

  if (!body.conversation_id) throw Errors.badRequest("conversation_id is required.");
  const reason = body.reason?.trim();
  if (!reason) throw Errors.badRequest("reason is required.");
  if (reason.length > 200) throw Errors.badRequest("reason must be 200 characters or fewer.");

  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .select("id, tenant_id, customer_id")
    .eq("id", body.conversation_id)
    .single();

  if (convErr || !conversation) throw Errors.notFound("Conversation");

  const isCustomer = conversation.customer_id === userId;
  let reporterType: "customer" | "shop";

  if (isCustomer) {
    reporterType = "customer";
  } else {
    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .eq("tenant_id", conversation.tenant_id)
      .maybeSingle();
    if (!membership) throw Errors.forbidden("You're not part of this conversation.");
    reporterType = "shop";
  }

  const { data: report, error } = await supabase
    .from("reports")
    .insert({
      reporter_type: reporterType,
      reporter_id: userId,
      conversation_id: body.conversation_id,
      message_id: body.message_id ?? null,
      reason,
      details: body.details?.trim() || null,
    })
    .select("id, created_at")
    .single();

  if (error || !report) throw new AppError(500, "Could not submit your report.", "internal_error");

  return NextResponse.json({ report }, { status: 201 });
});
