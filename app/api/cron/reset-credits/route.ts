import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getServiceClient();
    const { error } = await supabase.rpc("reset_monthly_credits");
    if (error) {
      console.error("[cron/reset-credits] rpc failed:", error);
      return NextResponse.json({ error: "Reset failed." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, reset_at: new Date().toISOString() });
  } catch (err) {
    console.error("[cron/reset-credits] unexpected error:", err);
    return NextResponse.json({ error: "Reset failed." }, { status: 500 });
  }
}

// GET: Vercel Cron (sends GET + Authorization: Bearer $CRON_SECRET).
// POST: external/manual schedulers driven by the x-cron-secret header.
export const GET = handle;
export const POST = handle;
