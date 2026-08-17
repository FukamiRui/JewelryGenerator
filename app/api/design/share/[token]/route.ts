import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

interface RouteParams {
  params: { token: string };
}

// No auth required — this is the public, customer-facing link sent via
// LINE/email after a store visit. Only exposes fields safe for a customer
// to see (never internal cost breakdowns, tenant credit usage, etc).
export async function GET(_req: NextRequest, { params }: RouteParams) {
  // Basic shape check before hitting the DB — a malformed token is a client
  // mistake (bad/truncated link), not a server error, so respond fast.
  if (!/^[0-9a-f-]{36}$/i.test(params.token)) {
    return NextResponse.json({ error: "Invalid share link." }, { status: 400 });
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("designs")
      .select(
        "id, generated_image_url, calculated_price_usd, created_at, categories(name), tenants(company_name, logo_url)"
      )
      .eq("share_token", params.token)
      .eq("status", "completed")
      .maybeSingle();

    if (error) {
      console.error("[design/share] query failed:", error);
      return NextResponse.json(
        { error: "Could not load this design right now." },
        { status: 502 }
      );
    }
    if (!data) {
      return NextResponse.json({ error: "This design link is no longer available." }, { status: 404 });
    }

    return NextResponse.json({
      image_url: data.generated_image_url,
      price_usd: data.calculated_price_usd,
      category: (data.categories as unknown as { name: string } | null)?.name,
      store: data.tenants,
      created_at: data.created_at,
    });
  } catch (err) {
    console.error("[design/share] unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
