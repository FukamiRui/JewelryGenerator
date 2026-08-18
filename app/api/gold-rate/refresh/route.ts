import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { fetchAllSpotPrices } from "@/lib/gold-api";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

// Protects this endpoint from public invocation — only your cron scheduler
// (e.g. Vercel Cron, Supabase Edge Function schedule) should call it.
async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
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

// GET: Vercel Cron (sends GET + Authorization: Bearer $CRON_SECRET).
// POST: external/manual schedulers driven by the x-cron-secret header.
export const GET = handle;
export const POST = handle;
