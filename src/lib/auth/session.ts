import { auth0 } from "./auth0";

export interface Session {
  user: {
    id: string;
    email: string;
    name: string;
  };
}

/**
 * Get the current session from Auth0.
 * Maps the Auth0 user profile to the app's Session shape.
 */
export async function getSession(): Promise<Session | null> {
  const sessionData = await auth0.getSession();
  if (!sessionData?.user) return null;

  const { sub, email, name } = sessionData.user;
  return {
    user: {
      id: sub,
      email: email ?? "",
      name: name ?? "",
    },
  };
}
