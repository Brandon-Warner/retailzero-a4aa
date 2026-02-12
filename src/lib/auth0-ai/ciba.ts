import { getAsyncAuthorizationCredentials } from "@auth0/ai-vercel";

// CIBA params for the checkout tool.
// Requires the user to approve high-value purchases on their device.
// Using polling mode: the server keeps the request open and polls Auth0
// until the user approves (or the request expires).  This avoids the
// interrupt-based flow which is incompatible with AI SDK v6's streamText
// (it swallows tool execution errors internally).
export function getCIBAParams() {
  return {
    userID: (args: any) => args.userId,
    bindingMessage: (args: any) =>
      `Approve checkout for your shopping cart`,
    scopes: ["openid", "profile", "email"],
    audience: process.env.AUTH0_AUDIENCE || "https://api.retailzero.com",
    onAuthorizationRequest: async () => {
      // Using a callback (instead of "interrupt") puts the CIBA wrapper into
      // polling mode: it loops server-side until the user approves on their
      // device, keeping the stream open the entire time.
    },
    credentialsContext: "thread" as const,
  };
}

export { getAsyncAuthorizationCredentials };
