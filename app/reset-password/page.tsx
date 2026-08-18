"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase-browser";

function translateAuthError(message: string): string {
  if (message.includes("Password should be at least")) return "Password must be at least 6 characters.";
  if (message.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
  return message;
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  // Which login page to send them back to once the password is updated —
  // the recovery link itself has no other way to tell shop vs. customer.
  const loginPath = searchParams.get("type") === "customer" ? "/customer/login" : "/login";

  const [status, setStatus] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();

    // Clicking the emailed reset link lands here with a recovery token in
    // the URL, which the client library exchanges for a session on load —
    // either fires as a PASSWORD_RECOVERY auth event or is already present
    // by the time we check, depending on timing.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setStatus("ready");
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStatus("ready");
    });

    const timeout = setTimeout(() => {
      setStatus((s) => (s === "checking" ? "invalid" : s));
    }, 4000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const supabase = getBrowserClient();
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      await supabase.auth.signOut();
      setStatus("done");
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

        {status === "checking" && (
          <p className="mt-8 text-sm text-stone">Checking your reset link…</p>
        )}

        {status === "invalid" && (
          <div className="mt-8 flex flex-col gap-3">
            <p className="rounded-sm bg-ink/5 px-3 py-2.5 text-sm text-ink">
              This reset link is invalid or has expired.
            </p>
            <a href={loginPath} className="self-start text-xs text-gold hover:underline">
              Request a new one
            </a>
          </div>
        )}

        {status === "done" && (
          <div className="mt-8 flex flex-col gap-3">
            <p className="rounded-sm bg-ink/5 px-3 py-2.5 text-sm text-ink">
              Password updated. Sign in with your new password.
            </p>
            <a href={loginPath} className="self-start text-xs text-gold hover:underline">
              Go to sign in
            </a>
          </div>
        )}

        {status === "ready" && (
          <>
            <p className="mt-1 text-sm text-stone">Set a new password</p>
            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
              <input
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="rounded-sm border border-line-light bg-white px-3 py-2.5 text-sm focus:border-gold"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
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
                {submitting ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
