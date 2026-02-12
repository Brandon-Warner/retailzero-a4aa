import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth/auth0";
import { hydrateUser, getCachedOrders } from "@/lib/auth0/user-cache";

export async function GET() {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tokenResult = await auth0.getAccessToken();
  await hydrateUser(tokenResult.token, session.user.sub);

  return NextResponse.json(getCachedOrders(session.user.sub));
}
