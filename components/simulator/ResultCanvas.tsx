"use client";

import { useState } from "react";
import Image from "next/image";
import { FacetLoader } from "@/components/ui/FacetLoader";
import type { GenerateDesignResponse } from "@/types/domain";

interface ResultCanvasProps {
  generating: boolean;
  result: GenerateDesignResponse | null;
  error: string | null;
}

export function ResultCanvas({ generating, result, error }: ResultCanvasProps) {
  const [imageFailed, setImageFailed] = useState(false);

  if (generating) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <FacetLoader label="Cutting the render" />
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
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="font-display text-lg text-ink">Nothing on the bench yet</p>
        <p className="max-w-sm text-sm text-stone">
          Choose an item, metal, and stones on the left, then generate to see it rendered here.
        </p>
      </div>
    );
  }

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/share/${result.share_token}`
      : "";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-10 py-10">
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

      <div className="flex w-full max-w-md items-end justify-between border-t border-line-light pt-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">
            Estimated price
          </p>
          <p className="font-display text-4xl text-ink">
            ${result.price.total_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/design/pdf/${result.design_id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-ink px-4 py-2 text-xs uppercase tracking-wide text-ink hover:bg-ink hover:text-pearl"
          >
            PDF
          </a>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
              } catch {
                // Clipboard API can be blocked (permissions, insecure context) —
                // fail silently rather than showing an error for a non-critical action.
              }
            }}
            className="rounded-sm border border-ink px-4 py-2 text-xs uppercase tracking-wide text-ink hover:bg-ink hover:text-pearl"
          >
            Copy link
          </button>
        </div>
      </div>
    </div>
  );
}
