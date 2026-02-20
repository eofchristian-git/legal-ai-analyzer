import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const publicPaths = ["/login", "/signup", "/api/auth", "/api/collabora/health"];

// Routes called server-to-server by ONLYOFFICE Docker container (use JWT token auth, not session cookies)
const onlyofficeServerPaths = [
  "/api/onlyoffice/callback", // Callback from ONLYOFFICE Document Server
  "/api/cron/cleanup-sessions", // Scheduled cleanup job
];

// Check if a path is an ONLYOFFICE download route: /api/contracts/[id]/download
function isDocumentDownloadPath(pathname: string): boolean {
  return /^\/api\/contracts\/[^/]+\/download/.test(pathname);
}

// Feature 012: WOPI path check removed (Collabora deprecated).
// Keeping isWopiPath as a no-op stub to preserve any existing WOPI routes during transition.
// T041: Remove WOPI middleware path exception
// function isWopiPath(pathname: string): boolean {
//   return pathname.startsWith("/api/wopi/");
// }

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Feature 012 T041: WOPI path exception removed (Collabora deprecated).
  // WOPI routes now require authentication like all other routes.

  // Allow ONLYOFFICE server-to-server routes (they use JWT token auth, not session cookies)
  if (
    onlyofficeServerPaths.some((path) => pathname.startsWith(path)) ||
    isDocumentDownloadPath(pathname)
  ) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only routes
  if (pathname.startsWith("/admin")) {
    if (req.auth.user.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Playbook: admin and legal only
  if (pathname.startsWith("/playbook")) {
    if (req.auth.user.role !== "admin" && req.auth.user.role !== "legal") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets/).*)"],
};
