"use client";

import { useState } from "react";
import {
  FREE_PLAN_MONTHLY_CREDITS,
  SUBSCRIPTION_MONTHLY_CREDITS,
  SUBSCRIPTION_PRICE_USD,
  VIDEO_GENERATION_CREDIT_COST,
  MULTI_ANGLE_CREDIT_COST,
} from "@/lib/credits";
import { useAuth } from "@/lib/auth-context";

const SUPPORT_EMAIL = "fukami.rui@icloud.com";

function Section({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line-light py-8 first:pt-0 last:border-0">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs text-gold">{index}</span>
        <h2 className="font-display text-xl text-ink">{title}</h2>
      </div>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-stone">{children}</div>
    </section>
  );
}

function ReportProblemForm() {
  const { tenant } = useAuth();
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");

  function handleSend() {
    const bodyLines = [
      details.trim() || "(describe what happened)",
      "",
      "---",
      `Shop: ${tenant?.company_name ?? "unknown"}`,
      `Page: ${typeof window !== "undefined" ? window.location.href : ""}`,
    ];
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subject.trim() || "Atelier: issue report"
    )}&body=${encodeURIComponent(bodyLines.join("\n"))}`;
    window.location.href = mailto;
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject (optional)"
        maxLength={200}
        className="rounded-sm border border-line-light px-3 py-2 text-sm focus:border-gold"
      />
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="What went wrong? Include what you were doing when it happened."
        maxLength={2000}
        rows={4}
        className="rounded-sm border border-line-light px-3 py-2 text-sm focus:border-gold"
      />
      <button
        onClick={handleSend}
        className="self-start rounded-sm bg-ink px-4 py-2 text-sm text-pearl transition-colors hover:bg-ink/90"
      >
        Send report
      </button>
      <p className="text-xs text-stone">
        Opens your email client addressed to {SUPPORT_EMAIL}, with your shop name and current
        page attached. Nothing is sent from here directly.
      </p>
    </div>
  );
}

export default function HelpPage() {
  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto px-8 py-12">
      <h1 className="font-display text-2xl text-ink">Help</h1>
      <p className="mt-1 text-sm text-stone">
        How the workbench, pricing, and public shop page fit together.
      </p>

      <div className="mt-8">
        <Section index="01" title="Getting started">
          <p>
            The Simulator takes a design from a rough idea to a refined render in a few steps:
            pick an item/metal/stones, generate, sketch to refine if needed, optionally turn it
            into 4 angles, then hand it off as a PDF estimate, a portfolio piece, or social-ready
            content.
          </p>
          <button
            onClick={() => window.dispatchEvent(new Event("atelier:open-tutorial"))}
            className="self-start text-gold hover:underline"
          >
            Watch the full illustrated walkthrough
          </button>
        </Section>

        <Section index="02" title="Generating a design">
          <p>
            <strong className="text-ink">From your picks</strong> renders straight from the item,
            metal, stones, and finish you&apos;ve selected.{" "}
            <strong className="text-ink">From a photo</strong> guides the render toward a
            reference image instead, useful when a customer shows you something in person.
          </p>
          <p>
            <strong className="text-ink">✎ Sketch &amp; regenerate</strong> lets you draw directly
            on a result to mark what should change, then submits the markup as a new
            reference-guided render.
          </p>
          <p>
            The <strong className="text-ink">Size &amp; fabrication</strong> fields (size/
            dimensions, tools/technique) are folded into the AI prompt, so mentioning them
            actually shapes the render instead of just being a note. The{" "}
            <strong className="text-ink">Pricing</strong> section lets you type an exact material
            cost and desired profit instead of the automatic spot-rate estimate. Leave both
            blank to keep the automatic calculation.
          </p>
        </Section>

        <Section index="03" title="Generate 4 angles">
          <p>
            Renders front, side, diagonal, and bottom views of an existing design for{" "}
            {MULTI_ANGLE_CREDIT_COST} credits total (not per image), a quick pseudo-3D
            turnaround, not a true 3D model. The 4 images stay grouped together wherever they
            show up (the result panel, History).
          </p>
        </Section>

        <Section index="04" title="Portfolio vs. For SNS">
          <p>
            <strong className="text-ink">Portfolio</strong> is what&apos;s shown on your public
            shop page: upload a photo, pull one from your design history, or generate/upload a
            video.
          </p>
          <p>
            <strong className="text-ink">For SNS</strong> is a separate prep tool: pick any
            existing piece and get a platform-sized video export plus an AI-drafted caption and
            hashtags for TikTok, Reels, or X. Nothing publishes automatically. Everything is
            downloaded or copied so you post it yourself.
          </p>
        </Section>

        <Section index="05" title="Pricing & credits">
          <p>
            <strong className="text-ink">Free</strong>: {FREE_PLAN_MONTHLY_CREDITS} credits/month,
            watermarked images, 1 portfolio piece, and no reference-photo, sketch, or video
            generation. <strong className="text-ink">Subscribed</strong>: ${SUBSCRIPTION_PRICE_USD}
            /month for {SUBSCRIPTION_MONTHLY_CREDITS} credits/month with no watermark, an
            unlimited portfolio, reference-photo &amp; sketch generation, and video.
          </p>
          <p>
            Credit costs: a design generation (text, photo, or sketch) is 1 credit, Generate Video
            is {VIDEO_GENERATION_CREDIT_COST} credits, Generate 4 angles is{" "}
            {MULTI_ANGLE_CREDIT_COST} credits for the bundle, and a portfolio description is free.
            Running low mid-month? Settings → Subscription lets you top up with a preset pack or a
            custom amount any time, no subscription required.
          </p>
        </Section>

        <Section index="06" title="History">
          <p>
            Every generated design lands in History, most recent first. Give a piece a title,
            delete ones you don&apos;t need, and download a PDF estimate any time. A 4-angle batch
            groups into a single card instead of 4 separate rows.
          </p>
        </Section>

        <Section index="07" title="Messaging customers">
          <p>
            Chat keeps contact details (phone, email, off-platform handles) filtered out of
            messages on purpose: orders, payments, and support only work when the conversation
            stays in Atelier. Settings lets you cap how many free re-generations a customer gets
            per request and grant more from within a specific conversation when needed.
          </p>
        </Section>

        <Section index="08" title="Your public shop page">
          <p>
            Reached only via a direct link you share (a bio link, a QR code), not a browsable
            directory. Settings → Shop profile controls what shows there: cover photo, logo,
            location, specialty materials, years in the craft, an optional contact email, and
            your returns policy.
          </p>
        </Section>

        <Section index="09" title="Troubleshooting">
          <p>
            <strong className="text-ink">&quot;Spot price cache&quot; unavailable</strong>: live
            metal rates refresh hourly; this clears itself, or use manual pricing in the meantime.
          </p>
          <p>
            <strong className="text-ink">&quot;Monthly credit limit reached&quot;</strong>: buy
            extra credits or upgrade in Settings.
          </p>
          <p>
            <strong className="text-ink">&quot;Requires an active subscription&quot;</strong>:
            reference photos, sketch-and-regenerate, and video are subscriber-only features,
            regardless of credit balance; the free plan is a limited taste of the product, not a
            smaller version of every feature.
          </p>
        </Section>

        <Section index="10" title="Report a problem">
          <p>Something broken, confusing, or just not working as expected? Send it directly.</p>
          <ReportProblemForm />
        </Section>
      </div>
    </div>
  );
}
