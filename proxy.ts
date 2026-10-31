import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/automations",
  "/logs",
  "/settings",
  "/analytics",
  "/contacts",
];

function hasSessionCookie(request: NextRequest): boolean {
  return (
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token") ||
    request.cookies.has("next-auth.session-token") ||
    request.cookies.has("__Secure-next-auth.session-token")
  );
}

/**
 * LINK_BASE_URL is a short branded domain that serves only the tracked links
 * in DMs (/r/<slug>). Anything else asked of that host goes to LINK_HOME_URL
 * (the brand's site), so the dashboard and login never show up on it.
 */
function linkHostRedirect(request: NextRequest): NextResponse | null {
  const linkBase = process.env.LINK_BASE_URL;
  if (!linkBase) return null;
  let linkHost: string;
  try {
    linkHost = new URL(linkBase).host;
  } catch {
    return null;
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host !== linkHost || request.nextUrl.pathname.startsWith("/r/")) return null;
  const home = process.env.LINK_HOME_URL || process.env.NEXTAUTH_URL;
  return home ? NextResponse.redirect(home) : null;
}

export function proxy(request: NextRequest) {
  const linkRedirect = linkHostRedirect(request);
  if (linkRedirect) return linkRedirect;

  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isLogin = pathname === "/login";
  const isAuthenticated = hasSessionCookie(request);

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLogin && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/automations/:path*",
    "/logs/:path*",
    "/settings/:path*",
    "/analytics/:path*",
    "/contacts/:path*",
    "/login",
    // Every other page too, for the link-domain redirect above; static
    // assets, API routes and the tracked links themselves skip the proxy.
    "/((?!_next/|api/|r/|favicon.ico).*)",
  ],
};
