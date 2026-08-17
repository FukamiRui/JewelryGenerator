import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

const CRON_SECRET = process.env.CRON_SECRET!;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("x-cron-secret");
  if (!CRON_SECRET || authHeader !== CRON_SECRET) {
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
