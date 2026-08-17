import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const { supabase, customerId } = await requireCustomer(req);

  const { data, error } = await supabase
    .from("follows")
    .select("tenant_id")
    .eq("customer_id", customerId);

  if (error) throw new AppError(500, "Could not load your follows.", "internal_error");

  return NextResponse.json({ tenant_ids: (data ?? []).map((f) => f.tenant_id) });
});

interface FollowBody {
  tenant_id: string;
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const { supabase, customerId } = await requireCustomer(req);

  const body: FollowBody = await req.json().catch(() => {
    throw Errors.badRequest("Request body must be valid JSON.");
  });
  if (!body.tenant_id) throw Errors.badRequest("tenant_id is required.");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("id", body.tenant_id)
    .eq("is_public", true)
    .maybeSingle();
  if (!tenant) throw Errors.notFound("Shop");

  const { error } = await supabase
    .from("follows")
    .upsert({ customer_id: customerId, tenant_id: body.tenant_id }, { onConflict: "customer_id,tenant_id" });

  if (error) throw new AppError(500, "Could not follow this shop.", "internal_error");

  return NextResponse.json({ ok: true }, { status: 201 });
});
