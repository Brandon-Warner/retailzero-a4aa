const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || "https://api.retailzero.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(request: Request) {
  const body = await request.text();

  // Parse the form data to check if audience is included
  const params = new URLSearchParams(body);

  // If this is an authorization_code grant and audience is missing, add it
  if (params.get("grant_type") === "authorization_code" && !params.has("audience")) {
    params.set("audience", AUTH0_AUDIENCE);
  }

  // Extract Authorization header - client might be using HTTP Basic Auth
  const authHeader = request.headers.get("authorization");

  // Prepare headers for Auth0 request
  const headers: HeadersInit = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // Forward Authorization header if present (for HTTP Basic Auth)
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers,
    body: params.toString(),
  });

  const data = await response.text();

  // Log errors for debugging
  if (!response.ok) {
    console.error("Token exchange failed:", {
      status: response.status,
      body: data,
      hasAuthHeader: !!authHeader,
      requestParams: {
        grant_type: params.get("grant_type"),
        client_id: params.get("client_id"),
        has_code: !!params.get("code"),
        has_redirect_uri: !!params.get("redirect_uri"),
        has_code_verifier: !!params.get("code_verifier"),
        has_audience: !!params.get("audience"),
      }
    });
  }

  return new Response(data, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "application/json",
      ...CORS_HEADERS,
    },
  });
}
