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
