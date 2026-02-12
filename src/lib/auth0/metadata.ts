const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;

export async function getAuth0UserMetadata(
  accessToken: string,
  userId: string
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}?fields=user_metadata`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return {};
  const data = await res.json();
  return data.user_metadata ?? {};
}

export async function patchAuth0UserMetadata(
  accessToken: string,
  userId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const res = await fetch(
    `https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_metadata: metadata }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API PATCH failed (${res.status}): ${text}`);
  }
}
