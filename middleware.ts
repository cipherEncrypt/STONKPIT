import { NextRequest, NextResponse } from "next/server";

function allowedOrigin(): string | null {
  return (
    process.env.ALLOWED_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    null
  );
}

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = req.headers.get("origin");
  const allowed = allowedOrigin();
  const res = NextResponse.next();

  if (allowed && origin) {
    if (origin === allowed || origin === allowed.replace(/\/$/, "")) {
      res.headers.set("Access-Control-Allow-Origin", origin);
      res.headers.set("Vary", "Origin");
    } else if (process.env.NODE_ENV === "production") {
      return new NextResponse(JSON.stringify({ error: "Forbidden origin" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (req.method === "OPTIONS") {
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type");
    return res;
  }

  return res;
}

export const config = {
  matcher: "/api/:path*",
};
