import type { NextRequest } from "next/server";

// Two schedulers, two conventions: Vercel Cron sends GET requests and
// authenticates via `Authorization: Bearer $CRON_SECRET` (set as a project
// env var); a manually-configured external scheduler (cron-job.org, a
// Supabase Edge Function, curl) is more naturally driven via POST with a
// custom `x-cron-secret` header. Accepting both means the same route works
// with either without picking one scheduler in the code.
export function isAuthorizedCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const customHeader = req.headers.get("x-cron-secret");
  if (customHeader === secret) return true;

  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}
