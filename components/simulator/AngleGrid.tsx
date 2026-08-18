"use client";

import Image from "next/image";
import type { AngleView } from "@/lib/api-client";

const ANGLE_LABELS: Record<AngleView["angle"], string> = {
  front: "Front",
  side: "Side",
  diagonal: "Diagonal",
  bottom: "Bottom",
};

/**
 * Inline grid of the 4 generated angle views — rendered directly under the
 * main result image (see ResultCanvas) rather than a modal, so it stays
 * visible as part of the result instead of disappearing once closed.
 */
export function AngleGrid({ views }: { views: AngleView[] }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">Four angles</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {views.map((v) => (
          <a
            key={v.design_id}
            href={v.generated_image_url}
            target="_blank"
            rel="noreferrer"
            className="overflow-hidden rounded-sm border border-line-light bg-pearl transition-colors hover:border-gold"
          >
            <div className="relative aspect-square">
              <Image src={v.generated_image_url} alt={ANGLE_LABELS[v.angle]} fill className="object-cover" />
            </div>
            <p className="border-t border-line-light bg-white px-1 py-1 text-center font-mono text-[9px] uppercase tracking-[0.15em] text-stone">
              {ANGLE_LABELS[v.angle]}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
