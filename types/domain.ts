// =========================================================
// Shared domain types
// =========================================================

export type MetalCode = "XAU" | "XPT" | "XAG";

export type MaterialType = "metal" | "gemstone" | "finish";

export interface Tenant {
  id: string;
  company_name: string;
  plan: "standard" | "pro" | "enterprise";
  monthly_credit_limit: number;
  credits_used_this_month: number;
  logo_url?: string | null;
  cover_image_url?: string | null;
  bio: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  specialty_materials: string[];
  returns_accepted: boolean;
  return_policy_note: string | null;
  max_design_revisions: number;
}

export interface Category {
  id: string;
  tenant_id: string | null;
  name: string;
  ai_prompt_tag: string;
  base_processing_cost: number;
}

export interface Material {
  id: string;
  tenant_id: string | null;
  material_type: MaterialType;
  name: string;
  ai_prompt_tag: string;
  density: number | null;
  cost_per_gram_or_carat: number | null;
  price_markup_ratio: number;
}

export interface GoldRate {
  metal_code: MetalCode;
  price_usd_per_gram: number;
  fetched_at: string;
}

// What the frontend sends when the user has finished picking options.
// tenant_id is deliberately NOT here — the server resolves it from the
// caller's session (see requireTenant in lib/supabase.ts), so a client can
// never act on another store's data by editing this payload.
export interface DesignSelection {
  category_id: string;
  metal_material_id: string;
  gemstone_material_ids: string[]; // main stone + side stones, can be empty
  finish_material_id: string | null;
  estimated_weight_grams: number; // derived from size/volume estimate on the frontend
  customer_name?: string;
}

export interface PromptResult {
  prompt: string; // final English prompt for FLUX.1 [pro]
}

export interface PriceBreakdown {
  metal_cost_usd: number;
  gemstone_cost_usd: number;
  processing_cost_usd: number;
  subtotal_usd: number;
  total_usd: number; // after markup
}

export interface GenerateDesignResponse {
  design_id: string;
  generated_image_url: string;
  generated_prompt: string;
  price: PriceBreakdown;
  share_token: string;
  cached: boolean;
}
