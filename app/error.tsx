"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-pearl px-6 text-center">
      <p className="font-display text-lg text-ink">Something went wrong</p>
      <p className="max-w-sm text-sm text-stone">
        {error.message || "An unexpected error occurred while loading this page."}
      </p>
      <button
        onClick={reset}
        className="mt-2 rounded-sm border border-ink px-4 py-2 text-xs uppercase tracking-wide text-ink hover:bg-ink hover:text-pearl"
      >
        Try again
      </button>
    </div>
  );
}
