"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F7F4EE] px-6 text-center">
          <p className="text-lg text-[#16140F]">Something went wrong</p>
          <p className="max-w-sm text-sm text-[#8B8478]">
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={reset}
            className="mt-2 rounded-sm border border-[#16140F] px-4 py-2 text-xs uppercase tracking-wide text-[#16140F] hover:bg-[#16140F] hover:text-[#F7F4EE]"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
