import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { AppError, Errors } from "@/lib/api-error";

// Checked lazily (inside each function below), not at module load — a
// top-level throw here would fail Next.js's build-time page-data
// collection for every route that imports this module (nearly all of
// them), even in environments where the vars just aren't visible at build
// time. Still required at actual request time, same as before.
function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("Missing SUPABASE_URL — check .env.local");
  return url;
}

function getSupabaseAnonKey(): string {
  const key = process.env.SUPABASE_ANON_KEY;
  if (!key) throw new Error("Missing SUPABASE_ANON_KEY — check .env.local");
  return key;
}

function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY — check .env.local");
  return key;
}

export function getServiceClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false },
  });
}

export function getUserClient(accessToken: string): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export interface TenantContext {
  supabase: SupabaseClient;
  userId: string;
  tenantId: string;
}

export async function requireTenant(req: Request): Promise<TenantContext> {
  const token = extractBearerToken(req);
  if (!token) throw Errors.unauthorized();

  const supabase = getUserClient(token);
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw Errors.unauthorized();

  const { data: membership, error: memErr } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userData.user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) throw new AppError(500, "Could not resolve your store account.", "internal_error");
  if (!membership) throw Errors.noTenant();

  return { supabase, userId: userData.user.id, tenantId: membership.tenant_id };
}

export interface CustomerContext {
  supabase: SupabaseClient;
  userId: string;
  customerId: string;
}

export async function requireCustomer(req: Request): Promise<CustomerContext> {
  const token = extractBearerToken(req);
  if (!token) throw Errors.unauthorized();

  const supabase = getUserClient(token);
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw Errors.unauthorized();

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (custErr) throw new AppError(500, "Could not resolve your customer profile.", "internal_error");
  if (!customer) throw Errors.noCustomer();

  return { supabase, userId: userData.user.id, customerId: customer.user_id };
}

export async function requireUser(req: Request): Promise<{ supabase: SupabaseClient; userId: string }> {
  const token = extractBearerToken(req);
  if (!token) throw Errors.unauthorized();

  const supabase = getUserClient(token);
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw Errors.unauthorized();

  return { supabase, userId: userData.user.id };
}

/**
 * Best-effort customer identification for public endpoints that want to
 * personalize their response (e.g. "is this shop followed by the caller?")
 * without requiring auth. Never throws — returns null on any failure
 * (no token, invalid token, no customer profile).
 */
export async function getOptionalCustomerId(req: Request): Promise<string | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  try {
    const supabase = getUserClient(token);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;

    const { data: customer } = await supabase
      .from("customers")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    return customer?.user_id ?? null;
  } catch {
    return null;
  }
}
