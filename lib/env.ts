// Validates required environment variables once, at import time, so a
// missing key fails loudly with a clear message instead of surfacing later
// as a cryptic "fetch failed" or "undefined is not a function" deep in a
// route handler.

const REQUIRED_SERVER_VARS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GROQ_API_KEY",
  "FAL_API_KEY",
  "GOLD_API_KEY",
  "CRON_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

let validated = false;

/** Call at the top of any server-only module that reads process.env directly. */
export function assertServerEnv() {
  if (validated) return;
  const missing = REQUIRED_SERVER_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Copy .env.example to .env.local and fill these in before starting the server.`
    );
  }
  validated = true;
}

export function assertClientEnv() {
  // NOTE: this must use STATIC, literal `process.env.NEXT_PUBLIC_X` reads.
  // Next.js only inlines env vars into the browser bundle for expressions
  // it can statically find at build time — a dynamic `process.env[key]`
  // loop is invisible to that step and always reads as undefined in the
  // browser, even when the .env.local value is correct.
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required client environment variable(s): ${missing.join(", ")}.`
    );
  }
}
