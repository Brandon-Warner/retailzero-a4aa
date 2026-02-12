import { createRemoteJWKSet, jwtVerify } from "jose";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthInfo {
  token: string;
  clientId: string;
  sub: string;
  scopes: string[];
  expiresAt: number;
}

export interface OAuthClientInformation {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  client_name?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// JWKS — lazily created, cached by jose internally
// ---------------------------------------------------------------------------

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!;
const AUTH0_AUDIENCE =
  process.env.AUTH0_AUDIENCE || "https://api.retailzero.com";

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(
      new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
    );
  }
  return _jwks;
}

// ---------------------------------------------------------------------------
// JWT verification
// ---------------------------------------------------------------------------

export async function verifyAccessToken(token: string): Promise<AuthInfo> {
  const { payload } = await jwtVerify(token, getJWKS(), {
    issuer: `https://${AUTH0_DOMAIN}/`,
    audience: AUTH0_AUDIENCE,
  });

  return {
    token,
    clientId: (payload.azp as string) || (payload.client_id as string) || "",
    sub: (payload.sub as string) || "",
    scopes: typeof payload.scope === "string" ? payload.scope.split(" ") : [],
    expiresAt: payload.exp ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Bearer token extraction + verification helper
// ---------------------------------------------------------------------------

export async function verifyBearerToken(
  request: Request
): Promise<AuthInfo | Response> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "missing_token", error_description: "Bearer token required" }),
      { status: 401, headers: { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" } }
    );
  }

  const token = authHeader.slice(7);
  try {
    return await verifyAccessToken(token);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "invalid_token",
        error_description: (err as Error).message,
      }),
      { status: 401, headers: { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" } }
    );
  }
}

// ---------------------------------------------------------------------------
// In-memory client store (for DCR)
// ---------------------------------------------------------------------------

const clientStore = new Map<string, OAuthClientInformation>();

export function getClient(clientId: string): OAuthClientInformation | undefined {
  return clientStore.get(clientId);
}

export function registerClient(client: OAuthClientInformation): void {
  clientStore.set(client.client_id, client);
}
