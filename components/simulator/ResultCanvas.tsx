"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FacetLoader } from "@/components/ui/FacetLoader";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { AngleGrid } from "@/components/simulator/AngleGrid";
import { MULTI_ANGLE_CREDIT_COST } from "@/lib/credits";
import type { GenerateDesignResponse } from "@/types/domain";
import type { AngleView } from "@/lib/api-client";

const ACTION_BUTTON =
  "flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border px-4 text-xs uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const DEMO_STEPS = [
  {
    title: "1. Generate",
    blurb: "Pick an item, metal, and stones on the left. Prefer to guide it with a photo instead? Use the reference-photo option lower in the rail.",
    detail:
      "Text-only selections render from scratch. A reference photo (e.g. something a customer showed you) guides the render toward that specific look instead.",
  },
  {
    title: "2. Sketch",
    blurb: "Not quite right? Mark up the render by hand.",
    detail:
      "Once a design is on the bench, “✎ Sketch & regenerate” opens a drawing layer: draw directly on the image with a mouse, finger, or Apple Pencil to mark what should change.",
  },
  {
    title: "3. Regenerate",
    blurb: "Submit the markup to render a new version guided by it.",
    detail:
      "The annotated image is flattened and sent through the same engine as reference-photo generation, so your sketch actually shapes the next render, not just a note to yourself.",
  },
] as const;

interface ResultCanvasProps {
  generating: boolean;
  result: GenerateDesignResponse | null;
  error: string | null;
  onOpenSketch?: () => void;
  onGenerateAngles?: () => void;
  generatingAngles?: boolean;
  angleViews?: AngleView[] | null;
  onDownloadPdf?: () => void;
  downloadingPdf?: boolean;
  isSubscribed?: boolean;
}

export function ResultCanvas({
  generating,
  result,
  error,
  onOpenSketch,
  onGenerateAngles,
  generatingAngles,
  angleViews,
  onDownloadPdf,
  downloadingPdf,
  isSubscribed,
}: ResultCanvasProps) {
  const [imageFailed, setImageFailed] = useState(false);

  if (generating) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <FacetLoader labels={["Cutting the render", "Setting the stones", "Catching the light", "Polishing the facets"]} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="font-display text-lg text-ink">Could not generate this design</p>
        <p className="max-w-sm text-sm text-stone">{error}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-10">
        <div className="w-full max-w-lg">
          <p className="font-display text-xl text-ink">Nothing on the bench yet</p>
          <p className="mt-1 text-sm text-stone">
            This workbench takes a design from a rough idea to a refined render in three steps.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            {DEMO_STEPS.map((step) => (
              <div
                key={step.title}
                className="flex items-start justify-between gap-3 rounded-sm border border-line-light bg-white px-4 py-3"
              >
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">{step.title}</p>
                  <p className="mt-1 text-sm text-ink">{step.blurb}</p>
                </div>
                <InfoTooltip label={`How ${step.title.toLowerCase()} works`}>{step.detail}</InfoTooltip>
              </div>
            ))}
          </div>
          <button
            onClick={() => window.dispatchEvent(new Event("atelier:open-tutorial"))}
            className="mt-4 text-xs text-gold hover:underline"
          >
            Watch the full illustrated walkthrough
          </button>
        </div>
      </div>
    );
  }

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/share/${result.share_token}`
      : "";

  return (
    <div className="flex flex-1 flex-col items-center gap-8 overflow-y-auto px-10 py-10">
      <div className="relative w-full max-w-md overflow-hidden rounded-sm bg-white shadow-[0_20px_60px_-15px_rgba(22,20,15,0.25)]">
        {imageFailed ? (
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-pearl text-center">
            <p className="text-sm text-stone">Image could not be loaded.</p>
            <a
              href={result.generated_image_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-gold hover:underline"
            >
              Open image directly
            </a>
          </div>
        ) : (
          <Image
            src={result.generated_image_url}
            alt="Generated jewelry design"
            width={800}
            height={800}
            className="h-auto w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>

      <div className="flex w-full max-w-md flex-col gap-6 border-t border-line-light pt-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">
            Estimated price
          </p>
          <p className="font-display text-4xl text-ink">
            ${result.price.total_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>

        {angleViews && angleViews.length > 0 && <AngleGrid views={angleViews} />}

        <div className="flex flex-wrap items-center gap-2">
          {onOpenSketch && isSubscribed && (
            <div className="flex items-center gap-1.5">
              <button onClick={onOpenSketch} className={`${ACTION_BUTTON} border-gold text-ink hover:bg-gold`}>
                ✎ Sketch &amp; regenerate
              </button>
              <InfoTooltip label="What sketch & regenerate does">
                Draw corrections directly on this image, then submit. The markup guides a new render instead of
                describing the change in words.
              </InfoTooltip>
            </div>
          )}
          {onOpenSketch && !isSubscribed && (
            <Link
              href="/settings"
              className={`${ACTION_BUTTON} border-line-light text-stone hover:border-gold hover:text-ink`}
            >
              🔒 Sketch &amp; regenerate
            </Link>
          )}
          {onGenerateAngles && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onGenerateAngles}
                disabled={generatingAngles}
                className={`${ACTION_BUTTON} border-gold text-ink hover:bg-gold`}
              >
                {generatingAngles ? "Generating…" : `⊞ 4 angles (${MULTI_ANGLE_CREDIT_COST})`}
              </button>
              <InfoTooltip label="What Generate 4 angles does">
                Renders this same piece from the front, side, a three-quarter diagonal, and below, a quick
                pseudo-3D turnaround without a full 3D model.
              </InfoTooltip>
            </div>
          )}
          {onDownloadPdf && (
            <button
              onClick={onDownloadPdf}
              disabled={downloadingPdf}
              className={`${ACTION_BUTTON} border-ink text-ink hover:bg-ink hover:text-pearl`}
            >
              {downloadingPdf ? "Preparing…" : "PDF"}
            </button>
          )}
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
              } catch {
                // Clipboard API can be blocked (permissions, insecure context) —
                // fail silently rather than showing an error for a non-critical action.
              }
            }}
            className={`${ACTION_BUTTON} border-ink text-ink hover:bg-ink hover:text-pearl`}
          >
            Copy link
          </button>
        </div>
      </div>
    </div>
  );
}
