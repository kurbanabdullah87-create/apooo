import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Banknote, BriefcaseBusiness, CalendarDays, ChevronLeft, ChevronRight, Clock3, Download, FileText, Plus, TrendingUp, Wallet, X, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDrawer } from "@/components/app/forms/FormDrawer";
import { useMe } from "@/hooks/use-me";
import { supabase } from "@/integrations/supabase/client";
import { useRecords, useSaveRecord, payrollEntryAmount, payrollBalance, pageHead, type Payload, type WorkRecord } from "@/lib/work";
import { todayISO, formatDate } from "@/lib/finance";
import { useBusinessProfile } from "@/lib/work-profile-context";

export const Route = createFileRoute("/_authenticated/yevmiye")({
  head: () => pageHead("Yevmiye ve Bordro", "İşyeri, çalışma takvimi, mesai, ödeme ve aylık bordro raporu."),
  component: Payroll,
});

const CURRENCIES = ["TRY", "USD", "EUR", "GBP"] as const;
const currencyName: Record<string, string> = { TRY: "Türk lirası", USD: "ABD doları", EUR: "Euro", GBP: "İngiliz sterlini" };
const statuses = [
  { value: 1, label: "Tam gün", color: "emerald", tile: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200", active: "ring-2 ring-emerald-500 shadow-md shadow-emerald-500/10" },
  { value: 0.5, label: "Yarım gün", color: "amber", tile: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200", active: "ring-2 ring-amber-500 shadow-md shadow-amber-500/10" },
  { value: 0.25, label: "Çeyrek gün", color: "sky", tile: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200", active: "ring-2 ring-sky-500 shadow-md shadow-sky-500/10" },
  { value: 1.5, label: "1,5 gün", color: "violet", tile: "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200", active: "ring-2 ring-violet-500 shadow-md shadow-violet-500/10" },
  { value: 2, label: "2 gün", color: "indigo", tile: "border-indigo-500/30 bg-indigo-500/10 text-indigo-800 dark:text-indigo-200", active: "ring-2 ring-indigo-500 shadow-md shadow-indigo-500/10" },
  { value: 0, label: "İzinli", color: "rose", tile: "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200", active: "ring-2 ring-rose-500 shadow-md shadow-rose-500/10" },
];
const statusForDays = (days: number) => statuses.find((status) => status.value === days) ?? statuses[0]!;
const monthTitle = (key: string) => new Date(`${key}-01T12:00:00`).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
const n = (v: unknown, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const amountText = (amount: number, currency = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
const blankWorkplace = (): Payload => ({ name: "", pay_type: "daily", rate: 0, daily_hours: 8, currency: "TRY", contact_name: "", phone: "", notes: "", active: true });

function Payroll() {
  const payroll = useRecords("payroll");
  const advances = useRecords("advance");
  const payments = useRecords("payment");
  const workplacesQuery = useRecords("workplace");
  const settingsQuery = useRecords("settings");
  const jobsQuery = useRecords("job");
  const savePayroll = useSaveRecord("payroll");
  const saveAdvance = useSaveRecord("advance");
  const savePayment = useSaveRecord("payment");
  const saveWorkplace = useSaveRecord("workplace");
  const me = useMe();
  const businessProfile = useBusinessProfile();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [selectedOwner, setSelectedOwner] = useState("");
  const [members, setMembers] = useState<{ id: string; username: string }[]>([]);
  const [tab, setTab] = useState<"calendar" | "workplaces" | "report">("calendar");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [entry, setEntry] = useState<{ kind: "payroll" | "advance" | "payment"; id?: string; owner_id?: string; payload: Payload } | null>(null);
  const [advanceConfirmed, setAdvanceConfirmed] = useState(false);
  const [placeForm, setPlaceForm] = useState<{ id?: string; payload: Payload } | null>(null);
  const [workplaceSearch, setWorkplaceSearch] = useState("");
  const newWorkplace = () => ({ ...blankWorkplace(), currency: businessProfile.activeProfile?.currency ?? "TRY" });

  useEffect(() => {
    void supabase.from("profiles").select("id,username").then(({ data }) => setMembers(data ?? []));
  }, []);

  const ownerId = selectedOwner || me.data?.id || "";
  const legacyReportName = settingsQuery.data?.find((record) => record.owner_id === me.data?.id)?.payload.master_report_name;
  const selectedMasterName = businessProfile.activeProfile?.is_default && legacyReportName
    ? String(legacyReportName)
    : businessProfile.activeProfile?.name || me.data?.profile?.display_name || me.data?.profile?.username || "Usta";
  const workplaces = useMemo(() => (workplacesQuery.data ?? []).filter((r) => r.payload.active !== false), [workplacesQuery.data]);
  const allPayrollRows = (payroll.data ?? []).filter((r) => r.owner_id === ownerId);
  const rows = allPayrollRows.filter((r) => String(r.payload.date ?? "").startsWith(month));
  const monthAdvances = (advances.data ?? []).filter((r) => r.owner_id === ownerId && String(r.payload.date ?? "").startsWith(month));
  const monthPayments = (payments.data ?? []).filter((r) => r.owner_id === ownerId && String(r.payload.date ?? "").startsWith(month));
  const earnedByCurrency = useMemo(() => rows.reduce<Record<string, number>>((s, r) => { const c = String(r.payload.currency || "TRY"); s[c] = (s[c] ?? 0) + payrollEntryAmount(r.payload); return s; }, {}), [rows]);
  const advancesByCurrency = useMemo(() => monthAdvances.reduce<Record<string, number>>((s, r) => { const c = String(r.payload.currency || "TRY"); s[c] = (s[c] ?? 0) + n(r.payload.amount); return s; }, {}), [monthAdvances]);
  const paymentsByCurrency = useMemo(() => monthPayments.reduce<Record<string, number>>((s, r) => { const c = String(r.payload.currency || "TRY"); s[c] = (s[c] ?? 0) + n(r.payload.amount); return s; }, {}), [monthPayments]);
  const monthCurrencies = [...new Set([...Object.keys(earnedByCurrency), ...Object.keys(advancesByCurrency), ...Object.keys(paymentsByCurrency)])];
  // Keep mixed currencies separate; the headline totals show TRY only.
  const earned = earnedByCurrency.TRY ?? 0;
  const advanced = advancesByCurrency.TRY ?? 0;
  const paid = paymentsByCurrency.TRY ?? 0;
  const outstanding = payrollBalance(earned, advanced + paid);
  const earnedAllTime = allPayrollRows.filter((r) => String(r.payload.currency ?? "TRY") === "TRY").reduce((sum, r) => sum + payrollEntryAmount(r.payload), 0);
  const advancedAllTime = (advances.data ?? []).filter((r) => r.owner_id === ownerId && r.id !== entry?.id && String(r.payload.currency ?? "TRY") === "TRY").reduce((sum, r) => sum + n(r.payload.amount), 0);
  const paidAllTime = (payments.data ?? []).filter((r) => r.owner_id === ownerId && String(r.payload.currency ?? "TRY") === "TRY").reduce((sum, r) => sum + n(r.payload.amount), 0);
  const availableAdvance = earnedAllTime - advancedAllTime - paidAllTime;
  const advanceWouldExceed = entry?.kind === "advance" && String(entry.payload.currency ?? "TRY") === "TRY" && n(entry.payload.amount) > Math.max(0, availableAdvance);

  const first = new Date(`${month}-01T12:00:00`);
  const daysCount = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const mondayOffset = (first.getDay() + 6) % 7;
  const getRowsForDay = (date: string) => rows.filter((r) => r.payload.date === date);
  const shiftedMonth = (delta: number) => {
    const d = new Date(`${month}-01T12:00:00`); d.setMonth(d.getMonth() + delta);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  function openEntry(kind: "payroll" | "advance" | "payment", date = selectedDate, record?: WorkRecord) {
    setAdvanceConfirmed(false);
    setSelectedDate(date);
    if (record) setEntry({ kind, id: record.id, owner_id: record.owner_id, payload: { ...record.payload } });
    else if (kind === "payroll") {
      const workplace = workplaces[0];
      const dailyHours = n(workplace?.payload.daily_hours, 8);
      const payType = String(workplace?.payload.pay_type ?? "daily");
      const wage = n(workplace?.payload.rate);
      setEntry({ kind, owner_id: ownerId, payload: { date, days: 1, status: "Tam gün", multiplier: 1, rate: payType === "hourly" ? wage * dailyHours : wage,
        hourly_rate: payType === "hourly" ? wage : wage / dailyHours, standard_hours: dailyHours, overtime_enabled: false, overtime_hours: 0,
        overtime_multiplier: 1.5, currency: String(workplace?.payload.currency ?? "TRY"), workplace_id: workplace?.id ?? "", workplace_name: String(workplace?.payload.name ?? ""), notes: "" } });
    } else setEntry({ kind, owner_id: ownerId, payload: { date, amount: 0, currency: "TRY", notes: "" } });
  }

  function selectWorkplace(id: string) {
    const workplace = workplaces.find((r) => r.id === id);
    if (!workplace) return;
    const dailyHours = Math.max(1, n(workplace.payload.daily_hours, 8));
    const payType = String(workplace.payload.pay_type ?? "daily");
    const wage = n(workplace.payload.rate);
    setEntry((current) => current && ({ ...current, payload: { ...current.payload, workplace_id: id, workplace_name: String(workplace.payload.name), rate: payType === "hourly" ? wage * dailyHours : wage,
      hourly_rate: payType === "hourly" ? wage : wage / dailyHours, standard_hours: dailyHours, currency: String(workplace.payload.currency ?? "TRY") } }));
  }

  const setEntryValue = (key: string, value: string | number | boolean) => setEntry((e) => e && ({ ...e, payload: { ...e.payload, [key]: value } }));
  function saveEntry() {
    if (!entry) return;
    const date = String(entry.payload.date ?? "");
    if (!date) return void toast.error("Tarih seçin.");
    if (entry.kind === "payroll" && !String(entry.payload.workplace_name ?? "").trim()) return void toast.error("Bir işyeri seçin. Önce İşyeri sekmesinden ekleyebilirsiniz.");
    if (entry.kind === "payroll" && n(entry.payload.days) !== 0 && n(entry.payload.rate) <= 0) return void toast.error("İşyerinin ücret bilgisi sıfırdan büyük olmalı.");
    if (entry.kind !== "payroll" && n(entry.payload.amount) <= 0) return void toast.error("Tutar sıfırdan büyük olmalı.");
    if (entry.kind === "advance" && advanceWouldExceed && !advanceConfirmed) return void toast.error("Hak edişi aşan avans için onayı işaretleyin.");
    if (entry.kind === "payroll") {
      const days = n(entry.payload.days);
      const payload = { ...entry.payload, status: days === 0 ? "İzinli" : statuses.find((s) => s.value === days)?.label, multiplier: 1 };
      savePayroll.mutate({ id: entry.id, owner_id: entry.owner_id || ownerId, payload }, { onSuccess: () => setEntry(null) });
    } else {
      const mutation = entry.kind === "advance" ? saveAdvance : savePayment;
      mutation.mutate({ id: entry.id, owner_id: entry.owner_id || ownerId, payload: entry.payload }, { onSuccess: () => setEntry(null) });
    }
  }

  function savePlace() {
    if (!placeForm) return;
    if (!String(placeForm.payload.name ?? "").trim()) return void toast.error("İşyeri adı gerekli.");
    if (n(placeForm.payload.rate) <= 0) return void toast.error("Ücret sıfırdan büyük olmalı.");
    if (String(placeForm.payload.pay_type) === "hourly" && n(placeForm.payload.daily_hours) <= 0) return void toast.error("Günlük çalışma saati sıfırdan büyük olmalı.");
    saveWorkplace.mutate({ id: placeForm.id, owner_id: me.data?.id, payload: { ...placeForm.payload, name: String(placeForm.payload.name).trim(), active: true } }, { onSuccess: () => setPlaceForm(null) });
  }

  async function downloadPdf() {
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
      const fontData = async (path: string) => {
        const bytes = new Uint8Array(await (await fetch(path)).arrayBuffer());
        let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
      };
      doc.addFileToVFS("DejaVuSans.ttf", await fontData("/fonts/DejaVuSans.ttf"));
      doc.addFileToVFS("DejaVuSans-Bold.ttf", await fontData("/fonts/DejaVuSans-Bold.ttf"));
      doc.addFont("DejaVuSans.ttf", "DejaVu", "normal"); doc.addFont("DejaVuSans-Bold.ttf", "DejaVu", "bold");
      const margin = 15; let y = 18;
      const header = () => {
        doc.setFillColor(15, 31, 54); doc.rect(0, 0, 210, 45, "F");
        doc.setTextColor(255, 255, 255); doc.setFont("DejaVu", "bold"); doc.setFontSize(20); doc.text("SAHA · YEVMIYE RAPORU", margin, 20);
        const employeeName = members.find((m) => m.id === ownerId)?.username ?? "Çalışan";
        doc.setFont("DejaVu", "normal"); doc.setFontSize(8.5); doc.text(`${monthTitle(month)}  ·  Çalışan: ${employeeName}`, margin, 29);
        doc.text(`Usta / işveren: ${selectedMasterName}`, margin, 35);
        doc.setTextColor(173, 190, 211); doc.setFontSize(7.5); doc.text(`Oluşturulma: ${new Date().toLocaleString("tr-TR")}`, margin, 41);
        y = 56;
      };
      const ensure = (height: number) => { if (y + height > 280) { doc.addPage(); y = 18; } };
      header();
      doc.setFont("DejaVu", "bold"); doc.setFontSize(12); doc.setTextColor(15, 31, 54); doc.text("AYLIK ÖZET", margin, y); y += 7;
      const cards = [["Hak edilen · TRY", earned], ["Avans · TRY", advanced], ["Ödenen · TRY", paid], ["Kalan · TRY", outstanding]];
      const cardWidth = 43.5;
      cards.forEach(([label, value], i) => {
        const x = margin + i * (cardWidth + 2);
        doc.setFillColor(i === 3 ? 232 : 243, i === 3 ? 246 : 246, i === 3 ? 238 : 250); doc.roundedRect(x, y, cardWidth, 22, 2, 2, "F");
        doc.setFont("DejaVu", "normal"); doc.setFontSize(8); doc.setTextColor(92, 106, 125); doc.text(String(label), x + 3, y + 7);
        doc.setFont("DejaVu", "bold"); doc.setFontSize(10); doc.setTextColor(15, 31, 54); doc.text(amountText(Number(value), "TRY"), x + 3, y + 16);
      }); y += 31;
      for (const currency of monthCurrencies) {
        doc.setFont("DejaVu", "normal"); doc.setFontSize(9); doc.setTextColor(82, 96, 114);
        doc.text(`${currency}: Hak edilen ${amountText(earnedByCurrency[currency] ?? 0, currency)}  ·  Avans ${amountText(advancesByCurrency[currency] ?? 0, currency)}  ·  Ödenen ${amountText(paymentsByCurrency[currency] ?? 0, currency)}`, margin, y); y += 6;
      }
      y += 4; doc.setFont("DejaVu", "bold"); doc.setFontSize(12); doc.setTextColor(15, 31, 54); doc.text("GÜNLÜK ÇALIŞMA VE HAREKETLER", margin, y); y += 8;
      const cols = [margin, 43, 87, 116, 146, 176];
      const drawTableHead = () => { doc.setFillColor(31, 55, 83); doc.rect(margin, y - 5, 180, 9, "F"); doc.setFont("DejaVu", "bold"); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
        ["TARİH", "İŞYERİ / TÜR", "DURUM", "MESAİ", "TUTAR", "PARA"].forEach((t, i) => doc.text(t, (cols[i] ?? margin) + 1, y)); y += 7; };
      drawTableHead();
      const reportRows = [
        ...rows.map((r) => ({ date: String(r.payload.date ?? ""), name: String(r.payload.workplace_name ?? r.payload.site ?? "İşyeri"), status: String(r.payload.status ?? "Çalışma"), overtime: n(r.payload.overtime_hours) ? `${n(r.payload.overtime_hours)} sa` : "—", amount: payrollEntryAmount(r.payload), currency: String(r.payload.currency ?? "TRY"), kind: "payroll" })),
        ...monthAdvances.map((r) => ({ date: String(r.payload.date ?? ""), name: "Avans", status: "Avans", overtime: "—", amount: -n(r.payload.amount), currency: String(r.payload.currency ?? "TRY"), kind: "advance" })),
        ...monthPayments.map((r) => ({ date: String(r.payload.date ?? ""), name: "Ödeme", status: "Ödeme", overtime: "—", amount: -n(r.payload.amount), currency: String(r.payload.currency ?? "TRY"), kind: "payment" })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      for (const [index, row] of reportRows.entries()) {
        ensure(9); if (y === 18) drawTableHead();
        if (index % 2 === 0) { doc.setFillColor(246, 248, 251); doc.rect(margin, y - 5, 180, 9, "F"); }
        doc.setFont("DejaVu", "normal"); doc.setFontSize(7.4); doc.setTextColor(42, 52, 67);
        const vals = [formatDate(row.date), row.name.slice(0, 20), row.status, row.overtime, amountText(row.amount, row.currency), row.currency];
        vals.forEach((value, i) => doc.text(String(value), (cols[i] ?? margin) + 1, y, { maxWidth: i === 1 ? 42 : i === 4 ? 30 : 25 })); y += 9;
      }
      if (!reportRows.length) { doc.setFont("DejaVu", "normal"); doc.setFontSize(9); doc.text("Bu ay için kayıt bulunmuyor.", margin, y); y += 10; }
      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page++) { doc.setPage(page); const pageHeight = doc.internal.pageSize.getHeight();
        doc.setDrawColor(222, 228, 236); doc.line(margin, pageHeight - 14, 195, pageHeight - 14); doc.setFont("DejaVu", "normal"); doc.setFontSize(8); doc.setTextColor(115, 126, 141);
        doc.text("Bu rapor uygulamadaki kayıtlara dayanır; resmi bordro belgesi değildir.", margin, pageHeight - 8); doc.text(`${page} / ${pageCount}`, 195, pageHeight - 8, { align: "right" }); }
      doc.save(`saha-yevmiye-${month}.pdf`); toast.success("Aylık yevmiye PDF'i hazır.");
    } catch (error) { console.error(error); toast.error("PDF oluşturulamadı. Yeniden deneyin."); }
  }

  const isBusy = savePayroll.isPending || saveAdvance.isPending || savePayment.isPending;
  const allRecords = [...rows.map((r) => ({ r, type: "payroll" as const, amount: payrollEntryAmount(r.payload) })),
    ...monthAdvances.map((r) => ({ r, type: "advance" as const, amount: -n(r.payload.amount) })),
    ...monthPayments.map((r) => ({ r, type: "payment" as const, amount: -n(r.payload.amount) }))].sort((a, b) => String(b.r.payload.date).localeCompare(String(a.r.payload.date)));

  return <div className="mx-auto max-w-5xl space-y-5 pb-8">
    <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-lg sm:p-7">
      <div className="absolute -right-10 -top-16 size-56 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-emerald-300"><TrendingUp className="size-4"/>SAHA · ÇALIŞMA TAKİBİ</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">Yevmiye ve bordro</h1><p className="mt-1 max-w-lg text-sm text-slate-300">İşyeri ücretlerini, günlük çalışmalarını, mesaileri ve ödemeleri tek yerden yönetin.</p></div>
        <div className="flex flex-wrap gap-2">{me.data?.isUsta && <Button asChild variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Link to="/puantaj"><UserCheck/>Puantaj</Link></Button>}{me.data?.isUsta && <Button className="bg-white text-slate-950 hover:bg-slate-100" onClick={() => openEntry("payroll")}><Plus/>Çalışma ekle</Button>}</div>
      </div>
      {me.data?.isUsta && <div className="relative mt-5 max-w-xs"><Label className="mb-1 block text-xs text-slate-300" htmlFor="payroll-employee">Çalışan görünümü</Label><select id="payroll-employee" className="h-10 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white" value={ownerId} onChange={(e) => setSelectedOwner(e.target.value)}>{members.map((m) => <option className="text-slate-900" key={m.id} value={m.id}>{m.id === me.data?.id ? selectedMasterName : m.username}</option>)}</select></div>}
      <div className="relative mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {[["Hak edilen", earned, "text-emerald-300"], ["Avans", advanced, "text-amber-300"], ["Ödenen", paid, "text-sky-300"], ["Kalan", outstanding, "text-white"]].map(([label, value, color]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[.06] p-3"><p className="text-xs text-slate-300">{label}</p><p className={`mt-1 break-words text-lg font-bold ${color}`}>{amountText(Number(value), "TRY")}</p></div>)}
      </div>
      {monthCurrencies.some((c) => c !== "TRY") && <p className="relative mt-3 text-xs text-slate-300">Farklı para birimleri birbirine çevrilmeden ayrı tutulur; toplamlar yalnızca bilgilendirme amaçlı toplanmıştır.</p>}
    </header>

    <nav className="grid grid-cols-3 gap-2 rounded-2xl border bg-card p-1.5" aria-label="Yevmiye bölümleri">
      {([["calendar", CalendarDays, "Takvim"], ["workplaces", BriefcaseBusiness, "İşyeri"], ["report", FileText, "Ödemeler ve rapor"]] as const).map(([key, Icon, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-xs font-semibold transition sm:text-sm ${tab === key ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950" : "text-muted-foreground hover:bg-secondary"}`}><Icon className="size-4"/>{label}</button>)}
    </nav>

    {tab === "calendar" && <section className="space-y-4 rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">ÇALIŞMA TAKVİMİ</p><h2 className="mt-1 text-xl font-bold capitalize">{monthTitle(month)}</h2></div><div className="flex items-center gap-1"><Button variant="secondary" size="icon" aria-label="Önceki ay" onClick={() => shiftedMonth(-1)}><ChevronLeft/></Button><Button variant="secondary" size="icon" aria-label="Sonraki ay" onClick={() => shiftedMonth(1)}><ChevronRight/></Button></div></div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">{["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((d) => <span key={d} className="py-1 text-center text-[10px] font-semibold uppercase text-muted-foreground sm:text-xs">{d}</span>)}
        {Array.from({ length: mondayOffset }, (_, i) => <span key={`empty-${i}`}/>)}
        {Array.from({ length: daysCount }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const dayRows = getRowsForDay(date);
          const earnedDay = dayRows.reduce((sum, row) => sum + payrollEntryAmount(row.payload), 0);
          const isToday = date === todayISO();
          const dayStatuses = [...new Set(dayRows.map((row) => statusForDays(n(row.payload.days, 1)).value))].map(statusForDays);
          const primaryStatus = dayStatuses[0];
          return <button type="button" key={date} disabled={!me.data?.isUsta} onClick={() => openEntry("payroll", date)} aria-label={`${i + 1} ${monthTitle(month)}${isToday ? ", bugün" : ""}${dayRows.length ? `, ${dayRows.length} kayıt` : ""}`} className={`group min-h-[74px] rounded-2xl border p-1.5 text-left transition sm:min-h-[90px] sm:p-2 disabled:cursor-default ${isToday ? "border-primary/50 bg-primary/[0.04] ring-1 ring-primary/20" : primaryStatus ? primaryStatus.tile : "border-border bg-background hover:border-primary/50 hover:bg-secondary/60"}`}>
            <span className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-primary/10 text-primary" : "bg-background/70 text-foreground"}`}>{i + 1}</span>{isToday && <span className="ml-1 text-[8px] font-medium text-primary">Bugün</span>}
            {dayRows.length > 0 && <><p className="mt-1 truncate text-[9px] font-semibold sm:text-[10px]">{dayRows.length} kayıt</p><div className="mt-1 flex flex-wrap gap-1">{dayStatuses.slice(0, 2).map((status) => <span key={status.value} className={`rounded-full border px-1 py-0.5 text-[8px] leading-none sm:text-[9px] ${status.tile}`}>{status.label}</span>)}{dayStatuses.length > 2 && <span className="text-[8px]">+{dayStatuses.length - 2}</span>}</div><p className="mt-1 truncate text-[9px] text-muted-foreground sm:text-[10px]">{amountText(earnedDay, String(dayRows[0]?.payload.currency ?? "TRY"))}</p></>}
          </button>;
        })}
      </div><p className="text-xs text-muted-foreground">Gün seçerek o tarihe çalışma kaydı ekleyebilir, aynı tarihte birden fazla işyeri kaydedebilirsiniz.</p>
      <div className="grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-3">{statuses.map((status) => <div key={status.value} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${status.tile}`}><span className="size-2.5 rounded-full bg-current"/><span>{status.label}</span></div>)}</div>
    </section>}

    {tab === "workplaces" && <section className="space-y-4 rounded-3xl border bg-card p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">İŞYERİ KARTLARI · {businessProfile.activeProfile?.name ?? "Usta"}</p><h2 className="mt-1 text-xl font-bold">Ücret ve işyeri bilgileri</h2><p className="mt-1 text-sm text-muted-foreground">İşyeri bilgileri yevmiye eklerken ücretle beraber otomatik seçilir.</p></div>{me.data?.isUsta && <Button onClick={() => setPlaceForm({ payload: newWorkplace() })}><Plus/>İşyeri ekle</Button>}</div>
      <Input value={workplaceSearch} onChange={(e) => setWorkplaceSearch(e.target.value)} placeholder="İşyeri adına göre ara" aria-label="İşyeri adına göre ara"/>
      {workplacesQuery.error && <p className="text-sm text-destructive">İşyeri kayıtları yüklenemedi.</p>}
      <div className="grid gap-3 sm:grid-cols-2">{workplaces.filter((w) => String(w.payload.name).toLocaleLowerCase("tr-TR").includes(workplaceSearch.toLocaleLowerCase("tr-TR"))).map((w) => { const daily = String(w.payload.pay_type) === "hourly" ? n(w.payload.rate) * n(w.payload.daily_hours, 8) : n(w.payload.rate); return <article key={w.id} className="rounded-2xl border bg-background p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-bold">{String(w.payload.name)}</h3><p className="mt-1 text-xs text-muted-foreground">{String(w.payload.pay_type) === "hourly" ? "Saatlik ücret" : "Günlük yevmiye"} · {amountText(n(w.payload.rate), String(w.payload.currency))}{String(w.payload.pay_type) === "hourly" ? ` / saat · ${n(w.payload.daily_hours, 8)} sa/gün` : " / gün"}</p><p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">Günlük karşılığı: {amountText(daily, String(w.payload.currency))}</p></div>{me.data?.isUsta && <Button size="sm" variant="secondary" onClick={() => setPlaceForm({ id: w.id, payload: { ...w.payload } })}>Düzenle</Button>}</div>{(w.payload.contact_name || w.payload.phone) && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{String(w.payload.contact_name || "Yetkili kişi yok")}{w.payload.phone ? ` · ${String(w.payload.phone)}` : ""}</p>}{w.payload.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{String(w.payload.notes)}</p>}</article>; })}</div>
      {!workplaces.length && !workplacesQuery.isLoading && <div className="rounded-2xl border border-dashed p-8 text-center"><BriefcaseBusiness className="mx-auto size-8 text-muted-foreground"/><p className="mt-3 font-medium">Henüz işyeri eklenmemiş</p><p className="mt-1 text-sm text-muted-foreground">İlk işyerini ekle; günlük veya saatlik ücretini kaydet.</p>{me.data?.isUsta && <Button className="mt-4" onClick={() => setPlaceForm({ payload: newWorkplace() })}><Plus/>İlk işyerini ekle</Button>}</div>}
    </section>}

    {tab === "report" && <section className="space-y-4 rounded-3xl border bg-card p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">BORDRO VE HAREKETLER</p><h2 className="mt-1 text-xl font-bold">{monthTitle(month)} özeti</h2></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void downloadPdf()} disabled={payroll.isLoading || advances.isLoading || payments.isLoading}><Download/>PDF oluştur</Button>{me.data?.isUsta && <><Button variant="outline" onClick={() => openEntry("advance")}><Banknote/>Avans</Button><Button onClick={() => openEntry("payment")}><Wallet/>Ödeme</Button></>}</div></div>
      <div className="flex items-center justify-between rounded-2xl bg-secondary/60 p-3"><Button variant="ghost" size="icon" aria-label="Önceki ay" onClick={() => shiftedMonth(-1)}><ChevronLeft/></Button><span className="font-semibold capitalize">{monthTitle(month)}</span><Button variant="ghost" size="icon" aria-label="Sonraki ay" onClick={() => shiftedMonth(1)}><ChevronRight/></Button></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Hak edilen", earned], ["Avans", advanced], ["Ödenen", paid], ["Kalan", outstanding]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words font-bold">{amountText(Number(value), "TRY")}</p></div>)}</div>
      {monthCurrencies.map((c) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-sm" key={c}><strong>{currencyName[c] ?? c} ({c})</strong><span>Hak edilen {amountText(earnedByCurrency[c] ?? 0, c)} · Avans {amountText(advancesByCurrency[c] ?? 0, c)} · Ödenen {amountText(paymentsByCurrency[c] ?? 0, c)}</span></div>)}
      <div className="divide-y rounded-2xl border">{allRecords.map(({ r, type, amount }) => <div key={r.id} className="flex items-center gap-3 p-3"><div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${type === "payroll" ? "bg-emerald-500/10 text-emerald-700" : type === "payment" ? "bg-sky-500/10 text-sky-700" : "bg-amber-500/10 text-amber-700"}`}>{type === "payroll" ? <CalendarDays className="size-4"/> : type === "payment" ? <Wallet className="size-4"/> : <Banknote className="size-4"/>}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{String(r.payload.workplace_name ?? (type === "payment" ? "Ödeme" : type === "advance" ? "Avans" : "Çalışma"))}</p><p className="text-xs text-muted-foreground">{formatDate(String(r.payload.date))} · {type === "payroll" ? String(r.payload.status ?? "Çalışma") : type === "payment" ? "Ödeme kaydı" : "Avans"}{r.payload.notes ? ` · ${String(r.payload.notes)}` : ""}</p>{type === "payroll" && n(r.payload.overtime_hours) > 0 && <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="size-3"/>{n(r.payload.overtime_hours)} saat mesai × {n(r.payload.overtime_multiplier, 1.5)}</p>}</div><strong className={`whitespace-nowrap text-sm ${amount < 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{amountText(amount, String(r.payload.currency ?? "TRY"))}</strong>{me.data?.isUsta && <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => openEntry(type, String(r.payload.date), r)}>Düzenle</Button><Button size="icon" variant="ghost" aria-label="Kaydı sil" onClick={async () => { if (!confirm("Bu hareket silinsin mi?")) return; const { error } = await supabase.from("work_records").delete().eq("id", r.id); if (error) toast.error("Kayıt silinemedi."); else { toast.success("Kayıt silindi."); await Promise.all([payroll.refetch(), advances.refetch(), payments.refetch()]); } }}><X className="size-4"/></Button></div>}</div>)}
      {!allRecords.length && <p className="p-8 text-center text-sm text-muted-foreground">Bu ay için henüz yevmiye, avans veya ödeme kaydı yok.</p>}</div>
    </section>}

    <FormDrawer open={!!placeForm} onOpenChange={(open) => !open && setPlaceForm(null)} title={placeForm?.id ? "İşyerini düzenle" : "Yeni işyeri ekle"} busy={saveWorkplace.isPending} onSubmit={savePlace}>
      {placeForm && <div className="space-y-4">
        <div className="space-y-2"><Label htmlFor="wp-name">İşyeri adı *</Label><Input id="wp-name" required autoFocus placeholder="Örn. Merkez şantiye" value={String(placeForm.payload.name ?? "")} onChange={(e) => setPlaceForm({ ...placeForm, payload: { ...placeForm.payload, name: e.target.value } })}/></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="wp-type">Ücret tipi *</Label><select id="wp-type" className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={String(placeForm.payload.pay_type)} onChange={(e) => setPlaceForm({ ...placeForm, payload: { ...placeForm.payload, pay_type: e.target.value } })}><option value="daily">Günlük yevmiye</option><option value="hourly">Saatlik ücret</option></select></div><div className="space-y-2"><Label htmlFor="wp-currency">Para birimi *</Label><select id="wp-currency" className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={String(placeForm.payload.currency)} onChange={(e) => setPlaceForm({ ...placeForm, payload: { ...placeForm.payload, currency: e.target.value } })}>{CURRENCIES.map((c) => <option key={c} value={c}>{c} · {currencyName[c]}</option>)}</select></div></div>
        <div className="space-y-2"><Label htmlFor="wp-rate">{placeForm.payload.pay_type === "hourly" ? "Saatlik ücret" : "Günlük yevmiye"} *</Label><Input id="wp-rate" type="number" min="0.01" step="0.01" required inputMode="decimal" value={String(placeForm.payload.rate ?? "")} onChange={(e) => setPlaceForm({ ...placeForm, payload: { ...placeForm.payload, rate: e.target.value } })}/></div>
        {placeForm.payload.pay_type === "hourly" && <div className="space-y-2"><Label htmlFor="wp-hours">Günlük normal çalışma saati *</Label><Input id="wp-hours" type="number" min="1" max="24" step="0.5" value={String(placeForm.payload.daily_hours ?? 8)} onChange={(e) => setPlaceForm({ ...placeForm, payload: { ...placeForm.payload, daily_hours: e.target.value } })}/></div>}
        <div className="rounded-xl bg-secondary/60 p-3 text-sm">Günlük karşılığı: <strong>{amountText(String(placeForm.payload.pay_type) === "hourly" ? n(placeForm.payload.rate) * n(placeForm.payload.daily_hours, 8) : n(placeForm.payload.rate), String(placeForm.payload.currency))}</strong></div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">İsteğe bağlı bilgiler</p>
        <div className="space-y-2"><Label htmlFor="wp-contact">Yetkili kişi</Label><Input id="wp-contact" value={String(placeForm.payload.contact_name ?? "")} onChange={(e) => setPlaceForm({ ...placeForm, payload: { ...placeForm.payload, contact_name: e.target.value } })}/></div>
        <div className="space-y-2"><Label htmlFor="wp-phone">Telefon numarası</Label><Input id="wp-phone" type="tel" autoComplete="tel" value={String(placeForm.payload.phone ?? "")} onChange={(e) => setPlaceForm({ ...placeForm, payload: { ...placeForm.payload, phone: e.target.value } })}/></div>
        <div className="space-y-2"><Label htmlFor="wp-notes">Notlar</Label><textarea id="wp-notes" className="min-h-24 w-full rounded-xl border bg-background p-3 text-sm" value={String(placeForm.payload.notes ?? "")} onChange={(e) => setPlaceForm({ ...placeForm, payload: { ...placeForm.payload, notes: e.target.value } })}/></div>
      </div>}
    </FormDrawer>

    <FormDrawer open={!!entry} onOpenChange={(open) => !open && setEntry(null)} title={entry?.id ? "Hareketi düzenle" : entry?.kind === "payroll" ? "Çalışma kaydı ekle" : entry?.kind === "advance" ? "Avans kaydı" : "Ödeme kaydı"} busy={isBusy} onSubmit={saveEntry}>
      {entry && <div className="space-y-4">
        <div className="space-y-2"><Label htmlFor="entry-date">Tarih *</Label><Input id="entry-date" type="date" required value={String(entry.payload.date ?? selectedDate)} onChange={(e) => setEntryValue("date", e.target.value)}/></div>
        {entry.kind === "payroll" ? <>
          <div className="space-y-2"><Label htmlFor="entry-workplace">Çalışma kategorisi / işyeri *</Label><select id="entry-workplace" className="h-11 w-full rounded-xl border bg-background px-3 text-sm" required value={String(entry.payload.workplace_id ?? "")} onChange={(e) => selectWorkplace(e.target.value)}><option value="" disabled>İşyeri seçin</option>{workplaces.map((w) => <option key={w.id} value={w.id}>{String(w.payload.name)} · {amountText(String(w.payload.pay_type) === "hourly" ? n(w.payload.rate) * n(w.payload.daily_hours, 8) : n(w.payload.rate), String(w.payload.currency))}/gün</option>)}</select>{!workplaces.length && <p className="text-xs text-amber-700">Önce İşyeri sekmesinden bir işyeri ve ücret ekleyin.</p>}</div>
          <div className="space-y-2"><Label htmlFor="entry-job-link">İş bağlantısı <span className="font-normal text-muted-foreground">(opsiyonel · kârlılık hesabı)</span></Label><select id="entry-job-link" className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={String(entry.payload.job_id ?? "")} onChange={(e) => setEntryValue("job_id", e.target.value)}><option value="">İşe bağlama</option>{(jobsQuery.data ?? []).filter((j) => j.owner_id === (entry.owner_id || ownerId) && j.payload.status !== "Tamamlandı").map((j) => <option key={j.id} value={j.id}>{String(j.payload.title)} · {String(j.payload.date)}</option>)}</select></div>
          {me.data?.isUsta && <div className="space-y-2"><Label htmlFor="entry-employee">Çalışan *</Label><select id="entry-employee" className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={String(entry.owner_id || ownerId)} onChange={(e) => setEntry({ ...entry, owner_id: e.target.value })}>{members.map((m) => <option key={m.id} value={m.id}>{m.username}</option>)}</select></div>}
          <div className="space-y-3"><div className="flex items-center justify-between gap-3"><Label id="entry-days-label">Yevmiye durumu</Label><span className="text-xs text-muted-foreground">Günlük ücret: {amountText(n(entry.payload.rate), String(entry.payload.currency ?? "TRY"))}</span></div><div role="group" aria-labelledby="entry-days-label" className="grid grid-cols-2 gap-2 sm:grid-cols-3">{statuses.map((status) => { const selected = n(entry.payload.days, 1) === status.value; return <button type="button" key={status.value} aria-pressed={selected} onClick={() => setEntryValue("days", status.value)} className={`flex min-h-16 items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-left transition hover:-translate-y-0.5 ${status.tile} ${selected ? status.active : "hover:shadow-sm"}`}><span className="flex items-center gap-2"><span className="size-3 rounded-full bg-current"/><span className="text-sm font-semibold">{status.label}</span></span><span className="text-xs opacity-75">{status.value === 0 ? "0×" : `${String(status.value).replace(".", ",")}×`}</span></button>; })}</div></div>
          {n(entry.payload.days) === 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">Bu gün izinli olarak kaydedilecek; yevmiye tutarına eklenmez.</div>}
          {n(entry.payload.days) !== 0 && <>
            <div className="flex items-center justify-between rounded-xl border p-3"><div><p className="font-semibold">Mesai</p><p className="text-xs text-muted-foreground">İsteğe bağlı fazla çalışma</p></div><button type="button" role="switch" aria-checked={entry.payload.overtime_enabled === true} aria-label="Mesaiyi etkinleştir" onClick={() => setEntryValue("overtime_enabled", entry.payload.overtime_enabled !== true)} className={`relative h-7 w-12 rounded-full transition ${entry.payload.overtime_enabled === true ? "bg-emerald-600" : "bg-muted"}`}><span className={`absolute top-1 size-5 rounded-full bg-white transition ${entry.payload.overtime_enabled === true ? "left-6" : "left-1"}`}/></button></div>
            {entry.payload.overtime_enabled === true && <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[.04] p-3"><div className="grid grid-cols-[1fr_auto] items-end gap-2"><div className="space-y-2"><Label htmlFor="overtime-hours">Mesai süresi (saat)</Label><Input id="overtime-hours" type="number" min="0" step="0.25" inputMode="decimal" value={String(entry.payload.overtime_hours ?? 0)} onChange={(e) => setEntryValue("overtime_hours", Math.max(0, n(e.target.value)))}/></div><div className="flex items-center gap-1"><Button type="button" variant="secondary" size="icon" aria-label="Mesaiyi 15 dakika azalt" onClick={() => setEntryValue("overtime_hours", Math.max(0, n(entry.payload.overtime_hours) - 0.25))}><ChevronLeft/></Button><Button type="button" variant="secondary" size="icon" aria-label="Mesaiyi 15 dakika artır" onClick={() => setEntryValue("overtime_hours", n(entry.payload.overtime_hours) + 0.25)}><ChevronRight/></Button></div></div><div className="grid grid-cols-2 gap-3"><div><Label className="mb-2 block" htmlFor="overtime-multiplier">Mesai çarpanı</Label><select id="overtime-multiplier" className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={String(entry.payload.overtime_multiplier ?? 1.5)} onChange={(e) => setEntryValue("overtime_multiplier", Number(e.target.value))}><option value="1">×1</option><option value="1.5">×1,5</option><option value="2">×2</option></select></div><div><Label className="mb-2 block">Saat ücreti</Label><div className="flex h-11 items-center rounded-xl border bg-secondary/50 px-3 text-sm">{amountText(n(entry.payload.hourly_rate), String(entry.payload.currency ?? "TRY"))}</div></div></div><p className="text-xs text-muted-foreground">Normal ücret: {amountText(n(entry.payload.rate) * n(entry.payload.days), String(entry.payload.currency ?? "TRY"))} · Mesai: {amountText(n(entry.payload.overtime_hours) * n(entry.payload.hourly_rate) * n(entry.payload.overtime_multiplier, 1.5), String(entry.payload.currency ?? "TRY"))}</p></div>}
          </>}
          <div className="space-y-2"><Label htmlFor="entry-notes">Açıklama <span className="font-normal text-muted-foreground">(opsiyonel)</span></Label><textarea id="entry-notes" className="min-h-20 w-full rounded-xl border bg-background p-3 text-sm" value={String(entry.payload.notes ?? "")} onChange={(e) => setEntryValue("notes", e.target.value)}/></div>
          <div className="rounded-2xl bg-slate-950 p-4 text-white"><p className="text-xs text-slate-300">BU ÇALIŞMA İÇİN HAK EDİLEN</p><p className="mt-1 text-2xl font-bold">{amountText(payrollEntryAmount(entry.payload), String(entry.payload.currency ?? "TRY"))}</p></div>
        </> : <>
          {me.data?.isUsta && <div className="space-y-2"><Label htmlFor="money-employee">Çalışan *</Label><select id="money-employee" className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={String(entry.owner_id || ownerId)} onChange={(e) => setEntry({ ...entry, owner_id: e.target.value })}>{members.map((m) => <option key={m.id} value={m.id}>{m.username}</option>)}</select></div>}
          <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="money-amount">Tutar *</Label><Input id="money-amount" type="number" min="0.01" step="0.01" required inputMode="decimal" value={String(entry.payload.amount ?? "")} onChange={(e) => { setAdvanceConfirmed(false); setEntryValue("amount", e.target.value); }}/></div><div className="space-y-2"><Label htmlFor="money-currency">Para birimi</Label><select id="money-currency" className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={String(entry.payload.currency ?? "TRY")} onChange={(e) => { setAdvanceConfirmed(false); setEntryValue("currency", e.target.value); }}>{CURRENCIES.map((c) => <option value={c} key={c}>{c}</option>)}</select></div></div>
          {entry.kind === "advance" && advanceWouldExceed && <div role="alert" className="space-y-3 rounded-xl border-2 border-amber-500/60 bg-amber-500/10 p-3 text-sm"><p className="font-semibold text-amber-800 dark:text-amber-200">Avans, mevcut hak ediş bakiyesini aşacak.</p><p className="text-xs">Kullanılabilir hak ediş: {amountText(Math.max(0, availableAdvance), String(entry.payload.currency ?? "TRY"))}. Bu avans sonrası çalışan bakiyesi eksiye düşebilir.</p><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={advanceConfirmed} onChange={(e) => setAdvanceConfirmed(e.target.checked)}/><span>Bu avansı eksi bakiyeye rağmen onaylıyorum.</span></label></div>}
          <div className="space-y-2"><Label htmlFor="money-notes">Açıklama <span className="font-normal text-muted-foreground">(opsiyonel)</span></Label><textarea id="money-notes" className="min-h-20 w-full rounded-xl border bg-background p-3 text-sm" value={String(entry.payload.notes ?? "")} onChange={(e) => setEntryValue("notes", e.target.value)}/></div>
        </>}
      </div>}
    </FormDrawer>
  </div>;
}
