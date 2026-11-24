// Deliberately not a strict, nonce-based CSP — Next.js's own hydration
// script and dev-mode HMR need 'unsafe-inline'/'unsafe-eval' to function,
// and getting a nonce-based policy right requires wiring nonces through
// middleware + every script tag, which is easy to get subtly wrong and
// break the app silently. This is the "real but not maximal" middle
// ground: it still blocks the actual browser-exploitable classes (framing,
// MIME-sniffing, cross-origin data exfil to arbitrary hosts, form
// hijacking) without touching how the app itself runs. Tighten it (nonces,
// dropping 'unsafe-inline') once there's a concrete reason to.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "media-src 'self' blob: https://*.supabase.co",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' https://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // geolocation=(self): Settings' "Use my current location" button needs it.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  // Only meaningful over HTTPS (production) — browsers ignore it on plain
  // HTTP, so it's harmless to send in local dev too.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** @type {import('next').NextConfig} */
// Only this project's own Supabase host may be fetched by /_next/image. The old
// "*.supabase.co" wildcard let anyone point the optimizer at a file hosted in
// THEIR OWN Supabase project (free to create), which widens abuse and exploit
// surface on the image endpoint. Falls back to the wildcard only if the env var
// is missing, so a misconfigured local setup still renders images.
function supabaseImageHost() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  } catch {
    return "*.supabase.co";
  }
}

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseImageHost(),
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // sharp and @ffmpeg-installer/ffmpeg both resolve their native binary via a
  // dynamic require() keyed off the current platform/arch — webpack can't
  // statically analyze that, so bundling them breaks with "Cannot find
  // module" at runtime. Loading them via Node's native require instead
  // (i.e. excluding them from the server bundle) fixes it.
  experimental: {
    serverComponentsExternalPackages: ["sharp", "fluent-ffmpeg", "@ffmpeg-installer/ffmpeg"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

module.exports = nextConfig;
