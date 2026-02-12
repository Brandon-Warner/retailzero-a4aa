import { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth/auth0";

export default async function middleware(req: NextRequest) {
  return auth0.middleware(req);
}

export const config = {
  matcher: [
    // Run Auth0 middleware on auth routes and protected pages
    // Exclude static files, Next.js internals, OAuth proxy routes, and
    // .well-known metadata endpoints so MCP OAuth flow bypasses session middleware
    "/((?!_next/static|_next/image|favicon.ico|oauth/|.well-known/).*)",
  ],
};
