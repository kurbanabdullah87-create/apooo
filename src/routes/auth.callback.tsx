import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Check, HardHat, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({ meta: [{ title: "Giriş tamamlanıyor — Saha" }] }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw new Error("Giriş doğrulanamadı");
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("display_name, username")
          .eq("id", data.user.id)
          .maybeSingle();
        if (profileError) throw profileError;

        const emailPrefix = (data.user.email ?? "").split("@")[0]?.toLocaleLowerCase("tr-TR");
        const currentName = profile?.display_name?.trim();
        const storedName = currentName && currentName.toLocaleLowerCase("tr-TR") !== emailPrefix && currentName !== profile?.username;
        if (storedName) {
          await navigate({ to: "/panel", replace: true });
          return;
        }
        if (active) {
          setUserId(data.user.id);
          setChecking(false);
        }
      } catch {
        if (active) {
          toast.error("Giriş tamamlanamadı. Yeniden deneyebilirsin.");
          await navigate({ to: "/auth", replace: true });
        }
      }
    })();
    return () => { active = false; };
  }, [navigate]);

  async function completeProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || firstName.trim().length < 2 || lastName.trim().length < 2) {
      toast.error("Ad ve soyad alanlarını doldur.");
      return;
    }
    setSaving(true);
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const { data, error } = await supabase.from("profiles").update({ display_name: fullName }).eq("id", userId).select("id").maybeSingle();
    if (error || !data) {
      toast.error("Ad soyad kaydedilemedi. Oturumu kapatıp tekrar deneyin.");
      setSaving(false);
      return;
    }
    toast.success("Hesabın hazır.");
    await navigate({ to: "/panel", replace: true });
  }

  if (checking) return <main className="grid min-h-dvh place-items-center p-6"><div className="flex items-center gap-3 text-muted-foreground"><Loader2 className="size-5 animate-spin"/>Giriş güvenli şekilde doğrulanıyor…</div></main>;

  return <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8"><section className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-xl sm:p-8">
    <div className="mb-7 flex items-center gap-3"><div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><HardHat className="size-6"/></div><div><h1 className="text-xl font-bold">Saha hesabını tamamla</h1><p className="text-sm text-muted-foreground">Bir kez adını ve soyadını ekle.</p></div></div>
    <p className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-emerald-600"/>Giriş sağlayıcısı doğrulandı. Bu bilgiler profilinde gösterilir.</p>
    <form className="space-y-4" onSubmit={(event) => void completeProfile(event)}>
      <div className="space-y-2"><Label htmlFor="oauth-first-name">Ad</Label><Input id="oauth-first-name" autoComplete="given-name" maxLength={80} required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-11 rounded-xl"/></div>
      <div className="space-y-2"><Label htmlFor="oauth-last-name">Soyad</Label><Input id="oauth-last-name" autoComplete="family-name" maxLength={80} required value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-11 rounded-xl"/></div>
      <Button className="h-11 w-full rounded-xl" disabled={saving}>{saving ? <Loader2 className="animate-spin"/> : <><Check/>Kaydet ve devam et</>}</Button>
    </form>
  </section></main>;
}
