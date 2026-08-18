import Link from "next/link";
import { SUBSCRIPTION_PRICE_USD } from "@/lib/credits";

interface UpgradeGateProps {
  title: string;
  message: string;
  variant?: "light" | "dark";
}

/** Locked-feature placeholder for free-tier shops — shown in place of a subscriber-only control. */
export function UpgradeGate({ title, message, variant = "light" }: UpgradeGateProps) {
  const dark = variant === "dark";
  return (
    <div
      className={`rounded-xl border border-dashed px-4 py-5 text-center ${
        dark ? "border-line-dark" : "border-line-light bg-pearl/50"
      }`}
    >
      <p className="text-xl" aria-hidden="true">
        🔒
      </p>
      <p className={`mt-1.5 font-display text-base ${dark ? "text-pearl" : "text-ink"}`}>{title}</p>
      <p className="mt-1 text-xs text-stone">{message}</p>
      <Link
        href="/settings"
        className="mt-3 inline-block rounded-full bg-gold px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-ink transition-colors hover:bg-gold-bright"
      >
        Upgrade — ${SUBSCRIPTION_PRICE_USD}/mo
      </Link>
    </div>
  );
}
