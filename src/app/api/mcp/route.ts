import { createMcpServer } from "@/lib/mcp/server";
import { verifyBearerToken, type AuthInfo } from "@/lib/mcp/auth";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export async function POST(request: Request) {
  // Verify bearer token — returns AuthInfo on success, Response on failure
  const authResult = await verifyBearerToken(request);
  if (authResult instanceof Response) {
    return authResult;
  }
  const authInfo: AuthInfo = authResult;

  const server = createMcpServer(authInfo);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    const response = await transport.handleRequest(request);
    return response;
  } finally {
    await server.close();
  }
}

export async function GET() {
  return new Response(
    JSON.stringify({
      name: "RetailZero MCP Server",
      version: "1.0.0",
      description:
        "MCP server for a retail storefront. Provides tools for browsing products, managing carts, and user profiles.",
      transport: "streamable-http",
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
}

export async function DELETE(request: Request) {
  // Verify bearer token for DELETE as well
  const authResult = await verifyBearerToken(request);
  if (authResult instanceof Response) {
    return authResult;
  }
  const authInfo: AuthInfo = authResult;

  const server = createMcpServer(authInfo);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  try {
    const response = await transport.handleRequest(request);
    return response;
  } finally {
    await server.close();
  }
}
