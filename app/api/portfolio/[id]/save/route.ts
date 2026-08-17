import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

interface RouteParams {
  params: { id: string };
}

export const POST = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, customerId } = await requireCustomer(req);

  const { data: item } = await supabase.from("portfolio_items").select("id").eq("id", params.id).maybeSingle();
  if (!item) throw Errors.notFound("Portfolio item");

  const { error } = await supabase
    .from("portfolio_saves")
    .upsert({ customer_id: customerId, portfolio_item_id: params.id }, { onConflict: "customer_id,portfolio_item_id" });

  if (error) throw new AppError(500, "Could not save this.", "internal_error");
  return NextResponse.json({ ok: true }, { status: 201 });
});

export const DELETE = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { supabase, customerId } = await requireCustomer(req);

  const { error } = await supabase
    .from("portfolio_saves")
    .delete()
    .eq("customer_id", customerId)
    .eq("portfolio_item_id", params.id);

  if (error) throw new AppError(500, "Could not unsave this.", "internal_error");
  return NextResponse.json({ ok: true });
});
