"use client";

import { useEffect, useState } from "react";

const SPARKLES = [
  { top: "6%", left: "82%", size: 7, delay: "0s" },
  { top: "72%", left: "88%", size: 5, delay: "0.5s" },
  { top: "82%", left: "14%", size: 6, delay: "1s" },
  { top: "10%", left: "10%", size: 5, delay: "0.25s" },
] as const;

function Sparkle({ size, delay }: { size: number; delay: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size * 2.4}
      height={size * 2.4}
      className="sparkle text-gold-bright"
      style={{ animationDelay: delay }}
    >
      <path d="M12 2 13.6 10.4 22 12 13.6 13.6 12 22 10.4 13.6 2 12 10.4 10.4 12 2Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Jewelry-themed loading indicator: a brilliant-cut gem "turns" under a
 * sweeping light glint while sparkles twinkle around it. Optional `labels`
 * cycle beneath it so a longer wait doesn't stare at one static word.
 */
export function FacetLoader({ label, labels }: { label?: string; labels?: string[] }) {
  const cycle = labels && labels.length > 0 ? labels : label ? [label] : ["Working…"];
  const [labelIndex, setLabelIndex] = useState(0);

  useEffect(() => {
    if (cycle.length <= 1) return;
    const id = setInterval(() => setLabelIndex((i) => (i + 1) % cycle.length), 2200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle.length]);

  return (
    <div className="flex flex-col items-center gap-5 py-16">
      <div className="relative h-20 w-20">
        {SPARKLES.map((s, i) => (
          <span key={i} className="absolute" style={{ top: s.top, left: s.left }}>
            <Sparkle size={s.size} delay={s.delay} />
          </span>
        ))}
        <div className="gem-turn absolute inset-0 flex items-center justify-center">
          <svg viewBox="0 0 48 48" width="48" height="48" className="overflow-visible">
            <defs>
              <linearGradient id="gem-face" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#D4AF7A" />
                <stop offset="100%" stopColor="#B8935F" />
              </linearGradient>
              <clipPath id="gem-clip">
                <path d="M24 2 40 16 24 46 8 16Z" />
              </clipPath>
            </defs>
            <path d="M24 2 40 16 24 46 8 16Z" fill="url(#gem-face)" />
            <g clipPath="url(#gem-clip)">
              <path d="M8 16h32M24 2 16 16l8 6 8-6-8-14ZM16 16 8 16M32 16h8M16 16l8 30M32 16l-8 30" stroke="#16140F" strokeOpacity="0.18" strokeWidth="0.9" fill="none" />
              <rect className="gem-shine" x="-10" y="-4" width="14" height="60" fill="#F7F4EE" fillOpacity="0.55" />
            </g>
          </svg>
        </div>
      </div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-stone">{cycle[labelIndex]}</p>
    </div>
  );
}
