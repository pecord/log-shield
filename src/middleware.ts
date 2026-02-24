import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isAuthenticated = !!req.auth;
  const { pathname } = req.nextUrl;

  const isAuthPage =
    pathname.startsWith("/signin") || pathname.startsWith("/auth");
  const isApiAuth = pathname.startsWith("/api/auth");
  const isPublicPage = pathname === "/";

  if (isApiAuth || isPublicPage) return;

  if (isAuthPage && isAuthenticated) {
    return Response.redirect(new URL("/dashboard", req.nextUrl));
  }

  if (!isAuthPage && !isAuthenticated) {
    const callbackUrl = encodeURIComponent(pathname);
    return Response.redirect(
      new URL(`/signin?callbackUrl=${callbackUrl}`, req.nextUrl)
    );
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.svg|api/auth).*)",
  ],
};
