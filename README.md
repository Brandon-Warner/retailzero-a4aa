# RetailZero

RetailZero is a modern e-commerce storefront that demonstrates **Auth0 for AI Agents (A4AA)** — the set of Auth0 capabilities that let AI agents act securely on behalf of users. Built with Next.js 15, React 19, and the Vercel AI SDK, the app features an AI shopping assistant ("Zero") powered by Claude that can browse products, manage carts, process checkouts, edit user profiles, search order history, and set Google Calendar reminders — all while enforcing identity, consent, and authorization through Auth0.

The application serves as a reference implementation showing how to integrate Auth0's AI-agent primitives (`@auth0/ai`, `@auth0/ai-vercel`) into a real-world agentic workflow where an LLM calls tools that access protected resources and third-party APIs on behalf of authenticated users.

### Tech Stack

- **Framework:** Next.js 15 (App Router)
- **UI:** React 19, Tailwind CSS, Radix UI, Lucide icons
- **AI:** Vercel AI SDK v6, Anthropic Claude (via `@ai-sdk/anthropic`)
- **Auth:** Auth0 (`@auth0/nextjs-auth0`), Auth0 AI (`@auth0/ai`, `@auth0/ai-vercel`)
- **Authorization:** Auth0 Fine-Grained Authorization (FGA) via OpenFGA
- **Third-party integration:** Google Calendar API (via Token Vault)

---

# Auth0 for AI Agents — Use Cases

This application demonstrates four core A4AA capabilities that solve the key challenges of letting AI agents act on behalf of users:

## 1. Client-Initiated Backchannel Authentication (CIBA) — Async User Consent

**Problem:** When an AI agent performs a high-stakes action (e.g. placing an order), the user should explicitly approve it — but the agent is running server-side without direct access to the user's browser session.

**Solution:** The `checkout_cart` tool is wrapped with `auth0AI.withAsyncAuthorization()`. When the agent processes a checkout, Auth0 sends a push notification to the user's device asking them to approve the purchase. The server polls Auth0 until the user approves (or the request times out), keeping the AI stream open. The order is only placed after the user explicitly consents on their device.

**Where:** `src/lib/auth0-ai/ciba.ts`, `src/lib/auth0-ai/index.ts` (checkout_cart tool)

## 2. Fine-Grained Authorization (FGA) — Scoped Resource Access

**Problem:** The AI agent can call tools that modify user data (e.g. editing a profile) or query sensitive data (e.g. order history). It must only be allowed to access resources the current user is authorized for — not other users' data.

**Solution:** Two FGA patterns are demonstrated:

- **Tool-level guards:** The `edit_profile` tool is wrapped with `fgaAI.withFGA()`, which checks an FGA relationship (`user:{id}` → `editor` → `profile:{id}`) before the tool executes. Unauthorized edits are rejected before any data is touched.
- **Retrieval-level filtering (RAG):** The `search_orders` tool uses `FGAFilter` to filter order documents after retrieval. Even though all orders exist in the simulated document store, only orders where the requesting user has a `viewer` relationship are returned. This implements authorized RAG — ensuring AI-generated responses only contain data the user is permitted to see.

**Where:** `src/lib/auth0-ai/fga.ts`, `src/lib/fga/order-store.ts`, `src/lib/auth0-ai/index.ts` (edit_profile, search_orders tools)

## 3. Token Vault — Third-Party API Access

**Problem:** The AI agent needs to call external APIs (Google Calendar) on behalf of the user, which requires valid OAuth tokens for that third-party service. Managing token exchange, refresh, and storage is complex.

**Solution:** The `set_calendar_reminder` tool is wrapped with `auth0AI.withTokenVault()`. Token Vault manages the full lifecycle of the user's Google OAuth tokens — storing them securely, refreshing them when expired, and injecting a valid access token into the tool at execution time. If the user hasn't connected their Google account yet, the tool fails gracefully and the agent redirects them to the Google Connect flow (using Auth0 Connected Accounts / My Account API).

**Where:** `src/lib/auth0-ai/calendar.ts`, `src/lib/auth0-ai/index.ts` (set_calendar_reminder tool), `src/app/api/auth/connect/google/route.ts`

## 4. User Metadata as Persistent Storage (Management API)

**Problem:** The AI agent needs to read and write user-specific data (cart contents, order history) that persists across sessions, without requiring a separate database.

**Solution:** Auth0 `user_metadata` is used as the persistent store for each user's cart and order history. On first access, data is hydrated from the Management API into an in-memory cache. Writes update the cache immediately and persist back to `user_metadata` in the background via fire-and-forget PATCH calls. This gives the AI agent a simple, per-user data layer backed by the identity provider.

**Where:** `src/lib/auth0/user-cache.ts`, `src/lib/auth0/metadata.ts`

---

# Setup
1. ```npm i && npm build```
2. ```openssl rand -hex 32``` >> ***AUTH0_SECRET***

# Google Dev Config 
1. Ensure you have a Google OAuth Client created with scopes:
	- /auth/userinfo.email
	- /auth/userinfo.profile
	- openid
	- /auth/calendar
	- /auth/calendar.events.owned

# Google Calendar
- Make sure you create a new Google Calendar from your Okta Google workspace calendar
- Navigate to the calendar settings and scroll down, copy the calendar ID. We will need this for the env variables.

# Auth0 Config

## Regular Web Application
1. In the Auth0 Dashboard, create a new **Regular Web Application**.
2. Under **Settings**, set the following URLs (adjust the base URL if not running locally):
	- **Allowed Callback URLs:** `http://localhost:3000/auth/callback`
	- **Allowed Logout URLs:** `http://localhost:3000`
3. Copy the **Domain**, **Client ID**, and **Client Secret** into `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, and `AUTH0_CLIENT_SECRET` in your `.env.local`.
4. Enable the following on this application:
	- CIBA (App Grant Type)
	- Token Vault (Google Social + App Grant Type)
	- MyAccount API
	- MRRT for MyAccount API

## Management API Application (Machine-to-Machine)
1. Create a separate **Machine-to-Machine** application for Management API access.
2. Authorize it against the **Auth0 Management API** (`https://<your-tenant>/api/v2/`).
3. Grant it the scopes needed for dynamic client registration and client grants (e.g. `create:clients`, `create:client_grants`).
4. Copy the **Domain**, **Client ID**, and **Client Secret** into `AUTH0_MGMT_DOMAIN`, `AUTH0_MGMT_CLIENT_ID`, and `AUTH0_MGMT_CLIENT_SECRET` in your `.env.local`.
	- Note: `AUTH0_MGMT_DOMAIN` should be the canonical tenant domain (e.g. `tenant.us.auth0.com`), which may differ from `AUTH0_DOMAIN` if you use a custom domain.

# FGA Model Schema
```
model
  schema 1.1

type user

type order
  relations
    define owner: [user]
    define viewer: [user] or owner
```

# LiteLLM API Key
This app routes Anthropic requests through a LiteLLM proxy. You need to obtain an API key from the team's LiteLLM instance.

1. Navigate to the LiteLLM admin UI (ask your team lead for the URL).
2. Go to **Virtual Keys** and click **+ Generate New Key**.
3. Give the key a descriptive name (e.g. `retail-a4aa-local`).
4. Under model access, ensure **claude-4-6-opus** is enabled -- the app hardcodes this model. Set budget limits as desired, then click **Generate**.
5. Copy the generated key (starts with `sk-...`) and use it as `ANTHROPIC_API_KEY` in your `.env.local`.
6. Set `ANTHROPIC_BASE_URL` to the LiteLLM proxy base URL (without the trailing `/v1` -- the app appends it automatically).

# Env
Create a `.env.local` file in the project root with the following variables:
```
AUTH0_SECRET=
AUTH0_DOMAIN=
AUTH0_MGMT_DOMAIN=
AUTH0_MGMT_CLIENT_ID=
AUTH0_MGMT_CLIENT_SECRET=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_AUDIENCE=
APP_BASE_URL=http://localhost:3000

ANTHROPIC_BASE_URL=
ANTHROPIC_API_KEY=

FGA_STORE_ID=
FGA_CLIENT_ID=
FGA_CLIENT_SECRET=
FGA_API_URL=
FGA_API_TOKEN_ISSUER=
FGA_API_AUDIENCE=

GOOGLE_CALENDAR_ID=
```
