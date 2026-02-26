import { NextRequest, NextResponse } from "next/server";
import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Security headers applied to all responses.
 * Defense-in-depth: prevents clickjacking, MIME sniffing, and information leakage.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const session = await auth();
  const isAuthenticated = !!session?.user;
  const { pathname } = request.nextUrl;

  const isAuthPage =
    pathname.startsWith("/signin") || pathname.startsWith("/auth");
  const isApiAuth = pathname.startsWith("/api/auth");
  const isPublicPage = pathname === "/";

  if (isApiAuth || isPublicPage)
    return withSecurityHeaders(NextResponse.next());

  if (isAuthPage && isAuthenticated) {
    return withSecurityHeaders(
      NextResponse.redirect(new URL("/dashboard", request.nextUrl))
    );
  }

  if (!isAuthPage && !isAuthenticated) {
    const callbackUrl = encodeURIComponent(pathname);
    return withSecurityHeaders(
      NextResponse.redirect(
        new URL(`/signin?callbackUrl=${callbackUrl}`, request.nextUrl)
      )
    );
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.svg|api/auth).*)",
  ],
};
