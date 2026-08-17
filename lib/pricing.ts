import type { Category, Material, GoldRate, PriceBreakdown, MetalCode } from "@/types/domain";

function resolveMetalCode(metal: Material): MetalCode {
  const tag = metal.ai_prompt_tag.toLowerCase();
  if (tag.includes("platinum") || tag.includes("pt9")) return "XPT";
  if (tag.includes("silver")) return "XAG";
  return "XAU";
}

interface CalculatePriceInput {
  category: Category;
  metal: Material;
  gemstones: Material[];
  estimatedWeightGrams: number;
  goldRates: Record<MetalCode, GoldRate>;
}

export function calculatePrice(input: CalculatePriceInput): PriceBreakdown {
  const { category, metal, gemstones, estimatedWeightGrams, goldRates } = input;

  const metalCode = resolveMetalCode(metal);
  const spotRate = goldRates[metalCode];
  if (!spotRate) {
    throw new Error(`No cached spot rate available for ${metalCode}`);
  }

  const metalUnitCost = metal.cost_per_gram_or_carat ?? spotRate.price_usd_per_gram;
  const metalCostUsd = metalUnitCost * estimatedWeightGrams;

  const gemstoneCostUsd = gemstones.reduce(
    (sum, g) => sum + (g.cost_per_gram_or_carat ?? 0),
    0
  );

  const processingCostUsd = category.base_processing_cost;

  const subtotalUsd = metalCostUsd + gemstoneCostUsd + processingCostUsd;

  const totalUsd = Math.round(subtotalUsd * metal.price_markup_ratio * 100) / 100;

  return {
    metal_cost_usd: Math.round(metalCostUsd * 100) / 100,
    gemstone_cost_usd: Math.round(gemstoneCostUsd * 100) / 100,
    processing_cost_usd: Math.round(processingCostUsd * 100) / 100,
    subtotal_usd: Math.round(subtotalUsd * 100) / 100,
    total_usd: totalUsd,
  };
}
