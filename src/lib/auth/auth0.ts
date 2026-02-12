import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  authorizationParameters: {
    audience: `https://${process.env.AUTH0_MGMT_DOMAIN}/api/v2/`,
    scope: "openid profile email offline_access read:current_user update:current_user_metadata",
  },
});

// Separate client for Connected Accounts / Token Vault flows.
// The My Account API lives at https://{canonical-domain}/me/, so we need
// to use AUTH0_MGMT_DOMAIN (the canonical tenant domain) instead of
// AUTH0_DOMAIN (the custom domain) which the main client uses.
// IMPORTANT: Do NOT set Management API audience/scopes here. The SDK's
// connectAccount() internally requests the My Account API audience and
// merges authorizationParameters.scope into the token exchange request.
// Including Management API scopes causes Auth0 to resolve to /api/v2/
// instead of /me/, breaking the Connected Accounts flow.
export const auth0Connect = new Auth0Client({
  domain: process.env.AUTH0_MGMT_DOMAIN,
  authorizationParameters: {
    scope: "openid profile email offline_access",
  },
});
