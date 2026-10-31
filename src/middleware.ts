import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optional shared-password gate. Unset/empty APP_ACCESS_PASSWORD = open (local dev).
// When set, every page + API route requires HTTP Basic Auth (any username,
// password must match exactly). PayPal webhooks and static assets stay open
// so PayPal can deliver events and the app can load its own files.

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const len = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const password = process.env.APP_ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/api/webhooks/paypal") return NextResponse.next();
  if (pathname.startsWith("/_next")) return NextResponse.next();

  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6).trim());
      const sep = decoded.indexOf(":");
      const supplied = sep >= 0 ? decoded.slice(sep + 1) : "";
      if (sep >= 0 && timingSafeEqual(supplied, password)) return NextResponse.next();
    } catch {
      // malformed credentials fall through to 401
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Dispute Defense"' },
  });
}

export const config = {
  matcher: [
    "/((?!api/webhooks/paypal|_next/static|_next/image|favicon.ico|icon.png|icon.svg|apple-icon.png|robots.txt|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|txt|xml|woff|woff2)).*)",
  ],
};
