import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth/auth0";
import {
  getAuth0UserMetadata,
  patchAuth0UserMetadata,
} from "@/lib/auth0/metadata";

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const DEFAULT_ADDRESS = { street: "", city: "", state: "", zip: "" };
const DEFAULT_PREFERENCES = { newsletter: false, theme: "light" as const };

async function patchAuth0User(
  accessToken: string,
  userId: string,
  body: Record<string, unknown>
) {
  const res = await fetch(
    `https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API PATCH failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function GET() {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { sub, email, name } = session.user;
  const tokenResult = await auth0.getAccessToken();
  const accessToken = tokenResult.token;
  const userMetadata = await getAuth0UserMetadata(accessToken, sub);

  return NextResponse.json({
    id: sub,
    email: email ?? "",
    name: name ?? "",
    address: { ...DEFAULT_ADDRESS, ...(userMetadata.address as Record<string, string> | undefined) },
    preferences: { ...DEFAULT_PREFERENCES, ...(userMetadata.preferences as Record<string, unknown> | undefined) },
  });
}

export async function PATCH(request: NextRequest) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { sub, email } = session.user;
  const tokenResult = await auth0.getAccessToken();
  const accessToken = tokenResult.token;
  const body = await request.json();

  // Update root-level attributes (name)
  if (body.name !== undefined) {
    await patchAuth0User(accessToken, sub, { name: body.name });
  }

  // Update user_metadata (address, preferences)
  const metadataUpdate: Record<string, unknown> = {};
  if (body.address !== undefined) metadataUpdate.address = body.address;
  if (body.preferences !== undefined) metadataUpdate.preferences = body.preferences;

  if (Object.keys(metadataUpdate).length > 0) {
    await patchAuth0UserMetadata(accessToken, sub, metadataUpdate);
  }

  // Re-fetch to return the latest state
  const userMetadata = await getAuth0UserMetadata(accessToken, sub);

  return NextResponse.json({
    id: sub,
    email: email ?? "",
    name: body.name ?? session.user.name ?? "",
    address: { ...DEFAULT_ADDRESS, ...(userMetadata.address as Record<string, string> | undefined) },
    preferences: { ...DEFAULT_PREFERENCES, ...(userMetadata.preferences as Record<string, unknown> | undefined) },
  });
}
