"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase-browser";
import { AuthProvider } from "@/lib/auth-context";
import { fetchTenant, bootstrapTenant, ApiRequestError } from "@/lib/api-client";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { TutorialModal } from "@/components/ui/TutorialModal";
import type { Tenant } from "@/types/domain";

const TUTORIAL_SEEN_KEY = "atelier_tutorial_seen";

const NAV_ITEMS = [
  { href: "/simulator", label: "Simulator" },
  { href: "/materials", label: "Materials" },
  { href: "/history", label: "History" },
  { href: "/messages", label: "Messages" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/settings", label: "Settings" },
  { href: "/help", label: "Help" },
];

function Navbar({
  tenant,
  onSignOut,
  onOpenTutorial,
}: {
  tenant: Tenant | null;
  onSignOut: () => void;
  onOpenTutorial: () => void;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const remaining = tenant ? tenant.monthly_credit_limit - tenant.credits_used_this_month : null;

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <nav className="border-b border-line-light bg-white">
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-8">
          <span className="font-display text-lg text-ink">Atelier</span>
          <div className="hidden gap-1 lg:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
                  pathname.startsWith(item.href)
                    ? "bg-ink text-pearl"
                    : "text-stone hover:bg-pearl hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="hidden items-center gap-4 lg:flex">
          {tenant && (
            <span className="font-mono text-xs text-stone">
              {tenant.company_name} · {remaining} / {tenant.monthly_credit_limit} credits left
            </span>
          )}
          <button
            onClick={onOpenTutorial}
            className="rounded-full border border-line-light px-3 py-1 text-xs text-stone transition-colors hover:border-gold hover:text-ink"
          >
            How this works
          </button>
          <button onClick={onSignOut} className="text-xs text-stone hover:text-ink">
            Sign out
          </button>
        </div>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          className="flex h-9 w-9 items-center justify-center rounded-sm text-ink lg:hidden"
        >
          {menuOpen ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M1 1L17 17M17 1L1 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <path d="M0 1H18M0 7H18M0 13H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>
      {menuOpen && (
        <div className="flex flex-col gap-1 border-t border-line-light px-4 py-3 lg:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-sm px-3 py-2 text-sm transition-colors ${
                pathname.startsWith(item.href)
                  ? "bg-ink text-pearl"
                  : "text-stone hover:bg-pearl hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-line-light pt-3">
            {tenant && (
              <span className="font-mono text-xs text-stone">
                {tenant.company_name} · {remaining} / {tenant.monthly_credit_limit} credits left
              </span>
            )}
            <button
              onClick={onOpenTutorial}
              className="self-start rounded-full border border-line-light px-3 py-1 text-xs text-stone transition-colors hover:border-gold hover:text-ink"
            >
              How this works
            </button>
            <button onClick={onSignOut} className="self-start text-xs text-stone hover:text-ink">
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

function CreateStoreForm({
  accessToken,
  onCreated,
  onSignOut,
}: {
  accessToken: string;
  onCreated: () => void;
  onSignOut: () => void;
}) {
  const [companyName, setCompanyName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) {
      setError("Store name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await bootstrapTenant(accessToken, companyName.trim());
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your store. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-pearl px-6 text-center">
      <p className="font-display text-lg text-ink">No store is linked to this account yet</p>
      <p className="max-w-sm text-sm text-stone">
        This can happen if sign-up was interrupted before a store was created (e.g. an email
        confirmation step). Enter your store name to finish setup.
      </p>
      <form onSubmit={handleSubmit} className="mt-2 flex w-full max-w-xs flex-col gap-2">
        <input
          type="text"
          placeholder="Store name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
          className="rounded-sm border border-line-light bg-white px-3 py-2 text-sm focus:border-gold"
        />
        {error && (
          <p role="alert" className="text-xs text-ink">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-sm bg-ink py-2 text-sm text-pearl hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create store"}
        </button>
      </form>
      <button onClick={onSignOut} className="mt-2 text-xs text-stone hover:text-ink">
        Sign out instead
      </button>
    </div>
  );
}

function DashboardInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "no_tenant" | "error">("loading");
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const loadTenant = useCallback(async (token: string) => {
    try {
      const t = await fetchTenant(token);
      setTenant(t);
      setStatus("ready");
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        setStatus("no_tenant");
      } else {
        toast.push("Could not load your store account.");
        setStatus("error");
      }
    }
  }, [toast]);

  useEffect(() => {
    const supabase = getBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/login");
        return;
      }
      setAccessToken(data.session.access_token);
      setUserId(data.session.user.id);
      setUserEmail(data.session.user.email ?? "");
      loadTenant(data.session.access_token);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push("/login");
        return;
      }
      setAccessToken(session.access_token);
      setUserId(session.user.id);
      setUserEmail(session.user.email ?? "");
    });

    return () => sub.subscription.unsubscribe();
  }, [router, loadTenant]);

  useEffect(() => {
    if (status !== "ready") return;
    if (!window.localStorage.getItem(TUTORIAL_SEEN_KEY)) {
      setTutorialOpen(true);
    }
  }, [status]);

  useEffect(() => {
    function handleOpenRequest() {
      setTutorialOpen(true);
    }
    window.addEventListener("atelier:open-tutorial", handleOpenRequest);
    return () => window.removeEventListener("atelier:open-tutorial", handleOpenRequest);
  }, []);

  function handleCloseTutorial() {
    setTutorialOpen(false);
    window.localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
  }

  async function handleSignOut() {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (status === "loading" || !accessToken) {
    return (
      <div className="flex h-screen items-center justify-center bg-pearl">
        <p className="font-mono text-xs uppercase tracking-widest text-stone">Loading…</p>
      </div>
    );
  }

  if (status === "no_tenant") {
    return (
      <CreateStoreForm
        accessToken={accessToken}
        onCreated={() => loadTenant(accessToken)}
        onSignOut={handleSignOut}
      />
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-pearl px-6 text-center">
        <p className="font-display text-lg text-ink">Could not load your dashboard</p>
        <button
          onClick={() => loadTenant(accessToken)}
          className="mt-2 rounded-sm border border-ink px-4 py-2 text-xs uppercase tracking-wide text-ink hover:bg-ink hover:text-pearl"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <AuthProvider
      value={{
        accessToken,
        userId,
        userEmail,
        tenant,
        refreshTenant: () => loadTenant(accessToken),
      }}
    >
      <div className="flex h-screen flex-col">
        <Navbar tenant={tenant} onSignOut={handleSignOut} onOpenTutorial={() => setTutorialOpen(true)} />
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
      <TutorialModal open={tutorialOpen} onClose={handleCloseTutorial} />
    </AuthProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <DashboardInner>{children}</DashboardInner>
    </ToastProvider>
  );
}
