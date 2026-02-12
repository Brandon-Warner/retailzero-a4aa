import { registerClient } from "@/lib/mcp/auth";

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!;
const AUTH0_MGMT_DOMAIN = process.env.AUTH0_MGMT_DOMAIN!;
const AUTH0_MGMT_CLIENT_ID = process.env.AUTH0_MGMT_CLIENT_ID!;
const AUTH0_MGMT_CLIENT_SECRET = process.env.AUTH0_MGMT_CLIENT_SECRET!;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || "https://api.retailzero.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

async function getManagementToken(): Promise<string> {
  const tokenResponse = await fetch(`https://${AUTH0_MGMT_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: AUTH0_MGMT_CLIENT_ID,
      client_secret: AUTH0_MGMT_CLIENT_SECRET,
      audience: `https://${AUTH0_MGMT_DOMAIN}/api/v2/`,
      grant_type: "client_credentials",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Failed to get management API token");
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function createClientGrant(clientId: string, managementToken: string) {
  const grantResponse = await fetch(`https://${AUTH0_MGMT_DOMAIN}/api/v2/client-grants`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${managementToken}`,
    },
    body: JSON.stringify({
      client_id: clientId,
      audience: AUTH0_AUDIENCE,
      "subject_type": "user",
      scope: [], // Empty scope array - client can request any scopes defined on the API
    }),
  });

  if (!grantResponse.ok) {
    const errorText = await grantResponse.text();
    console.error("Failed to create client grant:", errorText);
    throw new Error("Failed to create client grant");
  }

  return await grantResponse.json();
}

export async function POST(request: Request) {
  const clientMetadata = await request.json();

  const response = await fetch(`https://${AUTH0_DOMAIN}/oidc/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(clientMetadata),
  });

  const data = await response.json();

  // Store the registered client locally and create client grant
  if (response.ok && data.client_id) {
    registerClient({
      client_id: data.client_id,
      client_secret: data.client_secret,
      redirect_uris: data.redirect_uris || clientMetadata.redirect_uris || [],
      client_name: data.client_name || clientMetadata.client_name,
    });

    // Create client grant to authorize access to the API audience
    try {
      const managementToken = await getManagementToken();
      await createClientGrant(data.client_id, managementToken);
      console.log(`Client grant created for ${data.client_id} to access ${AUTH0_AUDIENCE}`);
    } catch (error) {
      console.error("Failed to create client grant:", error);
      // Don't fail the registration if grant creation fails
      // The client is still registered, just won't have API access yet
    }
  }

  return Response.json(data, {
    status: response.status,
    headers: CORS_HEADERS,
  });
}
