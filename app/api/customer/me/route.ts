import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/supabase";
import { withErrorHandling, Errors } from "@/lib/api-error";

export const GET = withErrorHandling(async (req: Request) => {
  const { supabase, customerId } = await requireCustomer(req);

  const { data: customer, error } = await supabase
    .from("customers")
    .select("user_id, display_name, avatar_url")
    .eq("user_id", customerId)
    .single();

  if (error || !customer) throw Errors.noCustomer();

  return NextResponse.json({ customer });
});
