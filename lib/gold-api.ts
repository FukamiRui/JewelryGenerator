import type { MetalCode } from "@/types/domain";

if (!process.env.GOLD_API_KEY) {
  throw new Error("Missing GOLD_API_KEY — check .env.local");
}
const GOLD_API_KEY = process.env.GOLD_API_KEY;
const GOLD_API_BASE = "https://www.goldapi.io/api";

// Troy ounce -> gram
const GRAMS_PER_TROY_OUNCE = 31.1034768;

interface GoldApiResponse {
  price: number; // USD per troy ounce (goldapi.io default)
  price_gram_24k?: number;
}

/**
 * Fetches the current spot price for a single metal, in USD per gram.
 * Uses goldapi.io's XAU/XPT/XAG-to-USD pair endpoint.
 * Swap this implementation for Metals-API or another provider if preferred —
 * callers only depend on the returned number (USD/gram).
 */
export async function fetchSpotPriceUsdPerGram(metal: MetalCode): Promise<number> {
  const res = await fetch(`${GOLD_API_BASE}/${metal}/USD`, {
    headers: {
      "x-access-token": GOLD_API_KEY,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Gold API request failed for ${metal}: ${res.status} ${res.statusText}`);
  }

  const data: GoldApiResponse = await res.json();

  const pricePerGram =
    data.price_gram_24k ?? data.price / GRAMS_PER_TROY_OUNCE;

  return Math.round(pricePerGram * 100) / 100;
}

export async function fetchAllSpotPrices(): Promise<Record<MetalCode, number>> {
  const metals: MetalCode[] = ["XAU", "XPT", "XAG"];
  const results = await Promise.all(metals.map(fetchSpotPriceUsdPerGram));
  return {
    XAU: results[0],
    XPT: results[1],
    XAG: results[2],
  };
}
