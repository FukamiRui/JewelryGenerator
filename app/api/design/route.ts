import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, AppError } from "@/lib/api-error";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { supabase } = await requireTenant(req);

  const search = req.nextUrl.searchParams.get("customer");
  let query = supabase
    .from("designs")
    .select(
      "id, customer_name, generated_image_url, calculated_price_usd, created_at, share_token, categories(name)"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (search) query = query.ilike("customer_name", `%${search}%`);

  const { data, error } = await query;
  if (error) throw new AppError(500, "Could not load design history.", "internal_error");

  return NextResponse.json({ designs: data });
});
