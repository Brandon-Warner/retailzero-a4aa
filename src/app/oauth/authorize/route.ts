import { NextRequest } from "next/server";

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!;
const AUTH0_AUDIENCE =
  process.env.AUTH0_AUDIENCE || "https://api.retailzero.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const auth0Url = new URL(`https://${AUTH0_DOMAIN}/authorize`);

  // Pass through standard OAuth params
  const passthrough = [
    "client_id",
    "redirect_uri",
    "response_type",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
  ];
  for (const key of passthrough) {
    const value = params.get(key);
    if (value) {
      auth0Url.searchParams.set(key, value);
    }
  }

  // Always set the audience for the RetailZero API
  auth0Url.searchParams.set("audience", AUTH0_AUDIENCE);

  return Response.redirect(auth0Url.toString(), 302);
}
