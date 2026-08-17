import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { fetchAllSpotPrices } from "@/lib/gold-api";

// Protects this endpoint from public invocation — only your cron scheduler
// (e.g. Vercel Cron, Supabase Edge Function schedule) should call it.
const CRON_SECRET = process.env.CRON_SECRET!;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("x-cron-secret");
  if (!CRON_SECRET || authHeader !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const prices = await fetchAllSpotPrices();
    const supabase = getServiceClient();

    const rows = (Object.keys(prices) as (keyof typeof prices)[]).map((metal) => ({
      metal_code: metal,
      price_usd_per_gram: prices[metal],
    }));

    const { error } = await supabase.from("gold_rates").insert(rows);
    if (error) {
      console.error("[gold-rate/refresh] insert failed:", error);
      return NextResponse.json({ error: "Could not save spot prices." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rates: prices });
  } catch (err) {
    // Covers Gold API being down/rate-limited/timing out — logged for
    // ops visibility, and a 502 so the cron scheduler's retry logic (if any) kicks in.
    console.error("[gold-rate/refresh] failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch spot prices from the upstream provider." },
      { status: 502 }
    );
  }
}
