import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { LayoutDashboard, Users, Receipt, Settings, Plus, Search, Loader2, ArrowDown, HardHat, CalendarDays, Wrench, CalendarClock, Cloud, CloudUpload, Landmark, Coins, HandCoins } from "lucide-react";
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
import { VoiceCommandButton } from "@/components/app/VoiceCommandButton";
import { useRecords } from "@/lib/work";
import { useCustomers } from "@/lib/data";
import { toast } from "sonner";

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
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [queuedWrites, setQueuedWrites] = useState(0);
  const [searchSeed, setSearchSeed] = useState("");
  const [showOpenJobs, setShowOpenJobs] = useState(false);
  const startY = useRef<number | null>(null);
  const jobs = useRecords("job");
  const customers = useCustomers();
  const openToday = (jobs.data ?? []).filter((job) => job.payload.date === new Date().toLocaleDateString("sv-SE") && job.payload.status !== "Tamamlandı" && job.payload.status !== "İptal");
  const activeJob = (jobs.data ?? []).filter((job) => Boolean(job.payload.started_at) && job.payload.status !== "Tamamlandı").sort((a, b) => String(b.payload.started_at).localeCompare(String(a.payload.started_at)))[0];

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

  async function refresh() {
    setRefreshing(true);
    haptic();
    await qc.invalidateQueries();
    setRefreshing(false);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/90 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur">
        <div className="flex items-center gap-2"><Button variant="secondary"
          onClick={() => setSearchOpen(true)}
          className="flex h-11 min-w-0 flex-1 justify-start gap-3 px-3 text-sm text-muted-foreground"
        >
          <Search className="size-4" /><span className="truncate">Saha · Ara</span>
        </Button>{isUsta&&<VoiceCommandButton onSearch={(query) => { setSearchSeed(query); setSearchOpen(true); }}/>}{isUsta&&<NotificationCenter/>}{isUsta&&<Button asChild variant="ghost" size="icon" title="Randevular"><Link to="/randevu"><CalendarClock/></Link></Button>}{isUsta&&<Button asChild variant="ghost" size="icon" title="Hava Durumu"><Link to="/hava"><Cloud/></Link></Button>}{isUsta&&<Button asChild variant="ghost" size="icon" title="Borç ve alacak"><Link to="/borc"><HandCoins/></Link></Button>}<Button asChild variant="ghost" size="icon" title="Hesap hareketleri"><Link to="/banka"><Landmark/></Link></Button>{isUsta&&<Button asChild variant="ghost" size="icon" title="Giderler"><Link to="/giderler"><Receipt/></Link></Button>}<Button asChild variant="ghost" size="icon" title="Ayarlar"><Link to="/ayarlar"><Settings/></Link></Button></div>
        {queuedWrites > 0 && <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-warning" role="status"><CloudUpload className="size-3.5"/>{queuedWrites} çevrimdışı kayıt senkronizasyon bekliyor</div>}
      </header>

      <main
        className="flex-1 px-4 pb-32 pt-4"
        onTouchStart={(e) => {
          startY.current = window.scrollY <= 0 ? e.touches[0]?.clientY ?? null : null;
        }}
        onTouchMove={(e) => {
          if (startY.current === null) return;
          const touch = e.touches[0];
          if (!touch) return;
          const d = touch.clientY - startY.current;
          setPull(d > 0 ? Math.min(d / 2, 80) : 0);
        }}
        onTouchEnd={() => {
          if (pull >= 60) void refresh();
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

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur">
        <div className={`mx-auto grid max-w-md ${isUsta ? "grid-cols-13" : "grid-cols-2"}`}>
          {NAV.filter(n => isUsta || ["/isler", "/yevmiye"].includes(n.to)).map((n, index) => {
            const active = path.startsWith(n.to);
            return <div key={n.to} className="contents">
              {isUsta && index === 3 && <button type="button" aria-label="Hızlı işlem ekle" onClick={() => { haptic(); setAddOpen(true); }} className="-mt-4 flex flex-col items-center justify-start gap-1 py-1 text-[10px] font-semibold text-primary"><span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition active:scale-95"><Plus className="size-6"/></span>Ekle</button>}
              <Link
                to={n.to}
                onClick={() => haptic(8)}
                className={cn("relative flex min-w-0 flex-col items-center gap-1 py-3 text-[10px] font-medium sm:text-[11px]", isUsta && "col-span-2", active ? "text-primary" : "text-muted-foreground")}
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
