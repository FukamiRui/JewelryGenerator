import Link from "next/link";
import {
  FREE_PLAN_MONTHLY_CREDITS,
  SUBSCRIPTION_MONTHLY_CREDITS,
  SUBSCRIPTION_PRICE_USD,
} from "@/lib/credits";

const STEPS = [
  {
    title: "Pick your piece",
    body: "Choose an item, metal, and stones — or guide it with a photo a customer showed you.",
  },
  {
    title: "Generate",
    body: "A photorealistic render, priced automatically from live metal rates or your own numbers.",
  },
  {
    title: "Sketch & refine",
    body: "Draw directly on the result to mark what should change, then regenerate from the markup.",
  },
  {
    title: "Hand it off",
    body: "A one-click PDF estimate, a shop-page portfolio piece, or a ready-to-post social clip.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="min-h-screen bg-pearl">
      <nav className="flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="font-display text-lg text-ink">Atelier</span>
        <Link href="/login" className="text-sm text-stone hover:text-ink">
          Sign in
        </Link>
      </nav>

      <header className="mx-auto max-w-3xl px-6 pb-20 pt-10 text-center sm:pt-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold">
          For jewelry stores
        </p>
        <h1 className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl">
          From a rough idea to a sellable estimate — in minutes.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-stone">
          AI-assisted jewelry design, sketch-and-regenerate refinement, and ready-to-post social
          content — a design workbench built for the counter, not a customer-facing app.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login?mode=sign_up"
            className="rounded-sm bg-ink px-6 py-3 text-sm font-medium text-pearl transition-colors hover:bg-ink/90"
          >
            Start free
          </Link>
          <Link
            href="/login"
            className="rounded-sm border border-line-light px-6 py-3 text-sm text-ink transition-colors hover:border-gold"
          >
            Sign in
          </Link>
        </div>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-stone">
          No card required to start
        </p>
      </header>

      <section className="border-y border-line-light bg-white px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <p className="text-center font-mono text-[10px] uppercase tracking-[0.3em] text-gold">
            How it works
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <div key={step.title} className="rounded-sm border border-line-light p-5">
                <span className="font-mono text-xs text-gold">{String(i + 1).padStart(2, "0")}</span>
                <p className="mt-2 font-display text-lg text-ink">{step.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-stone">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-4xl">
          <p className="text-center font-mono text-[10px] uppercase tracking-[0.3em] text-gold">
            Pricing
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded-sm border border-line-light bg-white p-6">
              <p className="font-display text-xl text-ink">Free</p>
              <p className="mt-1 text-sm text-stone">Try it with no commitment.</p>
              <p className="mt-4 font-display text-3xl text-ink">$0</p>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-stone">
                <li>— {FREE_PLAN_MONTHLY_CREDITS} design credits/month</li>
                <li>— Generated images are watermarked</li>
                <li>— 1 portfolio piece</li>
                <li>— No reference-photo, sketch, or video generation</li>
              </ul>
            </div>
            <div className="rounded-sm border border-gold bg-white p-6 shadow-[0_20px_50px_-20px_rgba(184,147,95,0.4)]">
              <p className="font-display text-xl text-ink">Subscription</p>
              <p className="mt-1 text-sm text-stone">Full access for a working shop.</p>
              <p className="mt-4 font-display text-3xl text-ink">
                ${SUBSCRIPTION_PRICE_USD}
                <span className="text-base text-stone">/month</span>
              </p>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-stone">
                <li>— {SUBSCRIPTION_MONTHLY_CREDITS} design credits/month, no watermark</li>
                <li>— Unlimited portfolio</li>
                <li>— Reference-photo &amp; sketch-and-regenerate generation</li>
                <li>— Video generation for social</li>
              </ul>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-stone">
            Need a few more credits mid-month? Top up any time — no subscription required.
          </p>
        </div>
      </section>

      <footer className="border-t border-line-light px-6 py-8 text-center sm:px-10">
        <Link href="/login?mode=sign_up" className="text-sm text-gold hover:underline">
          Start designing →
        </Link>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Atelier</p>
      </footer>
    </div>
  );
}
