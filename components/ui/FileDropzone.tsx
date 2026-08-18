"use client";

import { useRef, useState } from "react";

const ICONS = {
  photo: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <rect x="3.5" y="5.5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9" cy="10.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 16.5 8.5 12l3 3 3.5-4L20 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <rect x="3.5" y="6" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M15.5 10.2 20 7.7v8.6l-4.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
} as const;

interface FileDropzoneProps {
  accept: string;
  kind?: keyof typeof ICONS;
  variant?: "light" | "dark";
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  onFileSelected: (file: File | null) => void;
}

/**
 * Rounded, icon-led file picker (click or drag) replacing the browser's
 * bare "Choose File" input across the app. Parents that need to reset the
 * displayed filename after a successful submit should remount via `key`.
 */
export function FileDropzone({
  accept,
  kind = "photo",
  variant = "light",
  placeholder = "Click or drop a photo",
  hint = "JPG, PNG, or WebP",
  disabled,
  onFileSelected,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0] ?? null;
    setFileName(file?.name ?? null);
    onFileSelected(file);
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      className={`flex items-center gap-3 rounded-xl border border-dashed px-3.5 py-3 text-left transition-colors ${
        disabled
          ? `cursor-not-allowed opacity-50 ${variant === "dark" ? "border-line-dark" : "border-line-light"}`
          : dragOver
            ? "cursor-pointer border-gold bg-gold/5"
            : `cursor-pointer hover:border-gold/60 hover:bg-gold/[0.03] ${
                variant === "dark" ? "border-line-dark" : "border-line-light"
              }`
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
        {ICONS[kind]}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${variant === "dark" ? "text-pearl" : "text-ink"}`}>
          {fileName ?? placeholder}
        </p>
        <p className="truncate text-xs text-stone">{fileName ? "Click to change" : hint}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
    </div>
  );
}
