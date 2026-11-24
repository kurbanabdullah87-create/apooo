import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { BusinessProfileProvider } from "@/lib/work-profiles";
import { useMe } from "@/hooks/use-me";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: AuthenticatedApp,
});

function AuthenticatedApp() {
  return <BusinessProfileProvider><UsageTracker /><AppShell /></BusinessProfileProvider>;
}

const usageModules = new Set(["panel", "isler", "cari", "yevmiye", "ekipman", "doviz", "banka", "randevu", "rapor", "ayarlar", "premium", "giderler", "alim", "borc", "puantaj", "hava", "hesaplayici"]);
function UsageTracker() {
  const me = useMe();
  const pathname = useLocation({ select: (location) => location.pathname });
  const sessionRecorded = useRef<string | null>(null);
  const lastPage = useRef("");
  useEffect(() => {
    const userId = me.data?.id;
    if (!userId) return;
    if (sessionRecorded.current !== userId) {
      sessionRecorded.current = userId;
      void supabase.rpc("record_app_usage", { _event_type: "session_start", _module: "app" });
    }
    const segment = pathname.split("/").filter(Boolean)[0] ?? "panel";
    const module = usageModules.has(segment) ? segment : "other";
    const key = `${userId}:${pathname}`;
    if (lastPage.current === key) return;
    lastPage.current = key;
    void supabase.rpc("record_app_usage", { _event_type: "page_view", _module: module });
  }, [me.data?.id, pathname]);
  return null;
}
