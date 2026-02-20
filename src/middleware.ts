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

// Routes called server-to-server by Collabora Docker container (use WOPI access_token, not session cookies)
function isWopiPath(pathname: string): boolean {
  return pathname.startsWith("/api/wopi/");
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Allow Collabora WOPI server-to-server routes (authenticated via WOPI access_token query param)
  if (isWopiPath(pathname)) {
    return NextResponse.next();
  }

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
