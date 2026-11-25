import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Subscription comes from the entitlement RPC; workspace ownership comes from the protected profile row. */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    networkMode: "always",
    staleTime: 15_000,
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) return null;
      const [{ data: profile }, { data: access, error: accessError }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.rpc("get_current_access"),
      ]);
      // Fail closed if the access schema has not been migrated yet.
      const entitlement = accessError ? null : access?.[0] ?? null;
      const hasFullAccess = entitlement?.is_premium === true;
      // Ownership and subscription are different things: a free account that
      // owns its workspace can use core operations, while paid modules remain gated.
      const isWorkspaceOwner = profile?.team_id === user.id;
      return {
        id: user.id,
        email: user.email ?? "",
        profile,
        isAdmin: entitlement?.is_admin === true,
        accessCheckError: accessError?.message ?? null,
        hasFullAccess,
        premiumExpiresAt: entitlement?.expires_at ?? null,
        isUsta: hasFullAccess || isWorkspaceOwner,
        canUsePayroll: true,
      };
    },
  });
}
