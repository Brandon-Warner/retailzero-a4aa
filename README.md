# RetailZero

RetailZero is a modern e-commerce storefront that demonstrates Auth0 for AI Agents (A4AA), a set of Auth0 capabilities that enable AI agents to act securely on behalf of users. Built with Next.js 15, React 19, and the Vercel AI SDK, the app features an AI shopping assistant ("Zero") powered by Claude that can browse products, manage carts, process checkouts, edit user profiles, search order history, and set Google Calendar reminders. All of these agent actions enforce identity, consent, and authorization through Auth0, eliminating the need to build custom access controls into each tool integration.

This reference implementation shows developers and architects how to integrate Auth0's AI-agent primitives (`@auth0/ai`, `@auth0/ai-vercel`) into production agentic workflows. Rather than reimplementing identity and authorization for each new LLM tool or third-party API, teams can reuse Auth0's primitives to let agents safely access protected resources and external services on behalf of authenticated users, accelerating time-to-market for agent-powered features while reducing the operational cost of maintaining custom security logic.

### Tech Stack

- **Framework:** Next.js 15 (App Router)
- **UI:** React 19, Tailwind CSS, Radix UI, Lucide icons
- **AI:** Vercel AI SDK v6, Anthropic Claude (via `@ai-sdk/anthropic`)
- **Auth:** Auth0 (`@auth0/nextjs-auth0`), Auth0 AI (`@auth0/ai`, `@auth0/ai-vercel`)
- **Authorization:** Auth0 Fine-Grained Authorization (FGA)
- **Third-party integration:** Google Calendar API (via Token Vault)

---

# Auth0 for AI Agents -- Use Cases

This application demonstrates four core A4AA capabilities that solve the key challenges of letting AI agents act on behalf of users.

## 1. Authentication -- User Context

**Problem:** An AI agent running server-side needs to know who the user is and carry their identity into every tool call. Without authenticated context, the agent cannot access protected resources or act on behalf of a specific user.

**Solution:** Auth0 handles user authentication via OIDC. On each chat request, the app retrieves the user's session, access token, and refresh token from Auth0 and injects them into the AI tool context via `setAIContext()`, `setAuthAccessToken()`, and `setAuthRefreshToken()`. Every downstream tool call (cart operations, profile edits, order queries, calendar reminders) inherits the authenticated user's identity. Guest users can browse and manage a cart, but must log in before performing protected actions.

**Where:**

```
src/
├── lib/
│   └── auth/
│       ├── auth0.ts          # Auth0Client instances (main + Connected Accounts)
│       └── session.ts        # Session mapper
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...auth0]/
│   │   │       └── route.ts  # Auth0 callback/logout handler
│   │   └── chat/
│   │       └── route.ts      # Extracts session + tokens, sets AI context per request
│   └── ...
├── middleware.ts              # Auth0 middleware: enforces session on protected routes
└── ...
```

## 2. Client-Initiated Backchannel Authentication (CIBA) -- Async Authorization

**Problem:** When an AI agent performs a high-stakes action such as placing an order, the user should explicitly approve it, but the agent is running server-side without direct access to the user's browser session.

**Solution:** The `checkout_cart` tool is wrapped with `auth0AI.withAsyncAuthorization()`. When the agent processes a checkout, Auth0 sends a push notification to the user's device via Guardian asking them to approve the purchase. The server polls Auth0 until the user approves or the request times out, keeping the AI stream open. The order is placed only after the user explicitly consents on their device.

**Where:**

```
src/
├── lib/
│   └── auth0-ai/
│       ├── index.ts          # checkout_cart tool wrapped with withAsyncAuthorization()
│       └── ciba.ts           # CIBA params: user ID, binding message, scopes, audience
├── app/
│   └── api/
│       └── chat/
│           └── route.ts      # Sets up Auth0AI context for CIBA polling
└── ...
```

## 3. Fine-Grained Authorization (FGA) -- Scoped Resource Access

**Problem:** The AI agent can call tools that modify user data (such as editing a profile) or query sensitive data (such as order history). It must only be allowed to access resources the current user is authorized for, not other users' data.

**Solution:** Two FGA patterns are demonstrated:

- **Tool-level guards:** The `edit_profile` tool is wrapped with `fgaAI.withFGA()`, which checks an FGA relationship (`user:{id}` -> `editor` -> `profile:{id}`) before the tool executes. Unauthorized edits are rejected before any data is touched.
- **Retrieval-level filtering (RAG):** The `search_orders` tool uses `FGAFilter` to filter order documents after retrieval. Even though all orders exist in the simulated document store, only orders where the requesting user has a `viewer` relationship are returned. This implements authorized RAG, ensuring AI-generated responses contain only data the user is permitted to see.

**Where:**

```
src/
├── lib/
│   ├── auth0-ai/
│   │   ├── index.ts          # edit_profile (withFGA) + search_orders (FGAFilter)
│   │   └── fga.ts            # FGA check params: query builder, unauthorized handler
│   └── fga/
│       └── order-store.ts    # Order document store, FGA tuple writes, FGAFilter factory
└── ...
```

## 4. Token Vault -- Third-Party API Access

**Problem:** The AI agent needs to call external APIs (Google Calendar) on behalf of the user, which requires valid OAuth tokens for that third-party service. Managing token exchange, refresh, and storage is complex and error-prone.

**Solution:** The `set_calendar_reminder` tool is wrapped with `auth0AI.withTokenVault()`. Token Vault manages the full lifecycle of the user's Google OAuth tokens, storing them securely, refreshing them when expired, and injecting a valid access token into the tool at execution time. If the user has not connected their Google account yet, the tool fails gracefully and the agent redirects them to the Google Connect flow using Auth0 Connected Accounts and the My Account API.

**Where:**

```
src/
├── lib/
│   ├── auth0-ai/
│   │   ├── index.ts          # set_calendar_reminder tool wrapped with withTokenVault()
│   │   └── calendar.ts       # Google Calendar API: createCalendarEvent()
│   └── auth/
│       └── auth0.ts          # auth0Connect client (My Account API, canonical domain)
├── app/
│   └── api/
│       └── auth/
│           ├── connect/
│           │   └── google/
│           │       └── route.ts   # Initiates Google OAuth via connectAccount()
│           └── tokens/
│               └── route.ts       # Token Vault federated exchange + introspection
└── ...
```

---

# Setup

## Prerequisites

- Node.js 20.x (add `20` to `.nvmrc`)
- An Auth0 tenant with access to A4AA features (CIBA, Token Vault, My Account API)
- A Google Cloud project with the Calendar API enabled
- An FGA store (via [fga.dev](https://fga.dev))
- Access to a LiteLLM proxy with Claude model access

## 1. Install Dependencies

```bash
npm install
```

## 2. Apply the Auth0 SDK Duplex Patch

The Auth0 SDK (`@auth0/nextjs-auth0@4.14.1`) has a known issue where the Token Vault "Connect Account" flow fails with a `failed_to_initiate` error on certain machines. This happens because Node.js requires `duplex: "half"` on `fetch()` requests that include a body, and the SDK's internal fetcher does not set this option.

**Why not upgrade the SDK?** Newer versions fix the duplex issue but introduce a `SessionDomainMismatchError` that breaks this app's two-client architecture (custom domain for login, canonical domain for My Account API).

### Apply the patch

Edit `node_modules/@auth0/nextjs-auth0/dist/server/fetcher.js`, around line 164.

**Before:**
```js
return this.config.fetch(url, options);
```

**After:**
```js
return this.config.fetch(url, { ...options, duplex: "half" });
```

### Make it permanent with patch-package

```bash
npm install patch-package --save-dev
npx patch-package @auth0/nextjs-auth0
```

This creates `patches/@auth0+nextjs-auth0+4.14.1.patch`. Then add a postinstall script to `package.json`:

```json
"scripts": {
  "postinstall": "patch-package"
}
```

Commit the `patches/` directory so the fix auto-applies on every `npm install`.

### After applying

```bash
rm -rf .next
npm run dev
```

Clearing `.next` is required because Next.js caches compiled bundles of `node_modules` dependencies.

### Pin the SDK version

Remove the `^` from `@auth0/nextjs-auth0` in `package.json` to prevent accidental upgrades:

```json
"@auth0/nextjs-auth0": "4.14.1"
```

## 3. Google Cloud Setup

### Create OAuth Client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or use an existing one).
3. Navigate to **APIs & Services > Library** and enable the **Google Calendar API**.
4. Navigate to **APIs & Services > Credentials** and click **Create Credentials > OAuth client ID**.
5. Set the application type to **Web application**.
6. Add the authorized redirect URI that Auth0 will use (found in your Auth0 Google connection settings).
7. Save the **Client ID** and **Client Secret** -- you will need these when configuring the Auth0 Google connection.

### Required OAuth Scopes

The Google OAuth client needs access to these scopes:
- `/auth/userinfo.email`
- `/auth/userinfo.profile`
- `openid`
- `/auth/calendar`
- `/auth/calendar.events.owned`

### Create a Google Calendar

1. From your Google Workspace calendar, create a new calendar.
2. Navigate to the calendar's settings and scroll down to find the **Calendar ID**.
3. Copy this value -- it goes into `GOOGLE_CALENDAR_ID` in your `.env.local`.

## 4. Auth0 Tenant Configuration

### 4a. Regular Web Application

1. In the Auth0 Dashboard, create a new **Regular Web Application**.
2. Under **Settings**, configure the following URLs (adjust the base URL if not running locally):
   - **Allowed Callback URLs:** `http://localhost:3000/auth/callback`
   - **Allowed Logout URLs:** `http://localhost:3000`
   - **Allowed Web Origins:** `http://localhost:3000`
3. Under **Settings > Application Properties**, set:
   - **Token Endpoint Authentication Method:** `Post`
4. Under **Settings > Advanced Settings > Grant Types**, enable:
   - Authorization Code
   - Refresh Token
   - Client-Initiated Backchannel Authentication (CIBA)
5. Copy the **Domain**, **Client ID**, and **Client Secret** into your `.env.local`:
   - `AUTH0_DOMAIN` -- use your custom domain if configured, otherwise the canonical tenant domain
   - `AUTH0_CLIENT_ID`
   - `AUTH0_CLIENT_SECRET`

### 4b. Enable Token Vault

1. Navigate to **Applications > [RetailZero] > Addons** (or **Settings > Advanced Settings**, depending on your Dashboard version).
2. Enable **Token Vault**.
3. Under Token Vault settings, add the **google-oauth2** connection.
4. This allows the app to exchange a user's refresh token for a Google access token via federated connection token exchange.

### 4c. Enable My Account API

The My Account API is required for the Connected Accounts flow (linking a user's Google account without re-authentication).

1. Navigate to **Applications > APIs** and activate the **Auth0 My Account API**.
2. Select **Auth0 My Account API** > **Application Access** tab.
3. Find the RetailZero application and click **Edit**.
4. Set the access type to **User Access** and authorization to **Authorized**.
5. Under permissions, select **All** Connected Accounts scopes.
6. Click **Save** to create the client grant.
7. If using MRRT (step 4d), go to the My Account API **Settings** > **Access Settings** and enable **Allow Skipping User Consent**.

### 4d. Enable MRRT (Multi-Resource Refresh Tokens)

MRRT allows a single refresh token to obtain access tokens for multiple APIs. This is required for Token Vault -- your app needs to exchange its refresh token for a My Account API access token to manage connected accounts (e.g. linking Google).

1. Navigate to **Applications > [RetailZero] > Settings**.
2. Scroll to the **Refresh Token** section.
3. Enable **Multi-Resource Refresh Tokens** for the **My Account API**.
4. Configure the MRRT policy with:
   - **Audience:** `https://<your-canonical-domain>/me/`
   - **Scopes:** `create:me:connected_accounts`, `read:me:connected_accounts`, `delete:me:connected_accounts`
5. Without MRRT, Token Vault cannot exchange refresh tokens for My Account API access tokens, and the Connected Accounts flow will fail.

### 4e. Enable CIBA and Guardian Push MFA

CIBA requires Auth0 Guardian push notifications to deliver approval requests to the user's device. MFA must be required (not optional) for CIBA to work.

1. Navigate to **Auth0 Dashboard > Settings > Advanced**.
2. Enable **Client-Initiated Backchannel Authentication (CIBA)**.
3. The CIBA grant type also needs to be enabled on the Regular Web Application (step 4a above).
4. Navigate to **Security > Multi-factor Auth**.
5. Enable **Push Notifications** (Auth0 Guardian).
6. Under **Policy**, set MFA to **Require** (not "Adaptive" or "Never"). CIBA will not send push notifications unless MFA is required.
7. Users must enroll in Guardian on their device before CIBA approval flows will work. On first login with MFA required, they will be prompted to set up Guardian.

### 4f. Configure Google OAuth2 Connection

1. Navigate to **Auth0 Dashboard > Authentication > Social**.
2. Select (or create) the **Google / Gmail** connection.
3. Enter your **Google OAuth Client ID** and **Client Secret** from step 3.
4. Under **Permissions**, ensure these scopes are enabled:
   - `profile`
   - `email`
   - `https://www.googleapis.com/auth/calendar.events`
5. In the **Purpose** section of the connection, toggle on **"Authentication and Connected Accounts for Token Vault"**. This is required for Token Vault to store and exchange Google OAuth tokens via the Connected Accounts flow.
6. Enable **`offline_access`** on the connection to permit refresh token retrieval from Google.
7. Under **Applications**, enable this connection for the RetailZero Regular Web Application.

### 4g. Management API Application (Machine-to-Machine)

1. Create a separate **Machine-to-Machine** application in the Auth0 Dashboard.
2. Authorize it against the **Auth0 Management API** (`https://<your-tenant>/api/v2/`).
3. Grant the following scopes:
   - `read:users`
   - `update:users`
   - `read:users_app_metadata`
   - `update:users_app_metadata`
   - `read:client_grants`
   - `create:client_grants`
   - `read:clients`
   - `create:clients`
   - `delete:clients`
   - `update:clients`
   - `read:connections`
   - `update:connections`
4. Copy the credentials into your `.env.local`:
   - `AUTH0_MGMT_DOMAIN` -- the **canonical** tenant domain (e.g. `tenant.us.auth0.com`), which may differ from `AUTH0_DOMAIN` if you use a custom domain
   - `AUTH0_MGMT_CLIENT_ID`
   - `AUTH0_MGMT_CLIENT_SECRET`

### 4h. Create the Resource Server (API)

1. Navigate to **Auth0 Dashboard > Applications > APIs**.
2. Click **Create API**.
3. Set the following:
   - **Name:** RetailZero API
   - **Identifier:** `https://api.retailzero.com`
   - **Signing Algorithm:** RS256
4. Under **Settings**, enable:
   - **Allow Offline Access** (enables refresh tokens)
5. Set `AUTH0_AUDIENCE=https://api.retailzero.com` in your `.env.local`.

## 5. FGA Setup

### Create an FGA Store

1. Sign up at [fga.dev](https://fga.dev) and create a new store.
2. Generate client credentials for API access.
3. Copy the credentials into your `.env.local`:
   - `FGA_STORE_ID`
   - `FGA_CLIENT_ID`
   - `FGA_CLIENT_SECRET`
   - `FGA_API_URL` (typically `https://api.us1.fga.dev`)
   - `FGA_API_TOKEN_ISSUER` (typically `auth.fga.dev`)
   - `FGA_API_AUDIENCE` (typically `https://api.us1.fga.dev/`)

### Deploy the Authorization Model

Deploy the following authorization model to your FGA store. This defines the ownership and access relationships for orders and user profiles:

```
model
  schema 1.1

type user

type order
  relations
    define owner: [user]
    define viewer: [user] or owner

type profile
  relations
    define owner: [user]
    define editor: [user] or owner
```

You can deploy this via the FGA Dashboard, CLI, or the automated setup script:

```bash
node scripts/setup-auth0.mjs
```

## 6. LiteLLM API Key

This app routes Anthropic requests through a LiteLLM proxy.

1. Navigate to the LiteLLM admin UI (ask your team lead for the URL).
2. Go to **Virtual Keys** and click **+ Generate New Key**.
3. Give the key a descriptive name (e.g. `retail-a4aa-local`).
4. Under model access, ensure **claude-4-6-opus** is enabled -- the app hardcodes this model. Set budget limits as desired, then click **Generate**.
5. Copy the generated key (starts with `sk-...`) and use it as `ANTHROPIC_API_KEY` in your `.env.local`.
6. Set `ANTHROPIC_BASE_URL` to the LiteLLM proxy base URL (without the trailing `/v1` -- the app appends it automatically).

## 7. Generate AUTH0_SECRET

Generate a random 32-byte hex string for session encryption:

```bash
openssl rand -hex 32
```

Copy the output into `AUTH0_SECRET` in your `.env.local`.

## 8. Environment Variables

Create a `.env.local` file in the project root with the following variables:

```
# Auth0 - Regular Web App
AUTH0_SECRET=
AUTH0_DOMAIN=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=

# Auth0 - Management API (M2M)
AUTH0_MGMT_DOMAIN=
AUTH0_MGMT_CLIENT_ID=
AUTH0_MGMT_CLIENT_SECRET=

# Auth0 - API
AUTH0_AUDIENCE=https://api.retailzero.com

# App
APP_BASE_URL=http://localhost:3000

# LLM (Anthropic via LiteLLM)
ANTHROPIC_BASE_URL=
ANTHROPIC_API_KEY=

# FGA
FGA_STORE_ID=
FGA_CLIENT_ID=
FGA_CLIENT_SECRET=
FGA_API_URL=https://api.us1.fga.dev
FGA_API_TOKEN_ISSUER=auth.fga.dev
FGA_API_AUDIENCE=https://api.us1.fga.dev/

# Google Calendar
GOOGLE_CALENDAR_ID=
```

## 9. Automated Setup (Optional)

Instead of configuring Auth0 resources manually, you can use the setup script to create applications, APIs, connections, and deploy the FGA model programmatically:

```bash
node scripts/setup-auth0.mjs
```

The script will prompt you for credentials, create all Auth0 resources via the Management API, deploy the FGA authorization model, and generate a `.env.local` file. Note that some features (Token Vault, My Account API, MRRT, CIBA tenant toggle) still require manual enablement in the Auth0 Dashboard as described in step 4.

## 10. Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Verify the Setup

1. You should be redirected to Auth0 Universal Login.
2. After logging in, the RetailZero storefront loads with the AI chat widget.
3. Try asking Zero to "show me some products" or "add the headphones to my cart."
4. To test Token Vault, navigate to the profile page and connect your Google account, then ask Zero to "set a calendar reminder for Friday."
5. To test CIBA, add items to your cart and ask Zero to "checkout." You should receive a push notification to approve.
