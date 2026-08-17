"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase-browser";
import { CustomerAuthProvider } from "@/lib/customer-auth-context";
import { fetchCustomer, bootstrapCustomer, ApiRequestError, type Customer } from "@/lib/api-client";
import { ToastProvider, useToast } from "@/components/ui/Toast";

const NAV_ITEMS = [
  { href: "/feed", label: "Feed" },
  { href: "/shops", label: "Browse shops" },
  { href: "/customer/messages", label: "Messages" },
];

function Navbar({ customer, onSignOut }: { customer: Customer; onSignOut: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex items-center justify-between border-b border-line-light bg-white px-6 py-3">
      <div className="flex items-center gap-8">
        <span className="font-display text-lg text-ink">Atelier</span>
        <div className="flex gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
                pathname.startsWith(item.href) ? "bg-ink text-pearl" : "text-stone hover:bg-pearl hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="font-mono text-xs text-stone">{customer.display_name}</span>
        <button onClick={onSignOut} className="text-xs text-stone hover:text-ink">
          Sign out
        </button>
      </div>
    </nav>
  );
}

function CreateCustomerProfileForm({
  accessToken,
  onCreated,
  onSignOut,
}: {
  accessToken: string;
  onCreated: () => void;
  onSignOut: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError("Name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await bootstrapCustomer(accessToken, displayName.trim());
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set up your profile.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-pearl px-6 text-center">
      <p className="font-display text-lg text-ink">Let's finish setting up your profile</p>
      <form onSubmit={handleSubmit} className="mt-2 flex w-full max-w-xs flex-col gap-2">
        <input
          type="text"
          placeholder="Your name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="rounded-sm border border-line-light bg-white px-3 py-2 text-sm focus:border-gold"
        />
        {error && <p role="alert" className="text-xs text-ink">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-sm bg-ink py-2 text-sm text-pearl hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </form>
      <button onClick={onSignOut} className="mt-2 text-xs text-stone hover:text-ink">
        Sign out instead
      </button>
    </div>
  );
}

function CustomerDashboardInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "no_profile" | "error">("loading");

  const loadCustomer = useCallback(
    async (token: string) => {
      try {
        setCustomer(await fetchCustomer(token));
        setStatus("ready");
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          setStatus("no_profile");
        } else {
          toast.push("Could not load your profile.");
          setStatus("error");
        }
      }
    },
    [toast]
  );

  useEffect(() => {
    const supabase = getBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/customer/login");
        return;
      }
      setAccessToken(data.session.access_token);
      loadCustomer(data.session.access_token);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push("/customer/login");
        return;
      }
      setAccessToken(session.access_token);
    });

    return () => sub.subscription.unsubscribe();
  }, [router, loadCustomer]);

  async function handleSignOut() {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    router.push("/customer/login");
  }

  if (status === "loading" || !accessToken) {
    return (
      <div className="flex h-screen items-center justify-center bg-pearl">
        <p className="font-mono text-xs uppercase tracking-widest text-stone">Loading…</p>
      </div>
    );
  }

  if (status === "no_profile") {
    return (
      <CreateCustomerProfileForm
        accessToken={accessToken}
        onCreated={() => loadCustomer(accessToken)}
        onSignOut={handleSignOut}
      />
    );
  }

  if (status === "error" || !customer) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-pearl px-6 text-center">
        <p className="font-display text-lg text-ink">Could not load your account</p>
        <button
          onClick={() => loadCustomer(accessToken)}
          className="mt-2 rounded-sm border border-ink px-4 py-2 text-xs uppercase tracking-wide text-ink hover:bg-ink hover:text-pearl"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <CustomerAuthProvider value={{ accessToken, customer }}>
      <div className="flex h-screen flex-col">
        <Navbar customer={customer} onSignOut={handleSignOut} />
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </CustomerAuthProvider>
  );
}

export default function CustomerDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <CustomerDashboardInner>{children}</CustomerDashboardInner>
    </ToastProvider>
  );
}
