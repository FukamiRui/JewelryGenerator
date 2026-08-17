import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-pearl px-6 text-center">
      <p className="font-display text-lg text-ink">Page not found</p>
      <p className="max-w-sm text-sm text-stone">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Link
        href="/simulator"
        className="mt-2 rounded-sm border border-ink px-4 py-2 text-xs uppercase tracking-wide text-ink hover:bg-ink hover:text-pearl"
      >
        Back to simulator
      </Link>
    </div>
  );
}
