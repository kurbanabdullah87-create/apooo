import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, BarChart3, Check, HardHat, Loader2, LockKeyhole, Mail, ShieldCheck, UsersRound, Eye, EyeOff, CalendarDays, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InstallButton } from "@/components/app/InstallButton";
import { supabase } from "@/integrations/supabase/client";
import { getRememberMe, setRememberMe } from "@/integrations/supabase/rememberedAuthStorage";
import { normalizeUsername, USERNAME_RE, usernameToEmail } from "@/lib/username";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Giriş — İşvera" },
      { name: "description", content: "İşvera hesabına güvenli şekilde giriş yap." },
      { name: "robots", content: "noindex,nofollow" },
      { property: "og:title", content: "Giriş — İşvera" },
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
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(getRememberMe);
  const [busy, setBusy] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  useEffect(() => {
    // OAuth can return through browser back/forward cache or an external auth
    // app. Restore the form's interactive state whenever this page is visible.
    const restoreForm = () => setBusy(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible") restoreForm();
    };
    window.addEventListener("pageshow", restoreForm);
    window.addEventListener("focus", restoreForm);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", restoreForm);
      window.removeEventListener("focus", restoreForm);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (resetMode) {
      if (!/^\S+@\S+\.\S+$/.test(address)) { toast.error("E-posta adresini kontrol et."); return; }
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
      if (!/^\S+@\S+\.\S+$/.test(address)) { toast.error("Geçerli bir e-posta adresi girin."); return; }
      if (firstName.trim().length < 2 || lastName.trim().length < 2) { toast.error("Ad ve soyad alanlarını doldurun."); return; }
      if (password.length < 12) { toast.error("Şifren en az 12 karakter olmalı."); return; }
    } else if (legacy) {
      const username = normalizeUsername(address);
      if (!USERNAME_RE.test(username)) { toast.error("Geçerli kullanıcı adını girin."); return; }
      if (!password) { toast.error("Şifreni girin."); return; }
    } else {
      if (!/^\S+@\S+\.\S+$/.test(address)) { toast.error("Geçerli bir e-posta adresi girin."); return; }
      if (!password) { toast.error("Şifreni girin."); return; }
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
      // Fallback for browsers that block the redirect without firing focus or
      // visibility events. The timeout naturally disappears on full navigation.
      window.setTimeout(() => setBusy(false), 15_000);
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
    <main className="auth-shell relative isolate min-h-dvh overflow-hidden bg-background text-foreground selection:bg-primary/30">
      <div aria-hidden="true" className="auth-orbit pointer-events-none absolute -left-48 -top-56 size-[38rem] rounded-full" />
      <div aria-hidden="true" className="auth-orbit auth-orbit-secondary pointer-events-none absolute -bottom-72 right-[-8rem] size-[42rem] rounded-full" />
      <div className="relative mx-auto grid min-h-dvh w-full max-w-[1480px] lg:grid-cols-[minmax(0,1.08fr)_minmax(430px,0.92fr)]">
        <aside className="relative hidden flex-col justify-between overflow-hidden px-12 py-10 lg:flex xl:px-20 xl:py-12">
          <div aria-hidden="true" className="absolute inset-8 rounded-[3rem] border border-white/[0.055]" />
          <div className="relative flex items-center gap-3">
            <img src="/brand-mark.svg" alt="İşvera iş yönetimi logosu" className="size-12 rounded-2xl shadow-lg shadow-primary/20" />
            <div><p className="text-xl font-bold tracking-tight">İşvera</p><p className="text-xs text-muted-foreground">İş · ekip · finans yönetimi</p></div>
          </div>
          <div className="relative max-w-xl py-12">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.08] px-3.5 py-2 text-xs font-semibold text-primary"><span className="size-1.5 rounded-full bg-primary"/>SAHA · OPERASYON VE FİNANS</div>
            <h2 className="font-display text-5xl font-semibold leading-[1.08] tracking-[-0.045em] xl:text-[4.25rem]">İşin sahada.<br/><span className="text-primary">Düzenin yanında.</span></h2>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-300">İşlerini, müşterilerini ve günlük finansını tek bir sakin çalışma alanında yönet. Günün yoğunluğunda aradığın bilgi hep elinin altında olsun.</p>
            <div className="mt-9 grid max-w-lg grid-cols-2 gap-3">
              <div className="auth-feature-card rounded-2xl border border-white/[0.09] p-4"><div className="flex size-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary"><UsersRound className="size-4.5"/></div><p className="mt-4 text-sm font-semibold">Müşteri ve işler</p><p className="mt-1 text-xs leading-5 text-slate-400">Cari hareketler, iş geçmişi ve saha takibi</p></div>
              <div className="auth-feature-card rounded-2xl border border-white/[0.09] p-4"><div className="flex size-10 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-300/10 text-amber-200"><BarChart3 className="size-4.5"/></div><p className="mt-4 text-sm font-semibold">Finans ve raporlar</p><p className="mt-1 text-xs leading-5 text-slate-400">Tahsilat, gider, yevmiye ve dönem özeti</p></div>
            </div>
            <div className="mt-5 flex max-w-lg items-center gap-3 rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3"><div className="flex -space-x-2"><span className="flex size-8 items-center justify-center rounded-full border-2 border-[#101419] bg-primary/15 text-primary"><CalendarDays className="size-3.5"/></span><span className="flex size-8 items-center justify-center rounded-full border-2 border-[#101419] bg-sky-400/15 text-sky-300"><WalletCards className="size-3.5"/></span></div><p className="text-xs leading-5 text-slate-300">Takviminden hesap hareketlerine kadar<br/><strong className="font-semibold text-white">günlük iş akışın tek yerde.</strong></p><span className="ml-auto hidden rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2.5 py-1 text-[10px] font-medium text-emerald-300 xl:inline-flex">Saha için tasarlandı</span></div>
          </div>
          <div className="relative flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-emerald-400"/>Güvenli oturum · Kayıtların hesabına özel</div>
        </aside>

        <div className="flex min-h-dvh items-center justify-center px-3 py-5 sm:px-8 sm:py-8 lg:px-10 xl:px-14">
          <section className="auth-card relative w-full max-w-[470px] overflow-hidden rounded-[1.5rem] border p-4 sm:rounded-[2rem] sm:p-9">
            <div className="relative mb-7 flex flex-col items-start gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between lg:hidden">
            <div className="flex items-center gap-3"><img src="/brand-mark.svg" alt="İşvera iş yönetimi logosu" className="size-11 rounded-2xl"/><div><p className="text-lg font-bold tracking-tight">İşvera</p><p className="text-xs text-muted-foreground">İş · ekip · finans yönetimi</p></div></div>
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-emerald-300"><ShieldCheck className="size-3.5"/>Güvenli oturum</span>
            </div>
            <div className="relative mb-8 hidden items-center justify-end lg:flex"><span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-emerald-300"><ShieldCheck className="size-3.5"/>Güvenli oturum</span></div>

            {confirmationSent ? (
              <div className="space-y-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><Check className="size-6"/></div>
                <h1 className="text-xl font-bold">E-postanı doğrula</h1>
                <p className="text-sm leading-relaxed text-muted-foreground">Hesabı etkinleştirmek için <strong className="break-all text-foreground">{email.trim()}</strong> adresine gönderilen bağlantıyı aç.</p>
                <Button variant="outline" className="w-full" onClick={() => { setConfirmationSent(false); setMode("login"); }}>Giriş ekranına dön</Button>
              </div>
            ) : (
              <>
                <div className="relative mb-7"><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">{resetMode ? "HESAP KURTARMA" : mode === "login" ? "HESABINA GÜVENLE ERİŞ" : "SAHA'YA KATIL"}</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-[2.1rem]">{resetMode ? "Şifreni yenile" : mode === "login" ? "Tekrar hoş geldin" : "Saha'ya katıl"}</h1><p className="mt-2 text-sm leading-6 text-slate-400">{resetMode ? "Kayıtlı e-posta adresine güvenli bir bağlantı göndereceğiz." : mode === "login" ? "Hesabına giriş yap, işlerine kaldığın yerden devam et." : "Hesabını oluştur, işlerini tek yerden yönet."}</p></div>

                {!resetMode && <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <Button type="button" variant="outline" className="h-12 w-full min-w-0 rounded-xl border-white/10 bg-white/[0.045] text-[13px] leading-tight transition hover:border-white/20 hover:bg-white/[0.08] sm:text-sm" onClick={() => void continueWith("google")} disabled={busy}><GoogleMark/><span>Google ile devam et</span></Button>
                  <Button type="button" variant="outline" className="h-12 w-full min-w-0 rounded-xl border-white/10 bg-white/[0.045] text-[13px] leading-tight transition hover:border-white/20 hover:bg-white/[0.08] sm:text-sm" onClick={() => void continueWith("apple")} disabled={busy}><AppleMark/><span>Apple ile devam et</span></Button>
                </div>}
                {!resetMode && <div className="my-6 flex items-center gap-3"><span className="h-px flex-1 bg-white/10"/><span className="text-[11px] font-medium text-muted-foreground">veya e-posta ile</span><span className="h-px flex-1 bg-white/10"/></div>}

                <form onSubmit={(event) => void submit(event)} className="space-y-4">
                  {!resetMode && mode === "signup" && <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label htmlFor="first-name">Ad</Label><Input id="first-name" autoComplete="given-name" maxLength={80} value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="h-12 rounded-xl border-white/10 bg-black/20 focus-visible:ring-primary/40"/></div>
                    <div className="space-y-2"><Label htmlFor="last-name">Soyad</Label><Input id="last-name" autoComplete="family-name" maxLength={80} value={lastName} onChange={(e) => setLastName(e.target.value)} required className="h-12 rounded-xl border-white/10 bg-black/20 focus-visible:ring-primary/40"/></div>
                  </div>}
                  <div className="space-y-2"><Label htmlFor="email">{legacy && mode === "login" && !resetMode ? "Eski kullanıcı adı" : "E-posta adresi"}</Label><div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input id="email" type={mode === "signup" || resetMode ? "email" : "text"} inputMode={legacy && !resetMode ? "text" : "email"} autoCapitalize="none" autoComplete={mode === "login" ? "username" : "email"} placeholder={legacy && mode === "login" && !resetMode ? "eski kullanıcı adın" : "adiniz@gmail.com"} maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12 rounded-xl border-white/10 bg-black/20 pl-11 focus-visible:ring-primary/40"/></div></div>
                  {!resetMode && <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="password">Şifre</Label>{mode === "signup" && <span className="text-[11px] text-muted-foreground">En az 12 karakter</span>}</div><div className="relative"><LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input id="password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 12 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12 rounded-xl border-white/10 bg-black/20 pl-11 pr-11 focus-visible:ring-primary/40"/><button type="button" aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/[0.07] hover:text-foreground">{showPassword ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}</button></div></div>}
                  {!resetMode && mode === "login" && !legacy && <button type="button" onClick={() => setResetMode(true)} className="-mt-1 text-left text-xs font-medium text-primary hover:underline">Şifremi unuttum</button>}
                  {!resetMode && <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors ${remember ? "border-primary/30 bg-primary/[0.07]" : "border-white/10 bg-white/[0.025] hover:bg-white/[0.045]"}`}><input type="checkbox" className="size-4 shrink-0 accent-primary" checked={remember} onChange={(e) => setRemember(e.target.checked)}/><span className="min-w-0 flex-1 font-medium">Beni hatırla</span><span className="shrink-0 text-[11px] text-muted-foreground">{remember ? "Bu cihazda açık kal" : "Bu oturumda açık kal"}</span></label>}
                  <Button type="submit" className="h-12 w-full rounded-xl bg-gradient-to-r from-primary to-emerald-400 text-base font-semibold text-slate-950 shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:brightness-105" disabled={busy}>{busy ? <Loader2 className="animate-spin"/> : <>{resetMode ? "Yenileme bağlantısı gönder" : mode === "login" ? "Giriş yap" : "Hesap oluştur"}<ArrowRight/></>}</Button>
                </form>
                {!resetMode && <div className="mt-4"><InstallButton/></div>}

                {resetMode ? <button type="button" onClick={() => setResetMode(false)} className="mt-4 w-full text-center text-sm font-medium text-primary hover:underline">Giriş ekranına dön</button> : <>
                  {mode === "login" && <button type="button" onClick={() => setLegacy((value) => !value)} className="mt-4 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{legacy ? "E-posta ile girişe dön" : "Eski kullanıcı adıyla açılmış hesabım var"}</button>}
                  <div className="mt-7 border-t border-white/[0.08] pt-5 text-center"><span className="text-sm text-muted-foreground">{mode === "login" ? "İlk kez mi kullanıyorsun?" : "Zaten hesabın var mı?"}</span><button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setLegacy(false); setResetMode(false); setPassword(""); }} className="ml-1.5 text-sm font-semibold text-primary hover:underline">{mode === "login" ? "Hesap oluştur" : "Giriş yap"}</button></div>
                  <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">Şifreni bu uygulama dışında kimseyle paylaşma. Google ve Apple girişi kendi sağlayıcı ekranlarında gerçekleşir.</p>
                  <nav aria-label="Yasal bilgiler" className="mt-5 flex justify-center gap-4 border-t border-white/[0.08] pt-4 text-xs text-muted-foreground">
                    <Link to="/gizlilik" className="underline-offset-4 hover:text-foreground hover:underline">Gizlilik ve KVKK</Link>
                    <Link to="/kullanim-sartlari" className="underline-offset-4 hover:text-foreground hover:underline">Kullanım şartları</Link>
                  </nav>
                </>}
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
