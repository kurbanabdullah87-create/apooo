import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { LayoutDashboard, Users, Receipt, Settings, Plus, Search, Loader2, ArrowDown, HardHat, CalendarDays, Wrench, CalendarClock, Cloud, CloudUpload, Landmark, Coins, HandCoins, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeviceLock } from "./DeviceLock";
import { useEffect } from "react";
import { flushQueue, pendingCount } from "@/lib/offline";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { useMe } from "@/hooks/use-me";
import { GlobalSearch } from "./GlobalSearch";
import { QuickAdd } from "./QuickAdd";
import { useAppointmentReminders, useDebtReminders } from "@/lib/reminders";
import { NotificationCenter } from "@/components/app/NotificationCenter";
import { supabase } from "@/integrations/supabase/client";
import { VoiceCommandButton } from "@/components/app/VoiceCommandButton";
import { useRecords } from "@/lib/work";
import { useCustomers } from "@/lib/data";
import { toast } from "sonner";
import { useBusinessProfile } from "@/lib/work-profile-context";

const NAV = [
  { to: "/panel", label: "Panel", icon: LayoutDashboard },
  { to: "/isler", label: "İşler", icon: HardHat },
  { to: "/cari", label: "Cari", icon: Users },
  { to: "/yevmiye", label: "Yevmiye", icon: CalendarDays },
  { to: "/ekipman", label: "Ekipman", icon: Wrench },
  { to: "/doviz", label: "Döviz", icon: Coins },
] as const;

export function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const me = useMe();
  const businessProfile = useBusinessProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [queuedWrites, setQueuedWrites] = useState(0);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [searchSeed, setSearchSeed] = useState("");
  const [showOpenJobs, setShowOpenJobs] = useState(false);
  const startY = useRef<number | null>(null);
  const edgeStartX = useRef<number | null>(null);
  const jobs = useRecords("job");
  const customers = useCustomers();
  const openToday = (jobs.data ?? []).filter((job) => job.payload.date === new Date().toLocaleDateString("sv-SE") && job.payload.status !== "Tamamlandı" && job.payload.status !== "İptal");
  const activeJob = (jobs.data ?? []).filter((job) => Boolean(job.payload.started_at) && job.payload.status !== "Tamamlandı").sort((a, b) => String(b.payload.started_at).localeCompare(String(a.payload.started_at)))[0];
  const activeJobId = activeJob?.id;
  const activeJobStartedAt = String(activeJob?.payload.started_at ?? "");

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    document.body.dataset.route = path.replace(/^\//, "") || "panel";
    try { document.documentElement.dataset.theme = localStorage.getItem("saha-theme") ?? "ocean"; } catch { /* use default theme */ }
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) themeColor.content = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#4fd1b5";
  }, [path]);
  useEffect(() => {
    if (!activeJobStartedAt) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeJobId, activeJobStartedAt]);

  const isUsta = me.data?.isUsta ?? false;
  useAppointmentReminders(isUsta, () => void navigate({ to: "/randevu" }));
  useDebtReminders(isUsta, () => void navigate({ to: "/borc" }));
  useEffect(() => {
    const sync = () => void flushQueue();
    const refresh = () => void qc.invalidateQueries();
    window.addEventListener("online", sync);
    window.addEventListener("saha-synced", refresh);
    if (me.data?.id) sync();
    return () => { window.removeEventListener("online", sync); window.removeEventListener("saha-synced", refresh); };
  }, [me.data?.id, qc]);
  useEffect(() => {
    let active = true;
    const update = () => void pendingCount().then((n) => { if (active) setQueuedWrites(n); }).catch(() => {});
    update();
    window.addEventListener("saha-queue", update);
    window.addEventListener("saha-synced", update);
    window.addEventListener("online", update);
    return () => { active = false; window.removeEventListener("saha-queue", update); window.removeEventListener("saha-synced", update); window.removeEventListener("online", update); };
  }, [me.data?.id]);

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const to = (event as CustomEvent<unknown>).detail;
      if (typeof to === "string" && to.startsWith("/")) void navigate({ to } as never);
    };
    const onPanel = () => void navigate({ to: "/panel" });
    const onSearch = (event: Event) => { setSearchSeed(String((event as CustomEvent<string>).detail ?? "")); setSearchOpen(true); };
    const onJob = () => { void navigate({ to: "/isler" }).then(() => window.setTimeout(() => window.dispatchEvent(new Event("saha-open-job-form")), 0)); };
    const onKeys = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLocaleLowerCase("en-US");
      if (key === "k") { event.preventDefault(); setSearchOpen(true); }
      else if (key === "n") { event.preventDefault(); onJob(); }
      else if (key === "/") { event.preventDefault(); toast.info("Kısayollar: Ctrl+N yeni iş · Ctrl+K ara · Ctrl+/ yardım"); }
    };
    window.addEventListener("saha-navigate", onNavigate);
    window.addEventListener("saha-open-panel", onPanel);
    window.addEventListener("saha-open-search", onSearch);
    window.addEventListener("saha-request-job-form", onJob);
    window.addEventListener("keydown", onKeys);
    return () => { window.removeEventListener("saha-navigate", onNavigate); window.removeEventListener("saha-open-panel", onPanel); window.removeEventListener("saha-open-search", onSearch); window.removeEventListener("saha-request-job-form", onJob); window.removeEventListener("keydown", onKeys); };
  }, [navigate]);

  useEffect(() => {
    if (!isUsta || openToday.length === 0) return;
    setShowOpenJobs(true);
    const timer = window.setTimeout(() => setShowOpenJobs(false), 3000);
    return () => window.clearTimeout(timer);
  }, [isUsta, me.data?.id, openToday.length]);

  useEffect(() => {
    const pageName: Record<string, string> = { "/panel": "Panel", "/isler": "İşler", "/cari": "Cari", "/yevmiye": "Yevmiye", "/ekipman": "Ekipman", "/doviz": "Döviz", "/randevu": "Randevular", "/banka": "Banka" };
    const base = `${pageName[path] ?? "Saha"} — Saha`;
    if (!activeJob) { document.title = base; return; }
    const tick = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(String(activeJob.payload.started_at))) / 1000));
      const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
      const customerName = customers.data?.find((customer) => customer.id === activeJob.payload.customer_id)?.name;
      document.title = `▶ ${time} · ${customerName || String(activeJob.payload.title ?? "Aktif iş")}`;
    };
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [path, activeJob, customers.data]);

  useEffect(() => {
    const pathKey = `saha-usage:${me.data?.id ?? "guest"}`;
    let previousPath = path; let enteredAt = Date.now();
    const recordTime = () => {
      const elapsed = Math.max(0, Math.min(4 * 60 * 60_000, Date.now() - enteredAt));
      try {
        const usage = JSON.parse(localStorage.getItem(pathKey) ?? "{}") as Record<string, number>;
        usage[previousPath] = (Number(usage[previousPath]) || 0) + elapsed;
        localStorage.setItem(pathKey, JSON.stringify(usage));
      } catch { /* local-only usage analytics are optional */ }
      previousPath = path; enteredAt = Date.now();
    };
    recordTime();
    return () => {
      const elapsed = Math.max(0, Math.min(4 * 60 * 60_000, Date.now() - enteredAt));
      try { const usage = JSON.parse(localStorage.getItem(pathKey) ?? "{}") as Record<string, number>; usage[path] = (Number(usage[path]) || 0) + elapsed; localStorage.setItem(pathKey, JSON.stringify(usage)); } catch { /* optional */ }
    };
  }, [path, me.data?.id]);

  useEffect(() => {
    try {
      document.documentElement.dataset.textScale = localStorage.getItem("saha-text-scale") ?? "normal";
      document.documentElement.dataset.colorblind = localStorage.getItem("saha-colorblind") === "true" ? "true" : "false";
    } catch { /* accessibility preferences can fall back to browser defaults */ }
  }, []);

  useEffect(() => {
    const userId = me.data?.id;
    if (!userId) return;
    const key = `saha:last-activity:${userId}`;
    const maxIdle = 8 * 60 * 60_000;
    let ending = false;
    const touch = () => {
      if (ending) return;
      let last = 0;
      try { last = Number(localStorage.getItem(key) ?? 0); } catch { last = 0; }
      if (last && Date.now() - last >= maxIdle) {
        ending = true;
        void supabase.auth.signOut({ scope: "local" }).finally(() => toast.info("Güvenlik için oturum kapatıldı. Yeniden giriş yapın."));
        return;
      }
      try { localStorage.setItem(key, String(Date.now())); } catch { /* session expiry check remains active in memory */ }
    };
    const timer = window.setInterval(touch, 60_000);
    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    for (const event of events) window.addEventListener(event, touch, { passive: true });
    touch();
    return () => { window.clearInterval(timer); for (const event of events) window.removeEventListener(event, touch); };
  }, [me.data?.id]);

  async function refresh() {
    setRefreshing(true);
    haptic();
    await qc.invalidateQueries();
    setRefreshing(false);
  }

  return (
    <div className="relative min-h-dvh w-full lg:pl-72">
      <aside className="glass-sidebar fixed inset-y-4 left-4 z-40 hidden w-60 flex-col rounded-[1.8rem] p-3 lg:flex" aria-label="Ana gezinme">
        <Link to="/panel" className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-white/[0.06]">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-lg font-black text-primary-foreground shadow-lg shadow-primary/20">S</span>
          <span className="min-w-0"><span className="block text-base font-bold tracking-tight">Saha</span><span className="block text-[11px] text-muted-foreground">Operasyon merkezi</span></span>
        </Link>
        <div className="mx-3 my-3 h-px bg-white/10" />
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/75">Çalışma alanı</p>
        <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Sayfalar">
          {NAV.filter((item) => isUsta || ["/isler", "/yevmiye"].includes(item.to)).map((item) => {
            const active = path.startsWith(item.to);
            return <Link key={item.to} to={item.to} onClick={() => haptic(8)} aria-current={active ? "page" : undefined} className={cn("glass-nav-item group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition duration-200", active ? "is-active text-primary" : "text-muted-foreground hover:translate-x-0.5 hover:bg-white/[0.06] hover:text-foreground")}>
              <item.icon className="size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className="flex-1">{item.label}</span>
              {item.to === "/isler" && openToday.length > 0 && <span className="min-w-5 rounded-full bg-primary/15 px-1.5 text-center text-[10px] font-bold leading-5 text-primary">{openToday.length}</span>}
            </Link>;
          })}
          <div className="mx-3 my-3 h-px bg-white/10" />
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/75">Araçlar</p>
          {[
            { to: "/randevu", label: "Randevular", icon: CalendarClock },
            { to: "/rapor", label: "Aylık rapor", icon: LayoutDashboard },
            { to: "/hesaplayici", label: "Maliyet hesaplayıcı", icon: Coins },
            { to: "/banka", label: "Hesap hareketleri", icon: Landmark },
            { to: "/giderler", label: "Giderler", icon: Receipt },
            { to: "/hava", label: "Hava durumu", icon: Cloud },
            { to: "/ayarlar", label: "Ayarlar", icon: Settings },
          ].filter((item) => isUsta || item.to === "/ayarlar").map((item) => {
            const active = path.startsWith(item.to);
            return <Link key={item.to} to={item.to} onClick={() => haptic(8)} aria-current={active ? "page" : undefined} className={cn("glass-nav-item group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition duration-200", active ? "is-active text-primary" : "text-muted-foreground hover:translate-x-0.5 hover:bg-white/[0.06] hover:text-foreground")}><item.icon className="size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110"/><span>{item.label}</span></Link>;
          })}
        </nav>
        {isUsta && <Button onClick={() => { haptic(); setAddOpen(true); }} className="mt-3 h-12 w-full rounded-2xl shadow-lg shadow-primary/15"><Plus/>Hızlı işlem ekle</Button>}
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-black/10 p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{me.data?.profile?.display_name?.slice(0, 1) || "U"}</span>
          <span className="min-w-0"><span className="block truncate text-xs font-semibold">{me.data?.profile?.display_name || "Usta hesabı"}</span><span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.65)]"/>Çalışma alanı hazır</span></span>
        </div>
      </aside>

      <header className="glass-topbar sticky top-0 z-30 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] lg:mx-auto lg:max-w-[1440px] lg:px-10 lg:pt-6">
        <div className={cn("flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-1.5 backdrop-blur-xl transition-colors duration-500 lg:rounded-[1.4rem] lg:bg-white/[0.045] lg:p-2", !isOnline && "border-destructive/30 bg-destructive/10", activeJob && "border-primary/25 bg-primary/[0.06]")}><Link to="/panel" className="mr-1 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 font-bold text-primary lg:hidden" aria-label="Panele dön">S</Link><Button variant="ghost"
          onClick={() => setSearchOpen(true)}
          className="flex h-10 min-w-0 flex-1 justify-start gap-3 rounded-xl px-3 text-sm text-muted-foreground hover:bg-white/[0.06]"
        >
          <Search className="size-4" /><span className="truncate">Ara: müşteri, iş, tutar…</span><kbd className="ml-auto hidden rounded-md border border-white/10 bg-black/10 px-1.5 py-0.5 text-[10px] font-medium lg:inline-block">Ctrl K</kbd>
        </Button>{activeJob && <span className="hidden items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary sm:inline-flex" role="status"><span className="size-1.5 animate-pulse rounded-full bg-primary"/> {(() => { const seconds = Math.max(0, Math.floor((clockNow - Date.parse(String(activeJob.payload.started_at))) / 1000)); return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; })()}</span>}{isUsta&&<VoiceCommandButton onSearch={(query) => { setSearchSeed(query); setSearchOpen(true); }}/>}{isUsta&&<NotificationCenter/>}{isUsta&&<Button asChild variant="ghost" size="icon" title="Randevular" className="rounded-xl hover:bg-white/[0.07]"><Link to="/randevu"><CalendarClock/></Link></Button>}{isUsta&&<Button asChild variant="ghost" size="icon" title="Hava Durumu" className="rounded-xl hover:bg-white/[0.07]"><Link to="/hava"><Cloud/></Link></Button>}{isUsta&&<Button asChild variant="ghost" size="icon" title="Borç ve alacak" className="rounded-xl hover:bg-white/[0.07]"><Link to="/borc"><HandCoins/></Link></Button>}<Button asChild variant="ghost" size="icon" title="Hesap hareketleri" className="rounded-xl hover:bg-white/[0.07]"><Link to="/banka"><Landmark/></Link></Button>{isUsta&&<Button asChild variant="ghost" size="icon" title="Giderler" className="rounded-xl hover:bg-white/[0.07]"><Link to="/giderler"><Receipt/></Link></Button>}<Button asChild variant="ghost" size="icon" title="Ayarlar" className="rounded-xl hover:bg-white/[0.07]"><Link to="/ayarlar"><Settings/></Link></Button></div>
        {isUsta && businessProfile.profileError && <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100" role="status"><Building2 className="size-4 shrink-0"/><span className="min-w-0 flex-1">{businessProfile.profileError}</span>{businessProfile.profiles.length === 0 && <Button asChild size="sm" variant="secondary"><Link to="/ayarlar">Ayarları aç</Link></Button>}<Button type="button" size="sm" variant="ghost" onClick={() => void businessProfile.refreshProfiles()}>Yenile</Button></div>}
        {isUsta && businessProfile.isUsta && businessProfile.activeProfile && <div className="mt-2 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.045] px-3 py-2"><Building2 className="size-4 shrink-0 text-primary"/><label htmlFor="active-business-profile" className="sr-only">Etkin usta profili</label><select id="active-business-profile" value={businessProfile.activeProfileId ?? ""} onChange={(event) => businessProfile.switchProfile(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-foreground outline-none" aria-label="Etkin usta profili">{businessProfile.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.is_default ? " · Varsayılan" : ""}{profile.is_archived ? " · Arşivli (yalnızca geçmiş)" : ""}</option>)}</select><span className="hidden text-[10px] text-muted-foreground sm:inline">Kayıt ve rapor kapsamı</span></div>}
        {(!isOnline || queuedWrites > 0) && <div className={cn("mt-2 flex items-center gap-1.5 text-xs font-semibold", isOnline ? "text-warning" : "text-destructive")} role="status"><span className={cn("size-2 rounded-full", isOnline ? "bg-warning" : "animate-pulse bg-destructive")}/>{!isOnline ? "Çevrimdışı" : "Senkronizasyon bekliyor"}{queuedWrites > 0 && <> · <CloudUpload className="size-3.5"/>{queuedWrites} kayıt</>}</div>}
      </header>

      <main
        className="mx-auto w-full max-w-2xl px-4 pb-32 pt-4 sm:max-w-4xl lg:max-w-[1440px] lg:px-10 lg:pb-12 lg:pt-5"
        onTouchStart={(e) => {
          startY.current = window.scrollY <= 0 ? e.touches[0]?.clientY ?? null : null;
          const x = e.touches[0]?.clientX;
          edgeStartX.current = x !== undefined && x < 24 ? x : null;
        }}
        onTouchMove={(e) => {
          if (startY.current === null) return;
          const touch = e.touches[0];
          if (!touch) return;
          const d = touch.clientY - startY.current;
          setPull(d > 0 ? Math.min(d / 2, 80) : 0);
        }}
        onTouchEnd={(e) => {
          if (pull >= 60) void refresh();
          const touch = e.changedTouches[0];
          if (edgeStartX.current !== null && touch && touch.clientX - edgeStartX.current > Math.max(60, window.innerWidth * 0.22) && path !== "/panel" && window.history.length > 1) { haptic(12); window.history.back(); }
          edgeStartX.current = null;
          setPull(0);
          startY.current = null;
        }}
      >
        {showOpenJobs && openToday.length > 0 && <button type="button" onClick={() => { setShowOpenJobs(false); void navigate({ to: "/isler" }); }} className="mb-3 w-full rounded-xl border border-primary/30 bg-primary/10 p-3 text-left text-sm font-medium text-primary" role="status">Bugün {openToday.length} açık işiniz var · görmek için dokunun</button>}
        {(pull > 0 || refreshing) && (
          <div className="flex justify-center text-muted-foreground" style={{ height: refreshing ? 40 : pull }}>
            {refreshing ? <Loader2 className="mt-2 size-5 animate-spin" /> : <ArrowDown className={cn("mt-2 size-5 transition", pull >= 60 && "rotate-180 text-primary")} />}
          </div>
        )}
        {me.isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !isUsta && !["/ayarlar", "/isler", "/yevmiye", "/banka"].includes(path) ? (
          <div className="rounded-2xl border bg-card p-6 text-center">
            <h2 className="text-lg font-semibold">Çırak hesabı</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Finansal veriler yalnızca Usta tarafından görülebilir.
            </p>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      <nav className="glass-dock safe-bottom fixed inset-x-3 bottom-3 z-30 rounded-[1.4rem] p-1.5 lg:hidden">
        <div className={`mx-auto grid max-w-md ${isUsta ? "grid-cols-13" : "grid-cols-2"}`}>
          {NAV.filter(n => isUsta || ["/isler", "/yevmiye"].includes(n.to)).map((n, index) => {
            const active = path.startsWith(n.to);
            return <div key={n.to} className="contents">
              {isUsta && index === 3 && <button type="button" aria-label="Hızlı işlem ekle" onClick={() => { haptic(); setAddOpen(true); }} className="-mt-4 flex flex-col items-center justify-start gap-1 py-1 text-[10px] font-semibold text-primary"><span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition active:scale-95"><Plus className="size-6"/></span>Ekle</button>}
              <Link
                to={n.to}
                onClick={() => haptic(8)}
                aria-current={active ? "page" : undefined}
                className={cn("glass-dock-item relative flex min-w-0 flex-col items-center gap-1 rounded-xl py-2.5 text-[10px] font-medium transition duration-200 sm:text-[11px]", isUsta && "col-span-2", active ? "is-active text-primary" : "text-muted-foreground hover:bg-white/[0.06]")}
              >
                <n.icon className="size-5" />
                {n.label}
                {n.to === "/isler" && openToday.length > 0 && <span className="absolute right-1/4 top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] leading-4 text-primary-foreground" aria-label={`${openToday.length} açık iş`}>{openToday.length}</span>}
              </Link>
            </div>;
          })}
        </div>
      </nav>

      {isUsta && <GlobalSearch open={searchOpen} initialQuery={searchSeed} onOpenChange={(open) => { setSearchOpen(open); if (!open) setSearchSeed(""); }} onPick={(id) => navigate({ to: "/cari/$id", params: { id } })} />}
      {isUsta && <QuickAdd open={addOpen} onOpenChange={setAddOpen} />}
      {me.data && <DeviceLock user={me.data.id} />}
    </div>
  );
}
