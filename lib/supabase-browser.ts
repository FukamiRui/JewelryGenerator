"use client";

import { createBrowserClient } from "@supabase/ssr";
import { assertClientEnv } from "@/lib/env";

export function getBrowserClient() {
  assertClientEnv();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
