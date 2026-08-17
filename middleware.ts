import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SHOP_PROTECTED_PREFIXES = [
  "/simulator",
  "/materials",
  "/history",
  "/messages",
  "/portfolio",
  "/settings",
];
const CUSTOMER_PROTECTED_PREFIXES = ["/customer/messages"];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) =>
          res.cookies.set({ name, value, ...options }),
        remove: (name: string, options: CookieOptions) =>
          res.cookies.set({ name, value: "", ...options }),
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const path = req.nextUrl.pathname;
  const isShopProtected = SHOP_PROTECTED_PREFIXES.some((p) => path.startsWith(p));
  const isCustomerProtected = CUSTOMER_PROTECTED_PREFIXES.some((p) => path.startsWith(p));
  const isShopLoginPage = path === "/login";
  const isCustomerLoginPage = path === "/customer/login";

  if (isShopProtected && !session) {
    const redirectUrl = new URL("/login", req.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (isCustomerProtected && !session) {
    const redirectUrl = new URL("/customer/login", req.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (isShopLoginPage && session) {
    return NextResponse.redirect(new URL("/simulator", req.url));
  }

  if (isCustomerLoginPage && session) {
    return NextResponse.redirect(new URL("/customer/messages", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    "/simulator/:path*",
    "/materials/:path*",
    "/history/:path*",
    "/messages/:path*",
    "/portfolio/:path*",
    "/settings/:path*",
    "/login",
    "/customer/messages/:path*",
    "/customer/login",
  ],
};
