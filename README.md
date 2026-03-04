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

# Auth0 Config
1. Make sure to enable:
	- CIBA (App Grant Type)
	- Token Vault (Google Social + App Grant Type)
	- MyAccount API
	- MRRT for MyAccount API

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

# Env
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
