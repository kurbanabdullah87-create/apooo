import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { HardHat, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Şifre yenile — Yevmiye ve Finans" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setValid(!error && Boolean(data.user));
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 12) { toast.error("Şifren en az 12 karakter olmalı."); return; }
    if (password !== confirm) { toast.error("Şifreler eşleşmiyor."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error("Şifre yenilenemedi. Bağlantıyı yeniden isteyip tekrar dene.");
      setBusy(false);
      return;
    }
    toast.success("Şifren güncellendi.");
    await navigate({ to: "/panel", replace: true });
  }

  return <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8"><section className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-xl sm:p-8">
    <div className="mb-7 flex items-center gap-3"><div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><HardHat className="size-6"/></div><div><h1 className="text-xl font-bold">Şifreni yenile</h1><p className="text-sm text-muted-foreground">Yeni ve benzersiz bir şifre belirle.</p></div></div>
    {!ready ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin"/>Bağlantı doğrulanıyor…</p> : !valid ? <div className="space-y-4"><p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-muted-foreground">Şifre yenileme bağlantısı geçersiz veya süresi dolmuş. Giriş ekranından yeni bağlantı iste.</p><Button className="w-full" onClick={() => void navigate({ to: "/auth", replace: true })}>Giriş ekranına dön</Button></div> : <>
      <p className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-emerald-600"/>Yeni şifren en az 12 karakter olmalı.</p>
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <div className="space-y-2"><Label htmlFor="new-password">Yeni şifre</Label><div className="relative"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input id="new-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl pl-10"/></div></div>
        <div className="space-y-2"><Label htmlFor="confirm-password">Yeni şifreyi tekrar gir</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11 rounded-xl"/></div>
        <Button className="h-11 w-full rounded-xl" disabled={busy}>{busy ? <Loader2 className="animate-spin"/> : "Şifreyi kaydet"}</Button>
      </form>
    </>}
  </section></main>;
}
