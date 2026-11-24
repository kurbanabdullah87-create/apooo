import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { ProfileContext, type ProfileContextValue } from "@/lib/work-profile-context";

export type BusinessProfile = {
  id: string; team_id: string; name: string; description: string | null; logo_url: string | null;
  phone: string | null; currency: string; default_hourly_rate: number | null; color: string;
  is_default: boolean; is_archived: boolean;
};
export function BusinessProfileProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const qc = useQueryClient();
  const profilesQuery = useQuery({
    queryKey: ["business-profiles", me.data?.id], enabled: Boolean(me.data?.isUsta && me.data.id),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("business_profiles").select("*").eq("team_id", me.data!.id).order("is_default", { ascending: false }).order("name");
      if (error) throw error;
      return (data ?? []) as BusinessProfile[];
    },
  });
  const storageKey = `saha-active-profile:${me.data?.id ?? "guest"}`;
  const [savedId, setSavedId] = useState<string | null>(null);
  useEffect(() => {
    try { setSavedId(localStorage.getItem(storageKey)); } catch { setSavedId(null); }
    const sync = (event: StorageEvent) => { if (event.key === storageKey) setSavedId(event.newValue); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey]);
  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);
  const activeProfile = profiles.find((profile) => profile.id === savedId && !profile.is_archived)
    ?? profiles.find((profile) => profile.is_default && !profile.is_archived)
    ?? profiles.find((profile) => !profile.is_archived) ?? null;
  const activeProfileId = activeProfile?.id ?? null;
  useEffect(() => {
    if (!activeProfileId || savedId === activeProfileId) return;
    try { localStorage.setItem(storageKey, activeProfileId); } catch { /* profile still works for this session */ }
    setSavedId(activeProfileId);
  }, [activeProfileId, savedId, storageKey]);
  const switchProfile = useCallback((id: string, confirmBeforeSwitch = true) => {
    if (!profiles.some((profile) => profile.id === id)) return false;
    if (activeProfileId === id) return true;
    if (confirmBeforeSwitch && activeProfileId && typeof window !== "undefined" && !window.confirm("Usta profili değişecek. Açık form taslaklarını yeni profil bağlamında yeniden kontrol edin. Devam edilsin mi?")) return false;
    try { localStorage.setItem(storageKey, id); } catch { /* in-memory selection remains available */ }
    setSavedId(id);
    qc.removeQueries({ queryKey: ["work"] });
    qc.removeQueries({ queryKey: ["transactions"] });
    qc.removeQueries({ queryKey: ["expenses"] });
    return true;
  }, [activeProfileId, profiles, qc, storageKey]);
  const value = useMemo<ProfileContextValue>(() => ({
    profiles, activeProfile, activeProfileId: activeProfile?.id ?? null,
    loading: me.isLoading || Boolean(me.data?.isUsta && profilesQuery.isLoading), profileError: profilesQuery.error instanceof Error ? profilesQuery.error.message : profilesQuery.error ? "Profiller yüklenemedi." : me.data?.isUsta && !profilesQuery.isLoading && profiles.length === 0 ? "Henüz usta profili yok. Ayarlar bölümünden profil oluşturun." : null, isUsta: Boolean(me.data?.isUsta && profilesQuery.isSuccess), switchProfile,
    refreshProfiles: async () => { await qc.invalidateQueries({ queryKey: ["business-profiles", me.data?.id] }); },
  }), [profiles, activeProfile, me.data?.id, me.data?.isUsta, me.isLoading, profilesQuery.isLoading, profilesQuery.isSuccess, profilesQuery.error, qc, switchProfile]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
