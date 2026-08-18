"use client";

import { useEffect, useRef, useState } from "react";

/** Small "?" button that reveals a short explanation on click — dismisses on outside click or Escape. */
export function InfoTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] leading-none text-stone opacity-70 transition-opacity hover:opacity-100"
      >
        ?
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-1/2 top-6 z-20 w-56 -translate-x-1/2 rounded-sm border border-line-light bg-white p-3 text-left text-xs leading-relaxed text-ink shadow-[0_12px_30px_-10px_rgba(22,20,15,0.35)]"
        >
          {children}
        </div>
      )}
    </div>
  );
}
