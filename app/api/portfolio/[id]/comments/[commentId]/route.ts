import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

interface RouteParams {
  params: { id: string; commentId: string };
}

export const DELETE = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, customerId } = await requireCustomer(req);

  const { error, count } = await supabase
    .from("portfolio_comments")
    .delete({ count: "exact" })
    .eq("id", params.commentId)
    .eq("portfolio_item_id", params.id)
    .eq("customer_id", customerId);

  if (error) throw new AppError(500, "Could not delete this comment.", "internal_error");
  if (!count) throw Errors.notFound("Comment");

  return NextResponse.json({ ok: true });
});
