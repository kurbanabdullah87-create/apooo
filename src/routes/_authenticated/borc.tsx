import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, BellRing, CalendarClock, Check, ChevronDown, ChevronUp, CircleDollarSign, HandCoins, Plus, Trash2, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { pageHead } from "@/lib/work";
import { formatTL, todayISO } from "@/lib/finance";
import { supabase } from "@/integrations/supabase/client";
import { askNotifyPermission, notifySupported } from "@/lib/reminders";
import { CreditCardInstallments } from "@/components/app/CreditCardInstallments";

export const Route = createFileRoute("/_authenticated/borc")({
  head: () => pageHead("Borç & Alacak", "Borçlar, alacaklar ve taksit ödeme planı."),
  component: DebtPage,
});

type Direction = "receivable" | "payable";
type Debt = { id: string; direction: Direction; name: string; description: string; total_amount: number; acquired_on: string; installment_count: number; interval_months: number; first_due_on: string; created_at: string };
type Installment = { id: string; debt_id: string; installment_no: number; amount: number; due_on: string; paid_amount: number; paid_at: string | null };
type Payment = { id: string; debt_id: string; installment_id: string | null; amount: number; paid_on: string; note: string; created_at: string };
type PaymentPromise = { id: string; debt_id: string; installment_id: string; amount: number; paid_amount: number; promised_on: string; note: string; status: "open" | "fulfilled" | "cancelled"; fulfilled_payment_id: string | null; fulfilled_at: string | null; cancelled_at: string | null; created_at: string };
const EMPTY_INSTALLMENTS: Installment[] = [];
const EMPTY_DEBTS: Debt[] = [];

function monthDate(firstDate: string, monthOffset: number) {
  const [year = 1970, month = 1, day = 1] = firstDate.split("-").map(Number);
  const targetMonth = month - 1 + monthOffset;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function splitAmount(total: number, count: number) {
  const cents = Math.round(total * 100);
  const each = Math.floor(cents / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? cents - each * (count - 1) : each) / 100);
}

const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
const leftAmount = (i: Installment) => Math.max(0, Number(i.amount) - Number(i.paid_amount));

function DebtPage() {
  const qc = useQueryClient();
  const [section, setSection] = useState<"debts" | "credit-cards">("debts");
  const [direction, setDirection] = useState<Direction>("receivable");
  const [forecastDays, setForecastDays] = useState<7 | 30 | 90>(30);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [payItem, setPayItem] = useState<{ debt: Debt; installment: Installment } | null>(null);
  const [promiseItem, setPromiseItem] = useState<{ debt: Debt; installment: Installment } | null>(null);
  const [promiseForm, setPromiseForm] = useState({ amount: "", promised_on: todayISO(), note: "" });
  const [form, setForm] = useState({ direction: "receivable" as Direction, name: "", description: "", total_amount: "", acquired_on: todayISO(), installment_count: "1", interval_months: "1", first_due_on: todayISO() });
  const [payment, setPayment] = useState({ amount: "", paid_on: todayISO(), note: "" });

  const debts = useQuery({ queryKey: ["debt-records"], queryFn: async () => {
    const { data, error } = await supabase.from("debt_records").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Debt[];
  }});
  const installments = useQuery({ queryKey: ["debt-installments"], queryFn: async () => {
    const { data, error } = await supabase.from("debt_installments").select("*").order("due_on");
    if (error) throw error;
    return (data ?? []) as Installment[];
  }});
  const payments = useQuery({ queryKey: ["debt-payments"], queryFn: async () => {
    const { data, error } = await supabase.from("debt_payments").select("*").order("paid_on", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Payment[];
  }});
  const promises = useQuery({ queryKey: ["debt-payment-promises"], queryFn: async () => {
    const { data, error } = await supabase.from("debt_payment_promises").select("*").order("promised_on");
    if (error) throw error;
    return (data ?? []) as PaymentPromise[];
  }});

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["debt-records"] }), qc.invalidateQueries({ queryKey: ["debt-installments"] }), qc.invalidateQueries({ queryKey: ["debt-payments"] }), qc.invalidateQueries({ queryKey: ["debt-payment-promises"] }),
  ]);
  const saveDebt = useMutation({ mutationFn: async () => {
    const amount = Number(form.total_amount);
    const count = Number(form.installment_count);
    if (!form.name.trim() || !(amount > 0) || !Number.isInteger(count) || count < 1 || count > 360) throw new Error("Adı, geçerli tutarı ve taksit sayısını girin.");
    const { data: debt, error } = await supabase.from("debt_records").insert({ direction: form.direction, name: form.name.trim(), description: form.description.trim(), total_amount: amount, acquired_on: form.acquired_on, installment_count: count, interval_months: Number(form.interval_months), first_due_on: form.first_due_on }).select("id").single();
    if (error) throw error;
    const parts = splitAmount(amount, count);
    const rows = parts.map((part, index) => ({ debt_id: debt.id, installment_no: index + 1, amount: part, due_on: monthDate(form.first_due_on, index * Number(form.interval_months)) }));
    const result = await supabase.from("debt_installments").insert(rows);
    if (result.error) {
      await supabase.from("debt_records").delete().eq("id", debt.id);
      throw result.error;
    }
  }, onSuccess: () => { void refresh(); setAddOpen(false); setForm((f) => ({ ...f, name: "", description: "", total_amount: "", installment_count: "1" })); toast.success("Borç / alacak kaydedildi"); }, onError: (error: Error) => toast.error(error.message) });

  const addPayment = useMutation({ mutationFn: async () => {
    if (!payItem) throw new Error("Taksit seçilmedi.");
    const amount = Number(payment.amount);
    if (!(amount > 0)) throw new Error("Geçerli bir ödeme tutarı girin.");
    const { error } = await supabase.rpc("record_debt_payment", { _debt_id: payItem.debt.id, _installment_id: payItem.installment.id, _amount: amount, _paid_on: payment.paid_on, _note: payment.note.trim() });
    if (error) throw error;
  }, onSuccess: () => { void refresh(); setPayItem(null); setPayment({ amount: "", paid_on: todayISO(), note: "" }); toast.success("Ödeme işlendi"); }, onError: (error: Error) => toast.error(error.message) });

  const createPromise = useMutation({ mutationFn: async () => {
    if (!promiseItem) throw new Error("Taksit seçilmedi.");
    const amount = Number(promiseForm.amount);
    if (!(amount > 0) || amount > leftAmount(promiseItem.installment)) throw new Error("Söz tutarı, taksitin kalan tutarından büyük olamaz.");
    const { error } = await supabase.rpc("create_debt_payment_promise", {
      _debt_id: promiseItem.debt.id,
      _installment_id: promiseItem.installment.id,
      _amount: amount,
      _promised_on: promiseForm.promised_on,
      _note: promiseForm.note.trim(),
    });
    if (error) throw error;
  }, onSuccess: () => { void refresh(); setPromiseItem(null); setPromiseForm({ amount: "", promised_on: todayISO(), note: "" }); toast.success("Ödeme sözü takibe alındı"); }, onError: (error: Error) => toast.error(error.message) });

  const cancelPromise = useMutation({ mutationFn: async (promiseId: string) => {
    const { error } = await supabase.rpc("cancel_debt_payment_promise", { _promise_id: promiseId });
    if (error) throw error;
  }, onSuccess: () => { void refresh(); toast.success("Ödeme sözü iptal edildi"); }, onError: (error: Error) => toast.error(error.message) });

  const removeDebt = useMutation({ mutationFn: async (id: string) => {
    const { error } = await supabase.from("debt_records").delete().eq("id", id);
    if (error) throw error;
  }, onSuccess: () => { void refresh(); toast.success("Kayıt silindi"); }, onError: (error: Error) => toast.error(error.message) });

  const rows = debts.data ?? EMPTY_DEBTS;
  const dueRows = installments.data ?? EMPTY_INSTALLMENTS;
  const paymentRows = payments.data ?? [];
  const promiseRows = promises.data ?? [];
  const visibleRows = rows.filter((d) => d.direction === direction);
  const outstanding = (d: Debt) => dueRows.filter((i) => i.debt_id === d.id).reduce((sum, i) => sum + leftAmount(i), 0);
  const collectTotal = rows.filter((d) => d.direction === "receivable").reduce((s, d) => s + outstanding(d), 0);
  const payTotal = rows.filter((d) => d.direction === "payable").reduce((s, d) => s + outstanding(d), 0);
  const today = todayISO();
  const week = new Date(`${today}T12:00:00`);
  week.setDate(week.getDate() + 7);
  const weekDate = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, "0")}-${String(week.getDate()).padStart(2, "0")}`;
  const forecastEnd = new Date(`${today}T12:00:00`);
  forecastEnd.setDate(forecastEnd.getDate() + forecastDays);
  const forecastEndISO = `${forecastEnd.getFullYear()}-${String(forecastEnd.getMonth() + 1).padStart(2, "0")}-${String(forecastEnd.getDate()).padStart(2, "0")}`;
  const plannedReceivable = dueRows.filter((item) => item.due_on >= today && item.due_on <= forecastEndISO && leftAmount(item) > 0 && rows.find((debt) => debt.id === item.debt_id)?.direction === "receivable").reduce((sum, item) => sum + leftAmount(item), 0);
  const plannedPayable = dueRows.filter((item) => item.due_on >= today && item.due_on <= forecastEndISO && leftAmount(item) > 0 && rows.find((debt) => debt.id === item.debt_id)?.direction === "payable").reduce((sum, item) => sum + leftAmount(item), 0);
  const paidOnReceivableSchedule = dueRows.filter((item) => item.due_on >= today && item.due_on <= forecastEndISO && rows.find((debt) => debt.id === item.debt_id)?.direction === "receivable").reduce((sum, item) => sum + Number(item.paid_amount), 0);
  const paidOnPayableSchedule = dueRows.filter((item) => item.due_on >= today && item.due_on <= forecastEndISO && rows.find((debt) => debt.id === item.debt_id)?.direction === "payable").reduce((sum, item) => sum + Number(item.paid_amount), 0);
  const upcoming = useMemo(() => dueRows.filter((i) => leftAmount(i) > 0 && i.due_on >= today && i.due_on <= weekDate && rows.find((debt) => debt.id === i.debt_id)?.direction === direction).sort((a, b) => a.due_on.localeCompare(b.due_on)), [dueRows, direction, rows, today, weekDate]);
  const activePromises = promiseRows.filter((promise) => promise.status === "open" && rows.find((debt) => debt.id === promise.debt_id)?.direction === direction);
  const upcomingPromises = activePromises.filter((promise) => promise.promised_on >= today && promise.promised_on <= weekDate).sort((a, b) => a.promised_on.localeCompare(b.promised_on));
  const ageInDays = (dueOn: string) => Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueOn}T00:00:00Z`)) / 86_400_000));
  const receivableAging = direction === "receivable" ? [
    { label: "1–30 gün", days: (age: number) => age >= 1 && age <= 30 },
    { label: "31–60 gün", days: (age: number) => age >= 31 && age <= 60 },
    { label: "61–90 gün", days: (age: number) => age >= 61 && age <= 90 },
    { label: "90+ gün", days: (age: number) => age > 90 },
  ].map((bucket) => {
    const items = dueRows.filter((installment) => {
      const debt = rows.find((item) => item.id === installment.debt_id);
      const age = ageInDays(installment.due_on);
      return debt?.direction === "receivable" && leftAmount(installment) > 0 && bucket.days(age);
    });
    return { ...bucket, amount: items.reduce((sum, item) => sum + leftAmount(item), 0), count: items.length };
  }) : [];
  const titleById = new Map(rows.map((d) => [d.id, d]));

  return <div className="space-y-4 pb-8">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight">Borç & Alacak</h1><p className="mt-1 text-sm text-muted-foreground">Borçlarını, alacaklarını ve kredi kartı taksitlerini ayrı takip et.</p></div>{section === "debts" && <Button onClick={() => { setForm((f) => ({ ...f, direction })); setAddOpen(true); }}><Plus className="mr-1 size-4"/>Yeni kayıt</Button>}</div>

    <div className="grid grid-cols-2 rounded-xl bg-muted p-1"><button onClick={() => setSection("debts")} className={`rounded-lg px-3 py-2 text-sm font-medium ${section === "debts" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Borç & Alacak</button><button onClick={() => setSection("credit-cards")} className={`rounded-lg px-3 py-2 text-sm font-medium ${section === "credit-cards" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Kredi Kartı Taksitleri</button></div>

    {section === "credit-cards" ? <CreditCardInstallments/> : <>

    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowDownLeft className="size-4 text-emerald-600"/>Tahsil edeceğim</div><p className="mt-2 text-xl font-bold">{formatTL(collectTotal)}</p></div>
      <div className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowUpRight className="size-4 text-rose-600"/>Ödeyeceğim</div><p className="mt-2 text-xl font-bold">{formatTL(payTotal)}</p></div>
    </div>

    <section className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-semibold">Vade planı</h2><p className="mt-1 text-xs text-muted-foreground">Açık taksit vadelerine göre. Kesin tahsilat veya banka bakiyesi değildir.</p></div>
        <div className="flex rounded-lg bg-muted p-1" aria-label="Vade planı dönemi">
          {([7, 30, 90] as const).map((days) => <button key={days} type="button" aria-pressed={forecastDays === days} onClick={() => setForecastDays(days)} className={`min-h-9 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${forecastDays === days ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{days} gün</button>)}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3"><p className="text-xs text-muted-foreground">Açık vade tahsilatı</p><p className="num mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-300">{formatTL(plannedReceivable)}</p><p className="mt-1 text-[11px] text-muted-foreground">Bu dönemin taksitlerinde {formatTL(paidOnReceivableSchedule)} tahsil edildi</p></div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-3"><p className="text-xs text-muted-foreground">Açık vade ödemesi</p><p className="num mt-1 text-lg font-semibold text-rose-700 dark:text-rose-300">{formatTL(plannedPayable)}</p><p className="mt-1 text-[11px] text-muted-foreground">Bu dönemin taksitlerinde {formatTL(paidOnPayableSchedule)} ödendi</p></div>
      </div>
    </section>

    {direction === "receivable" && <section className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">Gecikmiş alacak yaşlandırması</h2><p className="mt-1 text-xs text-muted-foreground">Vadesi geçen, henüz kapanmamış taksitler</p></div><Clock3 className="size-5 text-muted-foreground"/></div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{receivableAging.map((bucket) => <div key={bucket.label} className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">{bucket.label}</p><p className="num mt-1 font-semibold">{formatTL(bucket.amount)}</p><p className="mt-1 text-[11px] text-muted-foreground">{bucket.count} açık taksit</p></div>)}</div>
    </section>}

    {(upcoming.length > 0 || upcomingPromises.length > 0) && <section className="rounded-2xl border border-amber-300/70 bg-amber-50/60 p-4 dark:bg-amber-950/20"><div className="flex items-start gap-3"><BellRing className="mt-0.5 size-5 shrink-0 text-amber-600"/><div className="min-w-0 flex-1"><h2 className="font-semibold">Bu haftanın tahsilat planı</h2><p className="mt-1 text-xs text-muted-foreground">Taksit vadeleri ve verilen ödeme sözleri</p>{upcoming.length > 0 && <div className="mt-3 space-y-2">{upcoming.slice(0, 4).map((i) => { const d = titleById.get(i.debt_id); return <div key={i.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{d?.name} · {i.installment_no}/{d?.installment_count}. taksit · {dateLabel(i.due_on)}</span><strong className="num shrink-0">{formatTL(leftAmount(i))}</strong></div>; })}</div>}{upcomingPromises.length > 0 && <div className="mt-3 border-t border-amber-900/10 pt-3"><p className="mb-2 text-xs font-semibold">Ödeme sözleri</p><div className="space-y-2">{upcomingPromises.slice(0, 4).map((promise) => { const debt = titleById.get(promise.debt_id); return <div key={promise.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{debt?.name} · söz {dateLabel(promise.promised_on)}</span><strong className="num shrink-0">{formatTL(Math.max(0, Number(promise.amount) - Number(promise.paid_amount)))}</strong></div>; })}</div></div>}</div></div></section>}

    <div className="grid grid-cols-2 rounded-xl bg-muted p-1"><button onClick={() => setDirection("receivable")} className={`rounded-lg px-3 py-2 text-sm font-medium ${direction === "receivable" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Bana borçlu</button><button onClick={() => setDirection("payable")} className={`rounded-lg px-3 py-2 text-sm font-medium ${direction === "payable" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Benim borcum</button></div>

    {debts.isLoading || installments.isLoading || promises.isLoading ? <div className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">Kayıtlar yükleniyor…</div> : debts.isError || installments.isError || promises.isError ? <div className="rounded-2xl border border-destructive/40 p-5 text-sm text-destructive">Kayıtlar alınamadı. Sayfayı yenileyip tekrar deneyin.</div> : visibleRows.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center"><HandCoins className="mx-auto size-8 text-muted-foreground"/><p className="mt-2 font-medium">Henüz kayıt yok</p><p className="mt-1 text-sm text-muted-foreground">Borç, alacak veya taksit planı eklemek için “Yeni kayıt”a dokunun.</p></div> : <div className="space-y-3">{visibleRows.map((d) => {
      const parts = dueRows.filter((i) => i.debt_id === d.id).sort((a, b) => a.installment_no - b.installment_no);
      const openParts = parts.filter((i) => leftAmount(i) > 0);
      const overdueBalance = parts.filter((i) => i.due_on < today && leftAmount(i) > 0).reduce((sum, i) => sum + leftAmount(i), 0);
      const overdueCount = parts.filter((i) => i.due_on < today && leftAmount(i) > 0).length;
      const isExpanded = expanded === d.id;
      const paid = parts.reduce((s, i) => s + Number(i.paid_amount), 0);
      const debtPayments = paymentRows.filter((p) => p.debt_id === d.id).slice(0, 3);
      return <article key={d.id} className="overflow-hidden rounded-2xl border bg-card">
        <button type="button" onClick={() => setExpanded(isExpanded ? null : d.id)} className="flex w-full items-start gap-3 p-4 text-left"><span className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ${direction === "receivable" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>{direction === "receivable" ? <ArrowDownLeft className="size-5"/> : <ArrowUpRight className="size-5"/>}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate">{d.name}</strong><strong className="shrink-0">{formatTL(outstanding(d))}</strong></span><span className="mt-1 block truncate text-xs text-muted-foreground">{d.description || (direction === "payable" ? "Ödeme planı" : "Tahsilat takibi")} · {formatTL(d.total_amount)} toplam</span><span className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground"><span>{d.installment_count} taksit</span><span>{formatTL(paid)} ödendi</span><span>{openParts.length ? `Sıradaki: ${dateLabel(openParts[0]!.due_on)}` : "Tamamlandı"}</span>{overdueCount > 0 && <span className="font-semibold text-destructive">{overdueCount} gecikmiş · {formatTL(overdueBalance)}</span>}</span></span>{isExpanded ? <ChevronUp className="mt-1 size-4 text-muted-foreground"/> : <ChevronDown className="mt-1 size-4 text-muted-foreground"/>}</button>
        {isExpanded && <div className="border-t px-4 pb-4"><div className="flex flex-wrap gap-x-4 gap-y-1 py-3 text-xs text-muted-foreground"><span>Alınma: {dateLabel(d.acquired_on)}</span><span>İlk vade: {dateLabel(d.first_due_on)}</span><span>{d.interval_months === 1 ? "Aylık" : `${d.interval_months} ayda bir`}</span></div><div className="space-y-2">{parts.map((i) => {
          const installmentPromises = promiseRows.filter((promise) => promise.installment_id === i.id);
          const hasOpenPromise = installmentPromises.some((promise) => promise.status === "open");
          return <div key={i.id} className="rounded-xl bg-muted/60 px-3 py-2.5"><div className="flex flex-wrap items-center gap-2"><CalendarClock className={`size-4 shrink-0 ${leftAmount(i) === 0 ? "text-emerald-600" : i.due_on < today ? "text-destructive" : "text-muted-foreground"}`}/><div className="min-w-0 flex-1"><p className="text-sm font-medium">{i.installment_no}. taksit · {formatTL(i.amount)}</p><p className="text-xs text-muted-foreground">Vade {dateLabel(i.due_on)}{i.paid_amount > 0 ? ` · ${formatTL(i.paid_amount)} ödendi` : ""}{i.due_on < today && leftAmount(i) > 0 ? " · Gecikti" : ""}</p></div>{leftAmount(i) > 0 ? <div className="flex gap-1"><Button size="sm" variant="ghost" disabled={hasOpenPromise} aria-label={hasOpenPromise ? "Bu taksit için açık ödeme sözü var" : "Ödeme sözü ekle"} onClick={() => { setPromiseItem({ debt: d, installment: i }); setPromiseForm({ amount: String(leftAmount(i)), promised_on: i.due_on >= today ? i.due_on : today, note: "" }); }}>{hasOpenPromise ? "Söz aktif" : "Ödeme sözü"}</Button><Button size="sm" variant="outline" onClick={() => { setPayItem({ debt: d, installment: i }); setPayment({ amount: String(leftAmount(i)), paid_on: todayISO(), note: "" }); }}>Ödeme gir</Button></div> : <Check className="size-4 text-emerald-600"/>}</div>{installmentPromises.length > 0 && <div className="mt-2 space-y-2 border-t border-border/70 pt-2">{installmentPromises.map((promise) => <div key={promise.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><div className="min-w-0"><p className={`font-medium ${promise.status === "fulfilled" ? "text-emerald-700 dark:text-emerald-300" : promise.status === "cancelled" ? "text-muted-foreground line-through" : promise.promised_on < today ? "text-destructive" : "text-foreground"}`}>{promise.status === "fulfilled" ? "Söz karşılandı" : promise.status === "cancelled" ? "Söz iptal edildi" : promise.promised_on < today ? "Söz tarihi geçti" : "Ödeme sözü"} · {formatTL(promise.amount)} · {dateLabel(promise.promised_on)}{promise.paid_amount > 0 && promise.status === "open" ? ` · ${formatTL(promise.paid_amount)} ödendi` : ""}</p>{promise.note && <p className="mt-0.5 truncate text-muted-foreground">{promise.note}</p>}</div>{promise.status === "open" && <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => { setPayItem({ debt: d, installment: i }); setPayment({ amount: String(Math.min(leftAmount(i), Math.max(0.01, Number(promise.amount) - Number(promise.paid_amount)))), paid_on: todayISO(), note: "Ödeme sözü" }); }}>Ödemeyi gir</Button><Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => cancelPromise.mutate(promise.id)}>İptal</Button></div>}</div>)}</div>}</div>;
        })}</div>{debtPayments.length > 0 && <div className="mt-3 rounded-xl border p-3"><p className="mb-2 text-xs font-semibold text-muted-foreground">SON ÖDEMELER</p>{debtPayments.map((p) => <div key={p.id} className="flex justify-between py-1 text-xs"><span>{dateLabel(p.paid_on)}{p.note ? ` · ${p.note}` : ""}</span><strong>{formatTL(p.amount)}</strong></div>)}</div>}<Button variant="ghost" size="sm" className="mt-2 text-destructive" onClick={() => { if (window.confirm(`“${d.name}” kaydı ve taksitleri silinsin mi?`)) removeDebt.mutate(d.id); }}><Trash2 className="mr-1 size-3.5"/>Kaydı sil</Button></div>}
      </article>;
    })}</div>}

    <div className="rounded-2xl border bg-muted/30 p-4"><div className="flex gap-3"><CircleDollarSign className="mt-0.5 size-5 shrink-0 text-primary"/><div><p className="text-sm font-semibold">Ödeme hatırlatmaları</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Vade günü gelen ve geciken taksitler bildirim merkezinde görünür. Telefon bildirimi için izin verebilirsin; uygulama açıkken vade uyarısı da gösterilir.</p>{notifySupported() && Notification.permission !== "granted" && <Button size="sm" variant="outline" className="mt-3" onClick={async () => { const result = await askNotifyPermission(); toast[result === "granted" ? "success" : "error"](result === "granted" ? "Bildirimler açıldı" : "Tarayıcı bildirim izni verilmedi"); }}><BellRing className="mr-1 size-4"/>Telefon bildirimlerini aç</Button>}</div></div></div>

    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Yeni borç / alacak</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveDebt.mutate(); }}><div className="grid grid-cols-2 rounded-lg bg-muted p-1"><button type="button" onClick={() => setForm({ ...form, direction: "receivable" })} className={`rounded-md py-2 text-sm ${form.direction === "receivable" ? "bg-background shadow" : "text-muted-foreground"}`}>Bana borçlu</button><button type="button" onClick={() => setForm({ ...form, direction: "payable" })} className={`rounded-md py-2 text-sm ${form.direction === "payable" ? "bg-background shadow" : "text-muted-foreground"}`}>Ben borçluyum</button></div><div className="space-y-2"><Label>Kişi, kurum veya makine adı *</Label><Input required placeholder="Örn. Ali Yılmaz / Ekskavatör" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/></div><div className="space-y-2"><Label>Toplam tutar (₺) *</Label><Input required type="number" min="0.01" step="0.01" placeholder="0,00" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })}/></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Alınma tarihi</Label><Input type="date" value={form.acquired_on} onChange={(e) => setForm({ ...form, acquired_on: e.target.value })}/></div><div className="space-y-2"><Label>Taksit sayısı</Label><Input type="number" min="1" max="360" value={form.installment_count} onChange={(e) => setForm({ ...form, installment_count: e.target.value })}/></div></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>İlk taksit vadesi</Label><Input type="date" value={form.first_due_on} onChange={(e) => setForm({ ...form, first_due_on: e.target.value })}/></div><div className="space-y-2"><Label>Taksit aralığı (ay)</Label><Input type="number" min="1" max="12" value={form.interval_months} onChange={(e) => setForm({ ...form, interval_months: e.target.value })}/></div></div><div className="space-y-2"><Label>Açıklama / not</Label><Textarea rows={2} placeholder="Örn. marka-model, alacak nedeni, ödeme koşulu" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/></div><p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{Number(form.installment_count) > 0 && Number(form.total_amount) > 0 ? `${form.installment_count} taksit · yaklaşık ${formatTL(Number(form.total_amount) / Number(form.installment_count))} / taksit. Kuruş farkı son taksite eklenir.` : "Taksit tutarları ve vadeler otomatik oluşturulur."}</p><Button type="submit" className="w-full" disabled={saveDebt.isPending}>{saveDebt.isPending ? "Kaydediliyor…" : "Kaydet ve taksit planı oluştur"}</Button></form></DialogContent></Dialog>

    <Dialog open={Boolean(promiseItem)} onOpenChange={(open) => { if (!open) setPromiseItem(null); }}><DialogContent><DialogHeader><DialogTitle>Ödeme sözü ekle</DialogTitle></DialogHeader>{promiseItem && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); createPromise.mutate(); }}><div className="rounded-xl bg-muted p-3 text-sm"><strong>{promiseItem.debt.name}</strong><p className="mt-1 text-xs text-muted-foreground">{promiseItem.installment.installment_no}/{promiseItem.debt.installment_count}. taksit · kalan {formatTL(leftAmount(promiseItem.installment))}</p></div><div className="space-y-2"><Label htmlFor="promise-amount">Söz verilen tutar (₺) *</Label><Input id="promise-amount" type="number" min="0.01" max={leftAmount(promiseItem.installment)} step="0.01" required value={promiseForm.amount} onChange={(event) => setPromiseForm({ ...promiseForm, amount: event.target.value })}/><p className="text-xs text-muted-foreground">Bu kayıt tahsilat/ödeme değildir; fiili ödeme ayrıca işlenir.</p></div><div className="space-y-2"><Label htmlFor="promise-date">Ödeme sözü tarihi *</Label><Input id="promise-date" type="date" min={today} required value={promiseForm.promised_on} onChange={(event) => setPromiseForm({ ...promiseForm, promised_on: event.target.value })}/></div><div className="space-y-2"><Label htmlFor="promise-note">Not</Label><Input id="promise-note" maxLength={240} placeholder="Örn. cuma günü havale edecek" value={promiseForm.note} onChange={(event) => setPromiseForm({ ...promiseForm, note: event.target.value })}/></div><Button type="submit" className="w-full" disabled={createPromise.isPending}>{createPromise.isPending ? "Kaydediliyor…" : "Sözü takibe al"}</Button></form>}</DialogContent></Dialog>

    <Dialog open={Boolean(payItem)} onOpenChange={(open) => { if (!open) setPayItem(null); }}><DialogContent><DialogHeader><DialogTitle>Taksit ödemesi kaydet</DialogTitle></DialogHeader>{payItem && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); addPayment.mutate(); }}><div className="rounded-xl bg-muted p-3 text-sm"><strong>{payItem.debt.name}</strong><p className="mt-1 text-muted-foreground">{payItem.installment.installment_no}/{payItem.debt.installment_count}. taksit · kalan {formatTL(leftAmount(payItem.installment))} · vade {dateLabel(payItem.installment.due_on)}</p></div><div className="space-y-2"><Label>Ödenen tutar (₺)</Label><Input type="number" min="0.01" max={leftAmount(payItem.installment)} step="0.01" required value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })}/></div><div className="space-y-2"><Label>Ödeme tarihi</Label><Input type="date" required value={payment.paid_on} onChange={(e) => setPayment({ ...payment, paid_on: e.target.value })}/></div><div className="space-y-2"><Label>Not (isteğe bağlı)</Label><Input placeholder="Örn. banka havalesi" value={payment.note} onChange={(e) => setPayment({ ...payment, note: e.target.value })}/></div><Button className="w-full" type="submit" disabled={addPayment.isPending}>{addPayment.isPending ? "Kaydediliyor…" : "Ödemeyi kaydet"}</Button></form>}</DialogContent></Dialog>
    </>}
  </div>;
}
