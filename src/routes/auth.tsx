import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowRight, Check, HardHat, Loader2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getRememberMe, setRememberMe } from "@/integrations/supabase/rememberedAuthStorage";
import { normalizeUsername, USERNAME_RE, usernameToEmail } from "@/lib/username";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Giriş — Saha" },
      { name: "description", content: "Saha hesabına güvenli şekilde giriş yap." },
      { property: "og:title", content: "Giriş — Saha" },
      { property: "og:description", content: "Saha hesabına güvenli şekilde giriş yap." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/panel" });
  },
  component: AuthPage,
});

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5"><path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"/><path fill="#FF3D00" d="M24 44c5.5 0 10.2-1.8 13.6-4.9l-6.7-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.7v5.2A20 20 0 0 0 24 44Z"/><path fill="#4CAF50" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.2H5.7a20 20 0 0 0 0 17.6l6.9-5.2Z"/><path fill="#1976D2" d="M24 12c3 0 5.7 1 7.8 3.1l5.9-5.9C34.1 6 29.5 4 24 4A20 20 0 0 0 5.7 15.2l6.9 5.2C14.2 15.6 18.7 12 24 12Z"/></svg>;
}

function AppleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-current"><path d="M16.37 12.56c.02 2.14 1.88 2.85 1.9 2.86-.02.05-.3 1.03-.98 2.04-.59.88-1.2 1.76-2.16 1.78-.94.02-1.24-.57-2.31-.57-1.08 0-1.42.55-2.31.59-.93.04-1.64-.95-2.23-1.82-1.21-1.76-2.13-4.97-.89-7.13.62-1.07 1.72-1.75 2.91-1.77.91-.02 1.77.62 2.33.62.56 0 1.61-.77 2.72-.66.46.02 1.77.19 2.61 1.43-.07.04-1.56.91-1.59 2.63ZM14.6 6.73c.48-.58.8-1.39.71-2.2-.69.03-1.52.46-2.01 1.04-.44.51-.82 1.34-.72 2.12.77.06 1.55-.39 2.02-.96Z"/></svg>;
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [resetMode, setResetMode] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(getRememberMe);
  const [busy, setBusy] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (resetMode) {
      if (!/^\S+@\S+\.\S+$/.test(address)) return toast.error("E-posta adresini kontrol et.");
      setBusy(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: `${window.location.origin}/auth/reset-password` });
        if (error) throw error;
        toast.success("Eğer bu adres kayıtlıysa, şifre yenileme bağlantısı gönderildi.");
        setResetMode(false);
      } catch {
        toast.success("Eğer bu adres kayıtlıysa, şifre yenileme bağlantısı gönderildi.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode === "signup") {
      if (!/^\S+@\S+\.\S+$/.test(address)) return toast.error("Geçerli bir e-posta adresi girin.");
      if (firstName.trim().length < 2 || lastName.trim().length < 2) return toast.error("Ad ve soyad alanlarını doldurun.");
      if (password.length < 12) return toast.error("Şifren en az 12 karakter olmalı.");
    } else if (legacy) {
      const username = normalizeUsername(address);
      if (!USERNAME_RE.test(username)) return toast.error("Geçerli kullanıcı adını girin.");
      if (!password) return toast.error("Şifreni girin.");
    } else {
      if (!/^\S+@\S+\.\S+$/.test(address)) return toast.error("Geçerli bir e-posta adresi girin.");
      if (!password) return toast.error("Şifreni girin.");
    }

    setBusy(true);
    setRememberMe(remember);
    try {
      if (mode === "signup") {
        const fullName = `${firstName.trim()} ${lastName.trim()}`;
        const { data, error } = await supabase.auth.signUp({
          email: address,
          password,
          options: {
            data: { full_name: fullName, display_name: fullName },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        if (data.session) {
          await navigate({ to: "/panel", replace: true });
        } else {
          setConfirmationSent(true);
          setPassword("");
        }
      } else {
        const loginEmail = legacy ? usernameToEmail(normalizeUsername(address)) : address;
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
        if (error) throw error;
        await navigate({ to: "/panel", replace: true });
      }
    } catch {
      toast.error(mode === "login" ? "Giriş yapılamadı. Bilgilerini kontrol edip tekrar dene." : "Hesap oluşturulamadı. E-posta adresini ve bilgilerini kontrol et.");
    } finally {
      setBusy(false);
    }
  }

  async function continueWith(provider: "google" | "apple") {
    setBusy(true);
    setRememberMe(remember);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
          ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : { scopes: "email name" }),
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error("oauth_redirect_missing");
      window.location.assign(data.url);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLocaleLowerCase("en-US") : "";
      if (/unsupported provider|provider is not enabled|validation_failed/.test(message)) {
        toast.error(`${provider === "google" ? "Google" : "Apple"} girişi Supabase'te etkin değil. Sağlayıcıyı açıp OAuth Client ID ve Client Secret eklemek gerekiyor.`);
      } else {
        toast.error(`${provider === "google" ? "Google" : "Apple"} ile giriş başlatılamadı. Lütfen ayarları ve yönlendirme adresini kontrol edin.`);
      }
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-8 sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/10 to-transparent" />
      <section className="relative w-full max-w-md rounded-3xl border bg-card p-6 shadow-xl shadow-black/10 sm:p-8">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><HardHat className="size-6" /></div>
          <div><p className="text-xl font-bold tracking-tight">Saha</p><p className="text-sm text-muted-foreground">Operasyon ve finans</p></div>
          <div className="ml-auto flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground"><ShieldCheck className="size-3.5 text-emerald-600"/>Güvenli oturum</div>
        </div>

        {confirmationSent ? (
          <div className="space-y-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600"><Check className="size-6"/></div>
            <h1 className="text-xl font-bold">E-postanı doğrula</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">Hesabı etkinleştirmek için <strong className="break-all text-foreground">{email.trim()}</strong> adresine gönderilen bağlantıyı aç.</p>
            <Button variant="outline" className="w-full" onClick={() => { setConfirmationSent(false); setMode("login"); }}>Giriş ekranına dön</Button>
          </div>
        ) : (
          <>
            <div className="mb-6"><p className="text-sm font-semibold text-primary">{resetMode ? "Hesap kurtarma" : mode === "login" ? "Hesabına eriş" : "Yeni hesabını oluştur"}</p><h1 className="mt-1 text-2xl font-bold tracking-tight">{resetMode ? "Şifreni yenile" : mode === "login" ? "Tekrar hoş geldin" : "Saha'ya katıl"}</h1><p className="mt-1 text-sm text-muted-foreground">{resetMode ? "Kayıtlı e-posta adresine güvenli bir bağlantı göndereceğiz." : mode === "login" ? "Bilgilerini girerek güvenli şekilde devam et." : "Hesap bilgilerin yalnızca sana ait olacak."}</p></div>

            {!resetMode && <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => void continueWith("google")} disabled={busy}><GoogleMark/>Google ile devam et</Button>
              <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => void continueWith("apple")} disabled={busy}><AppleMark/>Apple ile devam et</Button>
            </div>}
            {!resetMode && <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-border"/><span className="text-xs text-muted-foreground">veya e-posta ile</span><span className="h-px flex-1 bg-border"/></div>}

            <form onSubmit={(event) => void submit(event)} className="space-y-4">
              {!resetMode && mode === "signup" && <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="first-name">Ad</Label><Input id="first-name" autoComplete="given-name" maxLength={80} value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="h-11 rounded-xl"/></div>
                <div className="space-y-2"><Label htmlFor="last-name">Soyad</Label><Input id="last-name" autoComplete="family-name" maxLength={80} value={lastName} onChange={(e) => setLastName(e.target.value)} required className="h-11 rounded-xl"/></div>
              </div>}
              <div className="space-y-2"><Label htmlFor="email">{legacy && mode === "login" && !resetMode ? "Eski kullanıcı adı" : "E-posta adresi"}</Label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input id="email" type={mode === "signup" || resetMode ? "email" : "text"} inputMode={legacy && !resetMode ? "text" : "email"} autoCapitalize="none" autoComplete={mode === "login" ? "username" : "email"} placeholder={legacy && mode === "login" && !resetMode ? "eski kullanıcı adın" : "adiniz@gmail.com"} maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11 rounded-xl pl-10"/></div></div>
              {!resetMode && <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="password">Şifre</Label>{mode === "signup" && <span className="text-[11px] text-muted-foreground">En az 12 karakter</span>}</div><div className="relative"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 12 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11 rounded-xl pl-10"/></div></div>}
              {!resetMode && mode === "login" && !legacy && <button type="button" onClick={() => setResetMode(true)} className="-mt-1 text-left text-xs font-medium text-primary hover:underline">Şifremi unuttum</button>}
              {!resetMode && <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border bg-background px-3 py-2.5 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={remember} onChange={(e) => setRemember(e.target.checked)}/><span>Beni hatırla</span><span className="ml-auto text-xs text-muted-foreground">{remember ? "Bu cihazda açık kalır" : "Bu sekmede açık kalır"}</span></label>}
              <Button type="submit" className="h-11 w-full rounded-xl text-base" disabled={busy}>{busy ? <Loader2 className="animate-spin"/> : <>{resetMode ? "Yenileme bağlantısı gönder" : mode === "login" ? "Giriş yap" : "Hesap oluştur"}<ArrowRight/></>}</Button>
            </form>

            {resetMode ? <button type="button" onClick={() => setResetMode(false)} className="mt-4 w-full text-center text-sm font-medium text-primary hover:underline">Giriş ekranına dön</button> : <>
              {mode === "login" && <button type="button" onClick={() => setLegacy((value) => !value)} className="mt-4 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{legacy ? "E-posta ile girişe dön" : "Eski kullanıcı adıyla açılmış hesabım var"}</button>}
              <div className="mt-6 border-t pt-5 text-center"><span className="text-sm text-muted-foreground">{mode === "login" ? "İlk kez mi kullanıyorsun?" : "Zaten hesabın var mı?"}</span><button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setLegacy(false); setResetMode(false); setPassword(""); }} className="ml-1.5 text-sm font-semibold text-primary hover:underline">{mode === "login" ? "Hesap oluştur" : "Giriş yap"}</button></div>
              <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">Şifreni bu uygulama dışında kimseyle paylaşma. Google ve Apple girişi sağlayıcıların güvenli doğrulama ekranlarında gerçekleşir.</p>
              <nav aria-label="Yasal bilgiler" className="mt-5 flex justify-center gap-4 border-t pt-4 text-xs text-muted-foreground">
                <Link to="/gizlilik" className="underline-offset-4 hover:text-foreground hover:underline">Gizlilik ve KVKK</Link>
                <Link to="/kullanim-sartlari" className="underline-offset-4 hover:text-foreground hover:underline">Kullanım şartları</Link>
              </nav>
            </>}
          </>
        )}
      </section>
    </main>
  );
}
