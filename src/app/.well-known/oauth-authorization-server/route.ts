const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";

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

export async function GET() {
  return Response.json({
    issuer: APP_BASE_URL,
    authorization_endpoint: `${APP_BASE_URL}/oauth/authorize`,
    token_endpoint: `${APP_BASE_URL}/oauth/token`,
    registration_endpoint: `${APP_BASE_URL}/oauth/register`,
    revocation_endpoint: `${APP_BASE_URL}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
  }, {
    headers: CORS_HEADERS,
  });
}
