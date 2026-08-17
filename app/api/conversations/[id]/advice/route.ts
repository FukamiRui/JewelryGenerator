import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase";
import { withErrorHandling, Errors } from "@/lib/api-error";
import { generateDesignAdvice } from "@/lib/design-advisor";

interface RouteParams {
  params: { id: string };
}

export const GET = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, userId } = await requireUser(req);

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id, tenant_id, customer_id")
    .eq("id", params.id)
    .single();

  if (error || !conversation) throw Errors.notFound("Conversation");

  if (conversation.customer_id !== userId) {
    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .eq("tenant_id", conversation.tenant_id)
      .maybeSingle();
    if (!membership) throw Errors.forbidden("You don't have access to this conversation.");
  }

  const advice = await generateDesignAdvice(supabase, params.id);

  return NextResponse.json({ advice });
});
