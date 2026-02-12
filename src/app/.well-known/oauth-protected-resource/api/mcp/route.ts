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
    resource: `${APP_BASE_URL}/api/mcp`,
    authorization_servers: [APP_BASE_URL],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    bearer_methods_supported: ["header"],
    resource_name: "RetailZero MCP Server",
  }, {
    headers: CORS_HEADERS,
  });
}
