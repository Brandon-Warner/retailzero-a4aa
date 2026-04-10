# Auth0 SDK `duplex` Patch Fix

## Problem

The Token Vault "Connect Account" flow fails on certain machines with a generic `failed_to_initiate` error. The Auth0 SDK (`@auth0/nextjs-auth0@4.14.1`) swallows the real error, which is:

```
TypeError: RequestInit: duplex option is required when sending a body.
```

This happens because Node.js (varies by version and platform build) requires `duplex: "half"` on `fetch()` requests that include a body. The SDK's internal fetcher (`dist/server/fetcher.js`) does not set this option.

The error is inconsistent across machines. Two developers on the same Node version may see different behavior due to platform-specific builds bundling different versions of `undici` (the library powering Node's native `fetch`).

## Why Not Just Upgrade the SDK?

Newer versions of `@auth0/nextjs-auth0` fix the `duplex` issue but introduce a `SessionDomainMismatchError` that blocks our architecture. This app uses two `Auth0Client` instances:

- **`auth0`** (custom domain: `AUTH0_DOMAIN`) for login
- **`auth0Connect`** (canonical domain: `AUTH0_MGMT_DOMAIN`) for Token Vault / Connected Accounts

The session is created on the custom domain, but the My Account API (`/me/`) only works on the canonical domain (the custom domain rejects the `/me/` audience). The newer SDK explicitly rejects sessions that don't match the client's domain, breaking this two-client setup.

## The Fix

Patch the SDK's fetcher to include `duplex: "half"` on all fetch calls.

### File to patch

`node_modules/@auth0/nextjs-auth0/dist/server/fetcher.js`, line ~164.

**Before:**
```js
return this.config.fetch(url, options);
```

**After:**
```js
return this.config.fetch(url, { ...options, duplex: "half" });
```

### Making it permanent with patch-package

1. **Install patch-package** (if not already installed):
   ```bash
   npm install patch-package --save-dev
   ```

2. **Apply the edit** to `node_modules/@auth0/nextjs-auth0/dist/server/fetcher.js` as described above.

3. **Generate the patch**:
   ```bash
   npx patch-package @auth0/nextjs-auth0
   ```
   This creates `patches/@auth0+nextjs-auth0+4.14.1.patch`.

4. **Add postinstall** to `package.json` scripts:
   ```json
   "postinstall": "patch-package"
   ```

5. **Commit** the `patches/` directory and updated `package.json`. Every future `npm install` will auto-apply the patch.

### After applying

```bash
rm -rf .next
npm run dev
```

Clearing `.next` is required because Next.js caches compiled bundles of `node_modules` dependencies.

## Pinned Versions

- `@auth0/nextjs-auth0`: `4.14.1` (remove the `^` in `package.json` to prevent accidental upgrades)
- Node: 20.x recommended (add `20` to `.nvmrc`)

## How to Verify

1. Log in to the app
2. Navigate to `/connect/google`
3. Click "Connect Google Account"
4. Should redirect to Google's consent screen (no `failed_to_initiate` error)
5. After authorizing, `/connect/google/success` should load
6. `/api/auth/connect/google/status` should return `{ connected: true }`
