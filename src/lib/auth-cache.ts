import type { QueryClient } from "@tanstack/react-query";

/** Clear in-memory user/team data before a different identity can reuse the app shell. */
export function clearQueriesForIdentityChange(queryClient: QueryClient, previousUserId: string | null | undefined, nextUserId: string | null, event: string) {
  if (event === "SIGNED_OUT" || (previousUserId !== undefined && previousUserId !== nextUserId)) {
    queryClient.clear();
    return true;
  }
  return false;
}
