import { NextRequest, NextResponse } from "next/server";
import { getUserClient, getServiceClient, extractBearerToken } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

interface BootstrapBody {
  company_name: string;
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  if (!token) throw Errors.unauthorized();

  const userClient = getUserClient(token);
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) throw Errors.unauthorized();

  // Already has a store? Return it instead of creating a duplicate.
  const { data: existing } = await userClient
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userData.user.id)
    .limit(1)
    .maybeSingle();

  const service = getServiceClient();

  if (existing) {
    const { data: tenant } = await service
      .from("tenants")
      .select("id, company_name, plan, monthly_credit_limit, credits_used_this_month")
      .eq("id", existing.tenant_id)
      .maybeSingle();

    if (tenant) {
      return NextResponse.json({ tenant });
    }

    // Data integrity fallback: tenant_members pointed at a tenant_id that no
    // longer resolves (shouldn't happen — tenants.id has an ON DELETE CASCADE
    // to tenant_members — but silently returning `{ tenant: null }` with a
    // 200 here previously left the client stuck bouncing off /api/tenant/me's
    // 404 forever with no way out). Clear the dangling membership and fall
    // through to create a fresh store instead of leaving the user stranded.
    console.error(
      `[tenant/bootstrap] dangling tenant_members row for user ${userData.user.id} (tenant_id ${existing.tenant_id} not found) — clearing it`
    );
    await service
      .from("tenant_members")
      .delete()
      .eq("user_id", userData.user.id)
      .eq("tenant_id", existing.tenant_id);
  }

  const body: BootstrapBody = await req.json().catch(() => ({ company_name: "" }));
  const companyName = body.company_name?.trim();
  if (!companyName) throw new AppError(400, "Store name is required.", "bad_request");

  // Service-role client needed here: RLS has no INSERT policy for tenants
  // (creation only happens through this trusted, identity-verified route).
  const { data: tenant, error: tenantErr } = await service
    .from("tenants")
    .insert({ company_name: companyName })
    .select("id, company_name, plan, monthly_credit_limit, credits_used_this_month")
    .single();

  if (tenantErr || !tenant) {
    throw new AppError(500, "Could not create your store account.", "internal_error");
  }

  const { error: memberErr } = await service
    .from("tenant_members")
    .insert({ user_id: userData.user.id, tenant_id: tenant.id, role: "owner" });

  if (memberErr) {
    // Roll back the orphaned tenant so retrying doesn't pile up dead rows.
    await service.from("tenants").delete().eq("id", tenant.id);
    throw new AppError(500, "Could not link your account to the new store.", "internal_error");
  }

  return NextResponse.json({ tenant }, { status: 201 });
});
