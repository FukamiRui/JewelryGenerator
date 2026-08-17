import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/supabase";
import { withErrorHandling, AppError } from "@/lib/api-error";
import type { MetalCode } from "@/types/domain";

export const GET = withErrorHandling(async (req: Request) => {
  const { supabase } = await requireTenant(req);
  const metals: MetalCode[] = ["XAU", "XPT", "XAG"];

  const results = await Promise.all(
    metals.map(async (metal) => {
      const { data, error } = await supabase
        .from("gold_rates")
        .select("metal_code, price_usd_per_gram, fetched_at")
        .eq("metal_code", metal)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new AppError(502, "Could not load spot prices.", "upstream_error");
      return data;
    })
  );

  if (results.every((r) => !r)) {
    // Cache has never been populated (e.g. the hourly cron hasn't run yet) —
    // this is a real operational state, not a bug, so surface it clearly
    // rather than returning an empty object the frontend would misread as $0.
    throw new AppError(
      503,
      "Spot prices are not available yet. Please try again in a few minutes.",
      "rates_unavailable"
    );
  }

  const rates = Object.fromEntries(results.filter(Boolean).map((r) => [r!.metal_code, r]));
  return NextResponse.json({ rates });
});
