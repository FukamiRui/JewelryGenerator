import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/supabase";
import { withErrorHandling, AppError } from "@/lib/api-error";

interface RouteParams {
  params: { tenantId: string };
}

export const DELETE = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, customerId } = await requireCustomer(req);

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("customer_id", customerId)
    .eq("tenant_id", params.tenantId);

  if (error) throw new AppError(500, "Could not unfollow this shop.", "internal_error");

  return NextResponse.json({ ok: true });
});
