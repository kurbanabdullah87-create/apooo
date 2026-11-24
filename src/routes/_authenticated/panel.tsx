import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
import { AlertTriangle, MapPin, MessageCircle, Wallet, HardHat, WalletCards, TrendingUp, TrendingDown, UserPlus, Camera, QrCode, RefreshCw, ArrowUpRight, Clock3, FileText, Info, CalendarDays, Eye, EyeOff, Sparkles, ArrowRight } from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCustomers, useExpenses, useTransactions } from "@/lib/data";
import { customerRestriction, EXPENSE_LABELS, formatTL, monthKey, monthSummary, overdueAmount, todayISO, type ExpenseCategory } from "@/lib/finance";
import { pageHead, useSaveRecord } from "@/lib/work";
import { MaintenanceAlerts } from "@/components/app/MaintenanceAlerts";
import { getPosition, coordsOf, distanceMeters } from "@/lib/geo";
import { useMe } from "@/hooks/use-me";
import { toast } from "sonner";
import { openWhatsApp } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getLiveCurrencyRates } from "@/lib/currency.functions";
import { useRecords } from "@/lib/work";
import { CodeScanner } from "@/components/app/CodeScanner";
import { calculatePeriodFinance, periodDateBounds, type FinancePeriod } from "@/lib/finance-period";
import { useBusinessProfile } from "@/lib/work-profile-context";

export const Route = createFileRoute("/_authenticated/panel")({
  head: () => pageHead("Panel", "Aylık gelir, gider ve kâr özeti."),
  component: Panel,
});

type CustomerRow = NonNullable<ReturnType<typeof useCustomers>["data"]>[number];

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function shiftMonth(m: string, d: number) {
  const [y = 2026, mo = 1] = m.split("-").map(Number);
  const dt = new Date(y, mo - 1 + d, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}


function Panel() {
  const [month] = useState(monthKey(todayISO()));
  const [financePeriod, setFinancePeriod] = useState<FinancePeriod>("month");
  const [customFrom, setCustomFrom] = useState(() => `${todayISO().slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(todayISO());
  const txs = useTransactions();
  const exps = useExpenses();
  const customers = useCustomers();
  const jobs = useRecords("job");
  const payrollEntries = useRecords("payroll");
  const payrollPayments = useRecords("payment");
  const payrollAdvances = useRecords("advance");
  const customerRows = customers.data;
  const saveJob = useSaveRecord("job");
  const me = useMe();
  const businessProfile = useBusinessProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [nearby, setNearby] = useState<{ customer: CustomerRow; meters: number } | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    try { setFocusMode(localStorage.getItem("saha.panel.focus.v1") === "1"); }
    catch { /* Focus mode is an optional local preference. */ }
  }, []);
  function toggleFocusMode() {
    setFocusMode((current) => {
      const next = !current;
      try { localStorage.setItem("saha.panel.focus.v1", next ? "1" : "0"); }
      catch { /* Keep the preference for this session if storage is unavailable. */ }
      return next;
    });
  }
  const lastRateSnapshotAttempt = useRef<string | null>(null);
  const cachedRates = readCachedRates();
  const rates = useQuery({ queryKey: ["live-currency-rates"], queryFn: () => getLiveCurrencyRates(), ...(cachedRates ? { initialData: cachedRates.value, initialDataUpdatedAt: cachedRates.savedAt } : {}), staleTime: 5 * 60_000, gcTime: 24 * 60 * 60_000, refetchInterval: (query) => Math.max(60, query.state.data?.updateIntervalSeconds ?? 86_400) * 1000, refetchOnWindowFocus: true, retry: 1 });
  const rateHistory = useQuery({
    queryKey: ["exchange-rate-history", me.data?.id], enabled: Boolean(me.data?.id), staleTime: 30_000,
    queryFn: async () => {
      if (!me.data?.id) return null;
      const { data, error } = await supabase.from("work_records").select("id,created_at,payload").eq("kind", "exchange_rate").eq("owner_id", me.data.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as { id: string; created_at: string; payload: Record<string, unknown> } | null;
    },
  });
  const saveRateSnapshot = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!online) throw new Error("Çevrimdışısınız; canlı kur geçmişi bağlantı gelince yeniden denenir.");
      const { data: auth } = await supabase.auth.getSession();
      const profile = businessProfile.activeProfile;
      if (!auth.session || auth.session.user.id !== me.data?.id) throw new Error("Kur geçmişi için oturumu yenileyin.");
      if (!profile || profile.is_archived) throw new Error("Etkin usta profili yüklenemedi.");
      const { error } = await supabase.rpc("save_exchange_rate_snapshot", {
        _profile_id: profile.id,
        _usd: Number(payload.usd),
        _eur: Number(payload.eur),
        _gbp: Number(payload.gbp),
        _provider_updated_at: String(payload.provider_updated_at),
      });
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["exchange-rate-history", me.data?.id] }); },
    onError: (error) => {
      console.error("Kur geçmişi kaydedilemedi:", error);
      const detail = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Kur geçmişi yazma isteği tamamlanamadı.";
      toast.error("Kur geçmişi kaydedilemedi", { description: detail });
    },
  });
  useEffect(() => {
    if (!rates.data || !me.data?.id || !me.data.isUsta || businessProfile.loading || !businessProfile.activeProfileId || !online || saveRateSnapshot.isPending) return;
    const previous = rateHistory.data;
    const previousAt = Date.parse(String(previous?.payload.snapshot_at ?? previous?.created_at ?? ""));
    const providerStamp = rates.data.lastUpdatedAt;
    if (previous?.payload.provider_updated_at === providerStamp && Date.now() - previousAt < 9 * 60_000) return;
    if (lastRateSnapshotAttempt.current === providerStamp) return;
    const tryPerUsd = Number(rates.data.rates.TRY);
    if (!Number.isFinite(tryPerUsd) || tryPerUsd <= 0) return;
    const payload = {
      base: "TRY", source: "mid-market", provider_updated_at: providerStamp,
      usd: 1 / tryPerUsd,
      eur: Number(rates.data.rates.EUR) / tryPerUsd,
      gbp: Number(rates.data.rates.GBP) / tryPerUsd,
    };
    if ([payload.usd, payload.eur, payload.gbp].every((value) => Number.isFinite(value) && value > 0)) {
      lastRateSnapshotAttempt.current = providerStamp;
      saveRateSnapshot.mutate(payload);
    }
  }, [rates.data, me.data?.id, me.data?.isUsta, businessProfile.loading, businessProfile.activeProfileId, businessProfile.activeProfile, online, rateHistory.data, saveRateSnapshot]);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  useEffect(() => { if (rates.data) { try { localStorage.setItem("saha.market-rates.v1", JSON.stringify({ value: rates.data, savedAt: Date.now() })); } catch { /* optional public market-rate cache */ } } }, [rates.data]);

  const data = useMemo(() => {
    const t = txs.data ?? [];
    const e = exps.data ?? [];
    const byCat = (Object.keys(EXPENSE_LABELS) as ExpenseCategory[])
      .map((c) => ({ name: EXPENSE_LABELS[c], value: e.filter((x) => x.category === c && monthKey(x.occurred_on) === month).reduce((a, x) => a + x.amount, 0) }))
      .filter((x) => x.value > 0);
    const bars = [-5, -4, -3, -2, -1, 0].map((d) => {
      const m = shiftMonth(month, d);
      const ms = monthSummary(t, e, m);
      return { name: new Date(m + "-01T00:00:00").toLocaleDateString("tr-TR", { month: "short" }), Gelir: ms.income, Gider: ms.expense };
    });
    const overdue = (customers.data ?? [])
      .map((c) => {
        const ct = t.filter((x) => x.customer_id === c.id);
        return { c, overdue: overdueAmount(ct, new Date(), c.payment_due_days ?? 15) };
      })
      .filter((x) => x.overdue > 0)
      .sort((a, b) => b.overdue - a.overdue);
    const jobRows = jobs.data ?? [];
    const todayDate = new Date();
    const start = new Date(todayDate); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
    const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const weekJobs = jobRows.filter((j) => { const doneOn = String(j.payload.completed_at ?? j.payload.date ?? "").slice(0, 10); return j.payload.status === "Tamamlandı" && doneOn >= localKey(start) && doneOn <= todayISO(); });
    const weekly = Array.from({ length: 7 }, (_, index) => {
      const d = new Date(start); d.setDate(start.getDate() + index);
      const key = localKey(d);
      return { key, name: d.toLocaleDateString("tr-TR", { weekday: "short" }).replace(".", ""), count: weekJobs.filter((j) => String(j.payload.completed_at ?? j.payload.date ?? "").slice(0, 10) === key).length, today: key === todayISO() };
    });
    const todayJobs = jobRows
      .filter((row) => String(row.payload.date ?? "").slice(0, 10) === todayISO() && row.payload.status !== "İptal")
      .sort((a, b) => String(a.payload.start_time ?? "").localeCompare(String(b.payload.start_time ?? "")))
      .slice(0, 6)
      .map((row) => ({
        id: row.id,
        title: String(row.payload.title ?? "İş kaydı"),
        customer: customers.data?.find((customer) => customer.id === row.payload.customer_id)?.name ?? "Müşteri seçilmemiş",
        status: String(row.payload.status ?? "Planlandı"),
        time: String(row.payload.start_time ?? "").slice(0, 5),
      }));
    const todayJobCount = jobRows.filter((row) => String(row.payload.date ?? "").slice(0, 10) === todayISO() && row.payload.status !== "İptal").length;
    const activity = [
      ...jobRows.map((row) => ({ id: row.id, kind: "job", date: row.created_at, title: String(row.payload.title ?? "İş kaydı"), amount: Number(row.payload.price ?? 0) })),
      ...t.map((row) => ({ id: row.id, kind: row.kind === "payment" ? "payment" : "debt", date: row.occurred_on, title: row.description || (row.kind === "payment" ? "Tahsilat" : "İş / alacak"), amount: Number(row.amount) })),
      ...e.map((row) => ({ id: row.id, kind: "expense", date: row.occurred_on, title: row.description || "Gider", amount: Number(row.amount) })),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    return { byCat, bars, overdue, todayJobs, todayJobCount, weekly, weekCount: weekJobs.length, activity };
  }, [txs.data, exps.data, customers.data, month, jobs.data]);

  const financeBounds = periodDateBounds(financePeriod, customFrom, customTo);
  const periodFinance = useMemo(() => calculatePeriodFinance({
    transactions: txs.data ?? [], expenses: exps.data ?? [],
    payroll: payrollEntries.data ?? [],
    advances: payrollAdvances.data ?? [], payrollPayments: payrollPayments.data ?? [],
    from: financeBounds.from, to: financeBounds.to,
  }), [txs.data, exps.data, payrollEntries.data, payrollPayments.data, payrollAdvances.data, financeBounds.from, financeBounds.to]);

  const today = todayISO();
  useEffect(() => {
    let active = true;
    if (!customerRows?.length) return;
    void getPosition(5000).then((position) => {
      if (!active) return;
      const closest = customerRows.map((customer) => { const coords = coordsOf({ lat: customer.latitude, lng: customer.longitude }); return coords ? { customer, meters: distanceMeters(position, coords) } : null; }).filter((row): row is { customer: CustomerRow; meters: number } => row !== null && row.meters <= 100).sort((a, b) => a.meters - b.meters)[0] ?? null;
      setNearby(closest);
    }).catch(() => setNearby(null));
    return () => { active = false; };
  }, [customerRows]);

  function startNearbyJob(customer: CustomerRow) {
    const related = (txs.data ?? []).filter((tx) => tx.customer_id === customer.id);
    const risk = customerRestriction(customer, related);
    if (risk.blocked) { toast.error("Cari kilidi aktif; önce tahsilat alın."); void navigate({ to: "/cari/$id", params: { id: customer.id } }); return; }
    saveJob.mutate({ owner_id: me.data?.id, payload: { title: "Hızlı saha işi", customer_id: customer.id, address: customer.address ?? "", date: today, status: "Devam Ediyor", seconds: 0, started_at: new Date().toISOString(), no_machine: true, equipment_id: null, vat_rate: 0 } }, { onSuccess: () => void navigate({ to: "/isler" }) });
  }

  function openJobs(mode: "job" | "camera") {
    try { sessionStorage.setItem("saha.openJobForm", mode); } catch { /* navigation still works if storage is disabled */ }
    void navigate({ to: "/isler" });
  }
  function openCustomers() {
    try { sessionStorage.setItem("saha.openCustomerForm", "1"); } catch { /* navigation still works if storage is disabled */ }
    void navigate({ to: "/cari" });
  }

  return (
    <div className={`dashboard-enter mx-auto max-w-7xl space-y-4 pb-6 sm:space-y-6 sm:pb-8 ${focusMode ? "dashboard-focus" : ""}`}>
      <section aria-label="Günlük iş özeti" className="dashboard-welcome relative isolate overflow-hidden rounded-[1.8rem] border border-white/10 px-5 py-5 text-white shadow-[0_25px_70px_-44px_rgba(20,220,190,.6)] sm:px-8 sm:py-7">
        <div className="dashboard-welcome-art" aria-hidden="true">
          <span className="welcome-orbit welcome-orbit-one" />
          <span className="welcome-orbit welcome-orbit-two" />
          <span className="welcome-sun" />
          <span className="welcome-star welcome-star-one">✦</span>
          <span className="welcome-star welcome-star-two">✧</span>
          <span className="welcome-star welcome-star-three">·</span>
          <svg className="welcome-landscape" viewBox="0 0 640 220" fill="none" preserveAspectRatio="xMidYMax slice">
            <path d="M0 169c86-14 114-68 203-60 69 6 93 51 172 44 103-10 141-89 265-66v133H0V169Z" fill="url(#welcome-back-hill)" />
            <path d="M0 185c96-22 160-4 237-18 101-18 164-38 243-22 71 15 103 9 160-6v98H0v-52Z" fill="url(#welcome-front-hill)" />
            <path d="M456 126V65l46-34 46 34v72" stroke="rgba(210,255,247,.72)" strokeWidth="3" strokeLinejoin="round" />
            <path d="M482 137v-38h39v38M465 65h74" stroke="rgba(210,255,247,.5)" strokeWidth="2" strokeLinejoin="round" />
            <defs>
              <linearGradient id="welcome-back-hill" x1="320" y1="80" x2="320" y2="220" gradientUnits="userSpaceOnUse"><stop stopColor="#1c8478" stopOpacity=".58"/><stop offset="1" stopColor="#103f45" stopOpacity=".3"/></linearGradient>
              <linearGradient id="welcome-front-hill" x1="320" y1="143" x2="320" y2="220" gradientUnits="userSpaceOnUse"><stop stopColor="#23b6a2" stopOpacity=".55"/><stop offset="1" stopColor="#0b393a" stopOpacity=".84"/></linearGradient>
            </defs>
          </svg>
        </div>
        <div className="relative z-10 max-w-xl">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.22em] text-emerald-200"><Sparkles className="size-4"/>İş ve finans merkezi</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Güne hazır mısın?</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-200">{businessProfile.activeProfile?.name ?? "Ekibin"} için bugünün planı hazır. Günlük iş akışını tek dokunuşla aç.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link to="/isler" className="welcome-cta inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-950 shadow-lg shadow-black/20 transition">Bugünün işlerine git<ArrowRight className="size-4"/></Link>
            <span className="flex items-center gap-2 text-xs font-medium text-white/80"><CalendarDays className="size-4 text-emerald-200"/>{data.todayJobCount ? `${data.todayJobCount} iş bugün planlı` : "Bugün için planlı iş yok"}</span>
          </div>
        </div>
      </section>
      <section aria-labelledby="panel-finance-summary" className="overflow-hidden rounded-[1.65rem] border border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.08] p-3.5 shadow-[0_18px_55px_-42px_color-mix(in_oklch,var(--primary)_55%,transparent)] sm:rounded-3xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Finans özeti</p><h1 id="panel-finance-summary" className="mt-1 text-xl font-bold sm:text-2xl">Döneminin finans görünümü</h1><p className="mt-1 text-xs text-muted-foreground">{financeBounds.from === financeBounds.to ? financeBounds.from : `${financeBounds.from} – ${financeBounds.to}`} · kayıtlı operasyon verileri</p></div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" className="min-h-11 rounded-xl" aria-pressed={focusMode} onClick={toggleFocusMode}>
              {focusMode ? <Eye className="size-4"/> : <EyeOff className="size-4"/>}
              <span className="hidden sm:inline">{focusMode ? "Tüm panel" : "Odak modu"}</span>
              <span className="sm:hidden">{focusMode ? "Tümü" : "Odak"}</span>
            </Button>
            <Link to="/rapor" className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background/80 px-3 text-sm font-semibold text-primary hover:bg-primary/5"><FileText className="size-4"/><span className="hidden sm:inline">Aylık rapor</span><span className="sm:hidden">Rapor</span></Link>
          </div>
        </div>
        <div role="group" aria-label="Finans özeti dönemi" className="scrollbar-soft -mx-3.5 mt-4 flex flex-nowrap gap-2 overflow-x-auto px-3.5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {([ ["today", "Bugün"], ["week", "Bu hafta"], ["month", "Bu ay"], ["year", "Bu yıl"], ["custom", "Özel"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={financePeriod === value} onClick={() => setFinancePeriod(value)} className={`min-h-10 shrink-0 rounded-xl border px-3.5 text-[13px] font-semibold transition duration-200 active:scale-[.97] ${financePeriod === value ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-background/70 text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
          {financePeriod === "custom" && <div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="finance-period-from">Başlangıç tarihi</label><input id="finance-period-from" type="date" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} className="min-h-10 rounded-xl border bg-background px-2 text-sm"/><span aria-hidden="true" className="text-muted-foreground">–</span><label className="sr-only" htmlFor="finance-period-to">Bitiş tarihi</label><input id="finance-period-to" type="date" value={customTo} min={customFrom || undefined} max={todayISO()} onChange={(event) => setCustomTo(event.target.value)} className="min-h-10 rounded-xl border bg-background px-2 text-sm"/></div>}
        </div>
        {financeBounds.from > financeBounds.to ? <p role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">Başlangıç tarihi bitiş tarihinden sonra olamaz.</p> : txs.isLoading || exps.isLoading || payrollEntries.isLoading || payrollPayments.isLoading || payrollAdvances.isLoading ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Finans özeti yükleniyor" aria-busy="true">{[0,1,2,3].map((index) => <Skeleton key={index} className="h-24 rounded-2xl"/>)}<Skeleton className="h-36 rounded-2xl sm:col-span-2 lg:col-span-4"/></div> : !periodFinance.hasData ? <div className="mt-4 rounded-2xl border border-dashed bg-background/50 p-5 text-center"><p className="font-medium">Bu dönemde kayıtlı finans hareketi yok</p><p className="mt-1 text-sm text-muted-foreground">Özet yalnızca kaydedilmiş tahsilat, gider ve yevmiye kayıtlarını gösterir; banka bakiyesi tahmin etmez.</p></div> : <>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:mt-4 sm:gap-3 lg:grid-cols-4">
            <SummaryCard label="Brüt iş / alacak" value={periodFinance.grossAccrued} helper="Dönem içinde kaydedilmiş borç işlemlerinin KDV dâhil toplamı; tahsil edildiği anlamına gelmez." tone="text-sky-700 dark:text-sky-300"/>
            <SummaryCard label="Tahsil edilen" value={periodFinance.collected} helper="Dönem içinde kaydedilmiş cari tahsilatları. Banka hareketleri bu toplama dahil değildir." tone="text-emerald-700 dark:text-emerald-300"/>
            <SummaryCard label="Gider" value={periodFinance.expenses} helper="Giderler sayfasındaki dönem kayıtları." tone="text-rose-700 dark:text-rose-300"/>
            <SummaryCard label="Hak edilen yevmiye" value={periodFinance.payrollEarned} helper={`Dönem yevmiye kayıtları. Avans: ${formatTL(periodFinance.advancesPaid)} · Ödenen: ${formatTL(periodFinance.payrollPaid)}. Yabancı para kayıtları bu TRY toplamına katılmaz.`} tone="text-amber-700 dark:text-amber-300"/>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl bg-slate-950 p-4 text-white sm:p-5"><div className="flex items-start justify-between gap-2"><div><p className="flex items-center gap-2 text-xs font-medium text-slate-300"><WalletCards className="size-4 text-emerald-300"/>Net nakit akışı</p><p className={`num mt-2 break-words text-3xl font-bold sm:text-4xl ${periodFinance.netCashFlow < 0 ? "text-rose-300" : "text-emerald-300"}`}>{periodFinance.netCashFlow < 0 ? "−" : ""}{formatTL(Math.abs(periodFinance.netCashFlow))}</p><p className="mt-1 text-[11px] text-slate-400">Tahsilat − gider − ödenen yevmiye − avans</p></div><details className="relative"><summary aria-label="Net nakit akışı hesaplama bilgisi" className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full bg-white/10 text-slate-200"><Info className="size-4"/></summary><p className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-white/15 bg-slate-900 p-3 text-xs leading-relaxed text-slate-200 shadow-xl">Bu, uygulamada kaydedilmiş dönem tahsilatlarından gider, yevmiye ödemesi ve avansların çıkarılmasıyla bulunan nakit akışı göstergesidir. Banka bakiyesi veya tam muhasebe kârı değildir; banka kasası hareketleri ayrıca tutulur.</p></details></div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3">{([ ["USD", "$", Number(rates.data?.rates.TRY) > 0 ? periodFinance.netCashFlow / Number(rates.data?.rates.TRY) : NaN], ["EUR", "€", Number(rates.data?.rates.TRY) > 0 ? periodFinance.netCashFlow * Number(rates.data?.rates.EUR) / Number(rates.data?.rates.TRY) : NaN], ["GBP", "£", Number(rates.data?.rates.TRY) > 0 ? periodFinance.netCashFlow * Number(rates.data?.rates.GBP) / Number(rates.data?.rates.TRY) : NaN] ] as const).map(([code, symbol, amount]) => <div key={code} className="min-w-0 rounded-xl bg-white/[0.06] p-2.5"><p className="text-[10px] font-semibold text-slate-400">{code} · yaklaşık piyasa değeri</p><p className="num mt-1 truncate text-sm font-bold text-white">{Number.isFinite(amount) ? `${symbol}${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}` : "Kur yok"}</p><p className="num mt-1 truncate text-[9px] text-slate-400">1 {code} = {Number(rates.data?.rates.TRY) > 0 && Number(rates.data?.rates[code]) > 0 ? formatTL(Number(rates.data?.rates.TRY) / Number(rates.data?.rates[code])) : "—"}</p></div>)}</div>
              <p className="mt-2 text-[10px] leading-4 text-slate-400">TRY ana tutar: {formatTL(periodFinance.netCashFlow)} · Kur: {rates.data?.provider ?? "—"} ({rates.data?.dataType === "mid_market" ? "mid-market" : "günlük referans"}) · sağlayıcı zamanı: {rates.data?.lastUpdatedAt ? relativeTime(rates.data.lastUpdatedAt) : "—"} · son kontrol: {rates.data?.fetchedAt ? relativeTime(rates.data.fetchedAt) : "—"} · yenileme: {intervalText(rates.data?.updateIntervalSeconds ?? 86_400)}{rates.data?.isStale || rates.data?.warning || !online || rates.isError ? " · son bilinen / güncel değil" : ""}. Banka alış/satış fiyatı değildir.</p>
              {rates.isError && !rates.data && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-rose-200"><span>Kur alınamadı; döviz karşılıkları gösterilemiyor.</span><Button type="button" variant="secondary" size="sm" disabled={rates.isFetching} onClick={() => void rates.refetch()}><RefreshCw className={`size-3.5 ${rates.isFetching ? "animate-spin" : ""}`}/>Tekrar dene</Button></div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SummaryCard label="Dönem içi borç farkı" value={periodFinance.outstandingReceivable} helper="Dönemde kaydedilen borçlar eksi dönem tahsilatlarıdır; önceki dönem bakiyesi ve ödeme dağılımını içermez." tone="text-amber-700 dark:text-amber-300"/>
              <div className="rounded-2xl border bg-background/70 p-3 sm:p-4"><p className="text-xs text-muted-foreground">Kayıt kapsamı</p><p className="num mt-2 text-xl font-bold">{periodFinance.rowCount}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">finans ve yevmiye satırı · kaynak: uygulama kayıtları. Banka kasası ve gelecek tahminleri hariç.</p></div>
              <div className="col-span-2 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3 text-[11px] leading-relaxed text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0 text-amber-600"/>Vergi, komisyon veya iade için ayrı kayıt yoksa bu özette tahmin/uydurma kalem oluşturulmaz. İptal ve iade işaretleri veri modelinde ayrı doğrulanmadığından brüt iş toplamı kayıtlı borçlardan hesaplanır.</div>
            </div>
          </div>
        </>}
      </section>
      {nearby && <section className="rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/10 p-4"><div className="flex items-start gap-3"><MapPin className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300"/><div className="min-w-0 flex-1"><p className="font-semibold">Şu an {nearby.customer.name} konumuna yakınsınız</p><p className="text-xs text-muted-foreground">Yaklaşık {Math.round(nearby.meters)} metre · konum yalnızca cihazda karşılaştırılır</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={saveJob.isPending} onClick={() => startNearbyJob(nearby.customer)}><HardHat/>Hızlı iş başlat</Button><Button asChild size="sm" variant="secondary"><Link to="/cari/$id" params={{ id: nearby.customer.id }}><Wallet/>Tahsilat al</Link></Button></div></div></div></section>}
      <MaintenanceAlerts />
      <section className="dashboard-reveal overflow-hidden rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">İş akışı</p><h2 className="mt-1 text-lg font-bold">Bugünün işleri</h2><p className="text-xs text-muted-foreground">{todayISO()} · seçili usta profili</p></div><Link to="/isler" className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-primary hover:bg-primary/10">Tüm işler <ArrowUpRight className="size-4"/></Link></div>
        {data.todayJobs.length ? <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{data.todayJobs.map((job) => <li key={job.id}><Link to="/isler" className="flex h-full min-h-20 items-center gap-3 rounded-2xl border bg-background/55 p-3 transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><HardHat className="size-5"/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{job.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{job.customer}{job.time ? ` · ${job.time}` : ""}</span></span><span className="max-w-24 shrink-0 truncate rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold">{job.status}</span></Link></li>)}</ul> : <div className="flex flex-col items-center rounded-2xl border border-dashed bg-background/35 px-4 py-6 text-center"><span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><CalendarDays className="size-5"/></span><p className="mt-2 text-sm font-semibold">Bugün için planlanmış iş yok</p><p className="mt-1 text-xs text-muted-foreground">Randevu veya iş kaydı eklediğinde günlük planın burada görünür.</p><Button asChild variant="secondary" size="sm" className="mt-3"><Link to="/randevu">Takvimi aç</Link></Button></div>}
      </section>
      {txs.isLoading || exps.isLoading || customers.isLoading || jobs.isLoading || payrollEntries.isLoading || payrollPayments.isLoading || payrollAdvances.isLoading ? <div className="space-y-3" aria-label="Panel verileri yükleniyor" aria-busy="true"><div className="rounded-3xl border bg-card p-4"><Skeleton className="h-5 w-40"/><Skeleton className="mt-4 h-24 w-full"/></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl"/>)}</div><div className="rounded-2xl border bg-card p-4"><Skeleton className="h-5 w-32"/><Skeleton className="mt-4 h-48 w-full"/></div></div> : <>
      <section className={`grid gap-3 ${focusMode ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        {!focusMode && <div className="dashboard-reveal rounded-2xl border bg-card p-4">
          <div className="mb-2 flex items-start justify-between"><div><h2 className="text-sm font-semibold">Bu Hafta</h2><p className="mt-1 text-xs text-muted-foreground">Son 7 gündeki tamamlanan işler</p></div><span className="num rounded-full bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">{data.weekCount}</span></div>
          <div className="h-40 sm:h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.weekly} margin={{ top: 6, right: 0, bottom: 0, left: -24 }}><XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false}/><YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false}/><Tooltip cursor={{ fill: "var(--secondary)" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }} formatter={(value: number) => [`${value} iş tamamlandı`, ""]}/><Bar dataKey="count" radius={[6, 6, 0, 0]}>{data.weekly.map((row) => <Cell key={row.key} fill={row.today ? "var(--primary)" : "var(--muted-foreground)"} opacity={row.today ? 1 : 0.38}/>)}</Bar></BarChart></ResponsiveContainer></div>
        </div>}
        <div className="dashboard-reveal rounded-2xl border bg-card p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Hızlı Eylemler</h2><span className="text-[10px] text-muted-foreground">{focusMode ? "Odak görünümü" : "Kısayollar"}</span></div><div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => openJobs("job")} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-secondary text-sm font-medium transition-transform active:scale-95"><HardHat className="size-7 text-primary"/>Yeni İş</button>
          <button type="button" onClick={() => openCustomers()} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-secondary text-sm font-medium transition-transform active:scale-95"><UserPlus className="size-7 text-primary"/>Yeni Müşteri</button>
          <button type="button" onClick={() => openJobs("camera")} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-secondary text-sm font-medium transition-transform active:scale-95"><Camera className="size-7 text-primary"/>İş Fotoğrafı</button>
          <button type="button" onClick={() => setScannerOpen(true)} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-secondary text-sm font-medium transition-transform active:scale-95"><QrCode className="size-7 text-primary"/>QR Tara</button>
        </div></div>
      </section>
      {!focusMode && <section aria-label="Hesaplama aracı"><Link to="/hesaplayici" className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-card px-3 text-sm font-semibold transition hover:border-primary/40 hover:bg-primary/5"><WalletCards className="size-4 text-primary"/>Maliyet hesaplayıcı</Link></section>}
      {!focusMode && <section className="dashboard-reveal rounded-2xl border bg-card p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Son Hareketler</h2><p className="text-xs text-muted-foreground">İşler, tahsilatlar ve giderler</p></div><Link to="/isler" className="flex items-center gap-1 text-xs font-semibold text-primary">Tümünü gör <ArrowUpRight className="size-3.5"/></Link></div>
        {data.activity.length ? <ul className="animate-in slide-in-from-bottom-2 space-y-1 duration-300">{data.activity.map((item) => <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2"><span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${activityTone(item.kind)}`}>{item.kind === "job" ? <HardHat className="size-4"/> : item.kind === "expense" ? <TrendingDown className="size-4"/> : <Wallet className="size-4"/>}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="size-3"/>{relativeTime(item.date)}</p></div><span className={`num whitespace-nowrap text-xs font-semibold ${item.kind === "expense" ? "text-destructive" : "text-foreground"}`}>{item.kind === "expense" ? "−" : item.kind === "job" ? "" : "+"}{formatTL(item.amount)}</span></li>)}</ul> : <p className="py-5 text-center text-sm text-muted-foreground">Henüz hareket yok</p>}
      </section>}
      {data.overdue.length > 0 && (
        <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-4" /> Vadesi geçmiş alacaklar
          </div>
          {data.overdue.slice(0, 3).map(({ c, overdue }) => (
            <div key={c.id} className="flex items-center gap-2 border-b border-destructive/15 py-2"><Link to="/cari/$id" params={{ id: c.id }} className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</Link><span className="num whitespace-nowrap text-sm font-semibold text-destructive">{formatTL(overdue)}</span>{c.phone && <Button size="icon" variant="secondary" className="size-9" onClick={() => openWhatsApp(c.phone!, `Merhaba ${c.name}, ${formatTL(overdue)} tutarında vadesi geçmiş bakiyeniz bulunuyor. Uygun olduğunuzda ödeme bilgisini paylaşabilir misiniz?`)} aria-label={`${c.name} için WhatsApp ödeme hatırlatması`}><MessageCircle/></Button>}</div>
          ))}
        </div>
      )}

      {!focusMode && <section className="dashboard-reveal grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Son 6 ay</h2>
        {data.bars.every((row) => row.Gelir === 0 && row.Gider === 0) ? (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-background/40 px-4 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><TrendingUp className="size-5" /></span>
            <p className="mt-3 text-sm font-semibold">Henüz grafik verisi yok</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">Son altı ayda kaydedilmiş gelir veya gider oluştuğunda aylık karşılaştırma burada görünür. Geleceğe ait aylar da grafiğe eklenmez.</p>
            <Link to="/giderler" className="mt-3 inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-semibold text-primary hover:bg-primary/10">İlk gider kaydını ekle</Link>
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.bars} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis width={48} stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value: number) => value >= 1000 ? `${Math.round(value / 1000)} bin` : String(value)} />
                <Tooltip
                  cursor={{ fill: "var(--secondary)" }}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }}
                  formatter={(v: number) => formatTL(v)}
                />
                <Bar dataKey="Gelir" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Gider" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Gider dağılımı</h2>
        {data.byCat.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Bu ay gider yok</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="size-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.byCat} dataKey="value" innerRadius={38} outerRadius={64} paddingAngle={2} stroke="none">
                    {data.byCat.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }} formatter={(v: number) => formatTL(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 space-y-1.5 text-sm">
              {data.byCat.map((c, i) => (
                <li key={c.name} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  {c.name}
                  <span className="num ml-auto">{formatTL(c.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      </section>}

      </>}
      {scannerOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-lg rounded-2xl border bg-card p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">QR kodu tara</h2><Button variant="ghost" size="sm" onClick={() => setScannerOpen(false)}>Kapat</Button></div><CodeScanner onRead={() => { setScannerOpen(false); toast.success("QR kodu okundu."); }} onClose={() => setScannerOpen(false)}/></div></div>}
    </div>
  );
}

function readCachedRates(): { value: Awaited<ReturnType<typeof getLiveCurrencyRates>>; savedAt: number } | undefined {
  if (typeof window === "undefined") return undefined;
  try { const value = JSON.parse(localStorage.getItem("saha.market-rates.v1") ?? "null") as { value?: Awaited<ReturnType<typeof getLiveCurrencyRates>>; savedAt?: number } | null; return value?.value && typeof value.savedAt === "number" ? { value: value.value, savedAt: value.savedAt } : undefined; } catch { return undefined; }
}
function relativeTime(value: string) {
  const parsed = Date.parse(value.length === 10 ? `${value}T12:00:00` : value);
  if (!Number.isFinite(parsed)) return "zaman bilgisi yok";
  const mins = Math.max(0, Math.floor((Date.now() - parsed) / 60_000));
  if (mins < 1) return "şimdi";
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60); if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24); return `${days} gün önce`;
}
function intervalText(seconds: number) {
  if (seconds <= 60) return "dakikada bir";
  if (seconds < 86_400) return "saatte bir";
  return "günde bir";
}
function activityTone(kind: string) { return kind === "job" ? "bg-sky-500/10 text-sky-600" : kind === "expense" ? "bg-rose-500/10 text-rose-600" : kind === "payment" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"; }
function SummaryCard({ label, value, helper, tone }: { label: string; value: number; helper: string; tone: string }) {
  return <div className="min-w-0 rounded-2xl border bg-background/70 p-3 sm:p-4">
    <p className="text-xs font-semibold text-muted-foreground">{label}</p>
    <p className={`num mt-2 break-words text-xl font-bold sm:text-2xl ${tone}`}>{formatTL(value)}</p>
    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{helper}</p>
  </div>;
}
