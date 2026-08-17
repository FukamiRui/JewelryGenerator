import { NextRequest, NextResponse } from "next/server";
import { getUserClient, getServiceClient, extractBearerToken } from "@/lib/supabase";
import { withErrorHandling, Errors, AppError } from "@/lib/api-error";

interface BootstrapBody {
  display_name: string;
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const token = extractBearerToken(req);
  if (!token) throw Errors.unauthorized();

  const userClient = getUserClient(token);
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) throw Errors.unauthorized();

  const { data: existing } = await userClient
    .from("customers")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  const service = getServiceClient();

  if (existing) {
    const { data: customer } = await service
      .from("customers")
      .select("user_id, display_name, avatar_url")
      .eq("user_id", userData.user.id)
      .single();
    return NextResponse.json({ customer });
  }

  const body: BootstrapBody = await req.json().catch(() => ({ display_name: "" }));
  const displayName = body.display_name?.trim();
  if (!displayName) throw new AppError(400, "Display name is required.", "bad_request");

  const { data: customer, error: insertErr } = await service
    .from("customers")
    .insert({
      user_id: userData.user.id,
      display_name: displayName,
      email_verified: !!userData.user.email_confirmed_at,
    })
    .select("user_id, display_name, avatar_url")
    .single();

  if (insertErr || !customer) {
    throw new AppError(500, "Could not create your customer profile.", "internal_error");
  }

  return NextResponse.json({ customer }, { status: 201 });
});
