import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, BellRing, CalendarClock, Check, ChevronDown, ChevronUp, CircleDollarSign, HandCoins, Plus, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/borc")({
  head: () => pageHead("Borç & Alacak", "Borçlar, alacaklar ve taksit ödeme planı."),
  component: DebtPage,
});

type Direction = "receivable" | "payable";
type Debt = { id: string; direction: Direction; name: string; description: string; total_amount: number; acquired_on: string; installment_count: number; interval_months: number; first_due_on: string; created_at: string };
type Installment = { id: string; debt_id: string; installment_no: number; amount: number; due_on: string; paid_amount: number; paid_at: string | null };
type Payment = { id: string; debt_id: string; installment_id: string | null; amount: number; paid_on: string; note: string };
const EMPTY_INSTALLMENTS: Installment[] = [];

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
  const [direction, setDirection] = useState<Direction>("receivable");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [payItem, setPayItem] = useState<{ debt: Debt; installment: Installment } | null>(null);
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

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["debt-records"] }), qc.invalidateQueries({ queryKey: ["debt-installments"] }), qc.invalidateQueries({ queryKey: ["debt-payments"] }),
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

  const removeDebt = useMutation({ mutationFn: async (id: string) => {
    const { error } = await supabase.from("debt_records").delete().eq("id", id);
    if (error) throw error;
  }, onSuccess: () => { void refresh(); toast.success("Kayıt silindi"); }, onError: (error: Error) => toast.error(error.message) });

  const rows = debts.data ?? [];
  const dueRows = installments.data ?? EMPTY_INSTALLMENTS;
  const paymentRows = payments.data ?? [];
  const visibleRows = rows.filter((d) => d.direction === direction);
  const outstanding = (d: Debt) => dueRows.filter((i) => i.debt_id === d.id).reduce((sum, i) => sum + leftAmount(i), 0);
  const collectTotal = rows.filter((d) => d.direction === "receivable").reduce((s, d) => s + outstanding(d), 0);
  const payTotal = rows.filter((d) => d.direction === "payable").reduce((s, d) => s + outstanding(d), 0);
  const today = todayISO();
  const week = new Date(`${today}T12:00:00`);
  week.setDate(week.getDate() + 7);
  const weekDate = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, "0")}-${String(week.getDate()).padStart(2, "0")}`;
  const upcoming = useMemo(() => dueRows.filter((i) => leftAmount(i) > 0 && i.due_on <= weekDate).sort((a, b) => a.due_on.localeCompare(b.due_on)), [dueRows, weekDate]);
  const titleById = new Map(rows.map((d) => [d.id, d]));

  return <div className="space-y-4 pb-8">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight">Borç & Alacak</h1><p className="mt-1 text-sm text-muted-foreground">Kimin ne kadar borcu var, hangi ödeme ne zaman geliyor?</p></div><Button onClick={() => { setForm((f) => ({ ...f, direction })); setAddOpen(true); }}><Plus className="mr-1 size-4"/>Yeni kayıt</Button></div>

    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowDownLeft className="size-4 text-emerald-600"/>Tahsil edeceğim</div><p className="mt-2 text-xl font-bold">{formatTL(collectTotal)}</p></div>
      <div className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowUpRight className="size-4 text-rose-600"/>Ödeyeceğim</div><p className="mt-2 text-xl font-bold">{formatTL(payTotal)}</p></div>
    </div>

    {upcoming.length > 0 && <section className="rounded-2xl border border-amber-300/70 bg-amber-50/60 p-4 dark:bg-amber-950/20"><div className="flex items-start gap-3"><BellRing className="mt-0.5 size-5 shrink-0 text-amber-600"/><div className="min-w-0 flex-1"><h2 className="font-semibold">Vadesi gelen / yaklaşan ödemeler</h2><div className="mt-2 space-y-2">{upcoming.slice(0, 4).map((i) => { const d = titleById.get(i.debt_id); return <div key={i.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{d?.name} · {i.installment_no}/{d?.installment_count}. taksit · {dateLabel(i.due_on)}</span><strong className="shrink-0">{formatTL(leftAmount(i))}</strong></div>; })}</div></div></div></section>}

    <div className="grid grid-cols-2 rounded-xl bg-muted p-1"><button onClick={() => setDirection("receivable")} className={`rounded-lg px-3 py-2 text-sm font-medium ${direction === "receivable" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Bana borçlu</button><button onClick={() => setDirection("payable")} className={`rounded-lg px-3 py-2 text-sm font-medium ${direction === "payable" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Benim borcum</button></div>

    {debts.isLoading || installments.isLoading ? <div className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">Kayıtlar yükleniyor…</div> : debts.isError || installments.isError ? <div className="rounded-2xl border border-destructive/40 p-5 text-sm text-destructive">Kayıtlar alınamadı. Sayfayı yenileyip tekrar deneyin.</div> : visibleRows.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center"><HandCoins className="mx-auto size-8 text-muted-foreground"/><p className="mt-2 font-medium">Henüz kayıt yok</p><p className="mt-1 text-sm text-muted-foreground">Borç, alacak veya taksit planı eklemek için “Yeni kayıt”a dokunun.</p></div> : <div className="space-y-3">{visibleRows.map((d) => {
      const parts = dueRows.filter((i) => i.debt_id === d.id).sort((a, b) => a.installment_no - b.installment_no);
      const openParts = parts.filter((i) => leftAmount(i) > 0);
      const isExpanded = expanded === d.id;
      const paid = parts.reduce((s, i) => s + Number(i.paid_amount), 0);
      const debtPayments = paymentRows.filter((p) => p.debt_id === d.id).slice(0, 3);
      return <article key={d.id} className="overflow-hidden rounded-2xl border bg-card">
        <button type="button" onClick={() => setExpanded(isExpanded ? null : d.id)} className="flex w-full items-start gap-3 p-4 text-left"><span className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ${direction === "receivable" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>{direction === "receivable" ? <ArrowDownLeft className="size-5"/> : <ArrowUpRight className="size-5"/>}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate">{d.name}</strong><strong className="shrink-0">{formatTL(outstanding(d))}</strong></span><span className="mt-1 block truncate text-xs text-muted-foreground">{d.description || (direction === "payable" ? "Ödeme planı" : "Tahsilat takibi")} · {formatTL(d.total_amount)} toplam</span><span className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground"><span>{d.installment_count} taksit</span><span>{formatTL(paid)} ödendi</span><span>{openParts.length ? `Sıradaki: ${dateLabel(openParts[0]!.due_on)}` : "Tamamlandı"}</span></span></span>{isExpanded ? <ChevronUp className="mt-1 size-4 text-muted-foreground"/> : <ChevronDown className="mt-1 size-4 text-muted-foreground"/>}</button>
        {isExpanded && <div className="border-t px-4 pb-4"><div className="flex flex-wrap gap-x-4 gap-y-1 py-3 text-xs text-muted-foreground"><span>Alınma: {dateLabel(d.acquired_on)}</span><span>İlk vade: {dateLabel(d.first_due_on)}</span><span>{d.interval_months === 1 ? "Aylık" : `${d.interval_months} ayda bir`}</span></div><div className="space-y-2">{parts.map((i) => <div key={i.id} className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2.5"><CalendarClock className={`size-4 shrink-0 ${leftAmount(i) === 0 ? "text-emerald-600" : i.due_on < today ? "text-destructive" : "text-muted-foreground"}`}/><div className="min-w-0 flex-1"><p className="text-sm font-medium">{i.installment_no}. taksit · {formatTL(i.amount)}</p><p className="text-xs text-muted-foreground">Vade {dateLabel(i.due_on)}{i.paid_amount > 0 ? ` · ${formatTL(i.paid_amount)} ödendi` : ""}{i.due_on < today && leftAmount(i) > 0 ? " · Gecikti" : ""}</p></div>{leftAmount(i) > 0 ? <Button size="sm" variant="outline" onClick={() => { setPayItem({ debt: d, installment: i }); setPayment({ amount: String(leftAmount(i)), paid_on: todayISO(), note: "" }); }}>Ödeme gir</Button> : <Check className="size-4 text-emerald-600"/>}</div>)}</div>{debtPayments.length > 0 && <div className="mt-3 rounded-xl border p-3"><p className="mb-2 text-xs font-semibold text-muted-foreground">SON ÖDEMELER</p>{debtPayments.map((p) => <div key={p.id} className="flex justify-between py-1 text-xs"><span>{dateLabel(p.paid_on)}{p.note ? ` · ${p.note}` : ""}</span><strong>{formatTL(p.amount)}</strong></div>)}</div>}<Button variant="ghost" size="sm" className="mt-2 text-destructive" onClick={() => { if (window.confirm(`“${d.name}” kaydı ve taksitleri silinsin mi?`)) removeDebt.mutate(d.id); }}><Trash2 className="mr-1 size-3.5"/>Kaydı sil</Button></div>}
      </article>;
    })}</div>}

    <div className="rounded-2xl border bg-muted/30 p-4"><div className="flex gap-3"><CircleDollarSign className="mt-0.5 size-5 shrink-0 text-primary"/><div><p className="text-sm font-semibold">Ödeme hatırlatmaları</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Vade günü gelen ve geciken taksitler bildirim merkezinde görünür. Telefon bildirimi için izin verebilirsin; uygulama açıkken vade uyarısı da gösterilir.</p>{notifySupported() && Notification.permission !== "granted" && <Button size="sm" variant="outline" className="mt-3" onClick={async () => { const result = await askNotifyPermission(); toast[result === "granted" ? "success" : "error"](result === "granted" ? "Bildirimler açıldı" : "Tarayıcı bildirim izni verilmedi"); }}><BellRing className="mr-1 size-4"/>Telefon bildirimlerini aç</Button>}</div></div></div>

    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Yeni borç / alacak</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveDebt.mutate(); }}><div className="grid grid-cols-2 rounded-lg bg-muted p-1"><button type="button" onClick={() => setForm({ ...form, direction: "receivable" })} className={`rounded-md py-2 text-sm ${form.direction === "receivable" ? "bg-background shadow" : "text-muted-foreground"}`}>Bana borçlu</button><button type="button" onClick={() => setForm({ ...form, direction: "payable" })} className={`rounded-md py-2 text-sm ${form.direction === "payable" ? "bg-background shadow" : "text-muted-foreground"}`}>Ben borçluyum</button></div><div className="space-y-2"><Label>Kişi, kurum veya makine adı *</Label><Input required placeholder="Örn. Ali Yılmaz / Ekskavatör" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/></div><div className="space-y-2"><Label>Toplam tutar (₺) *</Label><Input required type="number" min="0.01" step="0.01" placeholder="0,00" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })}/></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Alınma tarihi</Label><Input type="date" value={form.acquired_on} onChange={(e) => setForm({ ...form, acquired_on: e.target.value })}/></div><div className="space-y-2"><Label>Taksit sayısı</Label><Input type="number" min="1" max="360" value={form.installment_count} onChange={(e) => setForm({ ...form, installment_count: e.target.value })}/></div></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>İlk taksit vadesi</Label><Input type="date" value={form.first_due_on} onChange={(e) => setForm({ ...form, first_due_on: e.target.value })}/></div><div className="space-y-2"><Label>Taksit aralığı (ay)</Label><Input type="number" min="1" max="12" value={form.interval_months} onChange={(e) => setForm({ ...form, interval_months: e.target.value })}/></div></div><div className="space-y-2"><Label>Açıklama / not</Label><Textarea rows={2} placeholder="Örn. marka-model, alacak nedeni, ödeme koşulu" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/></div><p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{Number(form.installment_count) > 0 && Number(form.total_amount) > 0 ? `${form.installment_count} taksit · yaklaşık ${formatTL(Number(form.total_amount) / Number(form.installment_count))} / taksit. Kuruş farkı son taksite eklenir.` : "Taksit tutarları ve vadeler otomatik oluşturulur."}</p><Button type="submit" className="w-full" disabled={saveDebt.isPending}>{saveDebt.isPending ? "Kaydediliyor…" : "Kaydet ve taksit planı oluştur"}</Button></form></DialogContent></Dialog>

    <Dialog open={Boolean(payItem)} onOpenChange={(open) => { if (!open) setPayItem(null); }}><DialogContent><DialogHeader><DialogTitle>Taksit ödemesi kaydet</DialogTitle></DialogHeader>{payItem && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); addPayment.mutate(); }}><div className="rounded-xl bg-muted p-3 text-sm"><strong>{payItem.debt.name}</strong><p className="mt-1 text-muted-foreground">{payItem.installment.installment_no}/{payItem.debt.installment_count}. taksit · kalan {formatTL(leftAmount(payItem.installment))} · vade {dateLabel(payItem.installment.due_on)}</p></div><div className="space-y-2"><Label>Ödenen tutar (₺)</Label><Input type="number" min="0.01" max={leftAmount(payItem.installment)} step="0.01" required value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })}/></div><div className="space-y-2"><Label>Ödeme tarihi</Label><Input type="date" required value={payment.paid_on} onChange={(e) => setPayment({ ...payment, paid_on: e.target.value })}/></div><div className="space-y-2"><Label>Not (isteğe bağlı)</Label><Input placeholder="Örn. banka havalesi" value={payment.note} onChange={(e) => setPayment({ ...payment, note: e.target.value })}/></div><Button className="w-full" type="submit" disabled={addPayment.isPending}>{addPayment.isPending ? "Kaydediliyor…" : "Ödemeyi kaydet"}</Button></form>}</DialogContent></Dialog>
  </div>;
}
