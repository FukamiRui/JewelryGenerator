"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase-browser";
import { bootstrapTenant } from "@/lib/api-client";

type Mode = "sign_in" | "sign_up";

function translateAuthError(message: string): string {
  // Supabase auth errors come back in English; map the common ones to
  // clearer copy rather than showing raw provider text.
  if (message.includes("Invalid login credentials")) {
    return "Email or password is incorrect.";
  }
  if (message.includes("User already registered")) {
    return "An account with this email already exists — try signing in instead.";
  }
  if (message.includes("Password should be at least")) {
    return "Password must be at least 6 characters.";
  }
  if (message.includes("rate limit")) {
    return "Too many attempts — please wait a moment and try again.";
  }
  return message;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/simulator";

  const [mode, setMode] = useState<Mode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "sign_up" && !companyName.trim()) {
      setError("Store name is required.");
      return;
    }

    setSubmitting(true);
    const supabase = getBrowserClient();

    try {
      if (mode === "sign_up") {
        const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
        if (signUpErr) throw signUpErr;
        if (!data.session) {
          // Email confirmation is required by this Supabase project's settings.
          setError(
            "Check your email to confirm your account, then sign in."
          );
          setMode("sign_in");
          return;
        }
        // Create the tenant/store row now that we have a verified session.
        await bootstrapTenant(data.session.access_token, companyName);
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) throw signInErr;
      }

      router.push(nextPath);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(translateAuthError(message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-pearl px-6">
      <div className="w-full max-w-sm">
        <p className="font-display text-2xl text-ink">Atelier</p>
        <p className="mt-1 text-sm text-stone">
          {mode === "sign_in" ? "Sign in to your store" : "Create your store account"}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
          {mode === "sign_up" && (
            <input
              type="text"
              placeholder="Store name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              className="rounded-sm border border-line-light bg-white px-3 py-2.5 text-sm focus:border-gold"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="rounded-sm border border-line-light bg-white px-3 py-2.5 text-sm focus:border-gold"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
            className="rounded-sm border border-line-light bg-white px-3 py-2.5 text-sm focus:border-gold"
          />

          {error && (
            <p role="alert" className="rounded-sm bg-ink/5 px-3 py-2 text-xs text-ink">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-sm bg-ink py-2.5 text-sm text-pearl transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? "Please wait…"
              : mode === "sign_in"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "sign_in" ? "sign_up" : "sign_in");
            setError(null);
          }}
          className="mt-4 text-xs text-stone hover:text-ink"
        >
          {mode === "sign_in"
            ? "New store? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
