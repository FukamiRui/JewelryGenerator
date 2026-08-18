"use client";

import { useEffect, useState } from "react";

function GemIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-12 w-12">
      <path
        d="M14 14h20l6 8-16 16-16-16 6-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 14 24 22l10-8M8 22h32M24 22 17 38M24 22l7 16" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function WandIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9">
      <path d="M12 36 32 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M32 16h4M34 14v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 12v4M12 14h4M38 26v4M36 28h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9">
      <rect x="7" y="15" width="34" height="23" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17 15 20 10h8l3 5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="24" cy="27" r="7" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function SketchIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-12 w-12">
      <rect x="8" y="8" width="26" height="26" rx="2.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 3" />
      <path
        d="M30 26 39 17a2.5 2.5 0 0 1 3.5 3.5L33 30l-5 1 1-5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TurnIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-12 w-12">
      <rect x="8" y="8" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="26" y="8" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
      <rect x="8" y="26" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
      <rect x="26" y="26" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" opacity="0.3" />
    </svg>
  );
}

function HandoffIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-12 w-12">
      <path d="M13 6h16l6 6v30a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M29 6v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M17 26h14M17 31h14M17 21h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function PostIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-12 w-12">
      <rect x="9" y="8" width="24" height="32" rx="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 20.5v7l6.5-3.5-6.5-3.5Z" fill="currentColor" />
      <path d="M36 17c3 2 5 5.4 5 9.3S39 33.5 36 35.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M39 13c4.5 3 7 7.9 7 13.2S43.5 36.4 39 39.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

interface Step {
  title: string;
  body?: string;
  render: () => React.ReactNode;
}

const STEPS: Step[] = [
  {
    title: "Pick your piece",
    body: "Choose an item, metal, and stones from the left rail — everything downstream uses these picks.",
    render: () => (
      <div className="flex h-24 items-center justify-center text-gold">
        <GemIcon />
      </div>
    ),
  },
  {
    title: "Generate",
    render: () => (
      <div className="flex h-24 items-stretch justify-center gap-3">
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl bg-gold/[0.06] px-3 py-2 text-gold">
          <WandIcon />
          <p className="text-center text-[11px] leading-tight text-ink">From your picks</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl bg-gold/[0.06] px-3 py-2 text-gold">
          <CameraIcon />
          <p className="text-center text-[11px] leading-tight text-ink">From a photo</p>
        </div>
      </div>
    ),
  },
  {
    title: "Sketch & refine",
    body: "Not quite right? Draw directly on the result to mark what should change, then regenerate from the markup.",
    render: () => (
      <div className="flex h-24 items-center justify-center text-gold">
        <SketchIcon />
      </div>
    ),
  },
  {
    title: "Turn it around",
    body: "Generate all four angles of the same piece — front, side, diagonal, and underneath — a quick pseudo-3D turnaround.",
    render: () => (
      <div className="flex h-24 items-center justify-center text-gold">
        <TurnIcon />
      </div>
    ),
  },
  {
    title: "Hand it off",
    body: "Download a one-click PDF estimate, or save the piece straight to your portfolio.",
    render: () => (
      <div className="flex h-24 items-center justify-center text-gold">
        <HandoffIcon />
      </div>
    ),
  },
  {
    title: "Post it",
    body: "Turn a portfolio video into a ready-to-post clip — sized for TikTok, Reels, or Twitter, with an AI-drafted caption and hashtags already attached.",
    render: () => (
      <div className="flex h-24 items-center justify-center text-gold">
        <PostIcon />
      </div>
    ),
  },
];

export function TutorialModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-[0_30px_80px_-20px_rgba(22,20,15,0.45)]">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone">
            {String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
          </span>
          <button onClick={onClose} className="text-xs text-stone hover:text-ink">
            Skip
          </button>
        </div>

        <div className="mt-4">{current.render()}</div>

        <p className="mt-5 text-center font-display text-xl text-ink">{current.title}</p>
        {current.body && (
          <p className="mt-2 text-center text-sm leading-relaxed text-stone">{current.body}</p>
        )}

        <div className="mt-7 flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-5 bg-gold" : "w-1.5 bg-line-light"
              }`}
            />
          ))}
        </div>

        <div className="mt-7 flex items-center justify-between gap-3">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-full px-4 py-2 text-xs uppercase tracking-wide text-stone transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-0"
          >
            Back
          </button>
          <button
            onClick={() => (isLast ? onClose() : setStep((s) => s + 1))}
            className="rounded-full bg-gold px-6 py-2.5 text-xs font-medium uppercase tracking-wide text-ink transition-colors hover:bg-gold-bright"
          >
            {isLast ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
