// FGA check: only allow a user to edit their own profile (or admins).
export function getFGAParams() {
  return {
    buildQuery: async (args: any) => ({
      user: `user:${args.userId}`,
      object: `profile:${args.userId}`,
      relation: "editor",
    }),
    onUnauthorized: (args: any) => ({
      error: `You do not have permission to edit the profile for user ${args.userId}.`,
    }),
  };
}
