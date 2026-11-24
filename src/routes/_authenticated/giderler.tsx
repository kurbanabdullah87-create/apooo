import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, PieChart, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExpenseForm } from "@/components/app/forms/ExpenseForm";
import { SwipeRow } from "@/components/app/SwipeRow";
import { useExpenses, useUndoableDelete } from "@/lib/data";
import { EXPENSE_LABELS, formatDate, formatTL, todayISO } from "@/lib/finance";
import { pageHead, useRecords, useSaveRecord } from "@/lib/work";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import type { ExpenseCategory } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/giderler")({
  head: () => pageHead("Giderler", "Yakıt, yemek, hırdavat ve vergi giderleri."),
  component: Expenses,
});

function Expenses() {
  const exps = useExpenses();
  const del = useUndoableDelete("expenses");
  const me = useMe();
  const settings = useRecords("settings");
  const saveSettings = useSaveRecord("settings");
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const budgetRecord = settings.data?.find((row) => row.payload.key === "expense-budgets");
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [yearTotals, setYearTotals] = useState<Record<string, number>>({});
  const [budgetBusy, setBudgetBusy] = useState(false);
  useEffect(() => {
    const raw = budgetRecord?.payload.monthly_budgets;
    const yearly = budgetRecord?.payload.yearly_budgets;
    try { if (typeof raw === "string") setBudgets(JSON.parse(raw) as Record<string, number>); } catch { setBudgets({}); }
    try { if (typeof yearly === "string") setYearTotals(JSON.parse(yearly) as Record<string, number>); } catch { setYearTotals({}); }
  }, [budgetRecord]);

  const rows = (exps.data ?? []).filter((e) => e.occurred_on.startsWith(month));
  const categories = Object.entries(EXPENSE_LABELS) as [ExpenseCategory, string][];
  const spentByCategory = useMemo(() => Object.fromEntries(categories.map(([category]) => [category, rows.filter((row) => row.category === category).reduce((sum, row) => sum + Number(row.amount), 0)])) as Record<ExpenseCategory, number>, [rows]);
  const monthTotal = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  const monthBudgetTotal = categories.reduce((sum, [category]) => sum + (Number(budgets[`${month}:${category}`]) || 0), 0);
  const year = month.slice(0, 4);
  const yearBudgetTotal = Array.from({ length: 12 }, (_, index) => Number(yearTotals[`${year}-${String(index + 1).padStart(2, "0")}`] ?? 0)).reduce((sum, value) => sum + value, 0);
  const yearSpent = (exps.data ?? []).filter((row) => row.occurred_on.startsWith(year)).reduce((sum, row) => sum + Number(row.amount), 0);
  async function persistBudgets() {
    if (!me.data?.id) return;
    setBudgetBusy(true);
    try {
      await saveSettings.mutateAsync({ id: budgetRecord?.id, owner_id: me.data.id, payload: { ...(budgetRecord?.payload ?? {}), key: "expense-budgets", monthly_budgets: JSON.stringify(budgets), yearly_budgets: JSON.stringify(yearTotals) } });
    } catch { /* mutation shows its own error toast */ }
    finally { setBudgetBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Giderler</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus />
          Gider
        </Button>
      </div>
      <input
        aria-label="Gider ayı"
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="rounded-md border bg-secondary p-2"
      />
      <section className="space-y-2 rounded-2xl border bg-card p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Bütçe · {month}</h2>
          <span className="num text-xs text-muted-foreground">Harcanan {formatTL(monthTotal)}{monthBudgetTotal > 0 ? ` / ${formatTL(monthBudgetTotal)}` : ""}</span>
        </div>
        {categories.map(([category, label]) => {
          const spent = spentByCategory[category] ?? 0;
          const limit = Number(budgets[`${month}:${category}`] ?? 0);
          const percent = limit > 0 ? spent / limit * 100 : 0;
          const statusClass = percent >= 100 ? "text-destructive" : percent >= 80 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground";
          return <div key={category} className="grid grid-cols-[minmax(70px,.7fr)_minmax(105px,1fr)_auto] items-center gap-x-3 gap-y-1 border-t py-2 first:border-0">
            <label htmlFor={`budget-${category}`} className="text-xs font-medium">{label}</label>
            <Input id={`budget-${category}`} type="number" inputMode="decimal" min="0" step="100" value={budgets[`${month}:${category}`] ?? ""} placeholder="Limit ₺" onChange={(event) => setBudgets((current) => ({ ...current, [`${month}:${category}`]: Math.max(0, Number(event.target.value) || 0) }))}/>
            <span className={`num text-right text-xs ${statusClass}`}>{formatTL(spent)}{limit > 0 ? ` · %${Math.round(percent)}` : ""}</span>
            {limit > 0 && <div className="col-span-3 h-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label={`${label} bütçe kullanımı`} aria-valuenow={Math.min(100, Math.round(percent))} aria-valuemin={0} aria-valuemax={100}><div className={`h-full ${percent >= 100 ? "bg-destructive" : percent >= 80 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(100, percent)}%` }}/></div>}
            {percent >= 80 && <p className={`col-span-3 text-[11px] ${statusClass}`}>{percent >= 100 ? `Limit aşıldı · ${formatTL(spent - limit)} fazla` : "Bütçenin %80’i kullanıldı."}</p>}
          </div>;
        })}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2"><p className="text-xs text-muted-foreground">Limit olmayan kategoriler bütçe toplamına dahil edilmez.</p><Button type="button" size="sm" disabled={budgetBusy || !me.data?.id} onClick={() => void persistBudgets()}>{budgetBusy ? "Kaydediliyor…" : "Bütçeyi kaydet"}</Button></div>
      </section>
      <details className="rounded-2xl border bg-card p-3"><summary className="cursor-pointer text-sm font-semibold">Yıllık plan · {year}</summary><p className="mt-1 text-xs text-muted-foreground">Aylık toplam gider limitlerini belirleyin.</p><div className="mt-2 space-y-1">{Array.from({ length: 12 }, (_, index) => { const key = `${year}-${String(index + 1).padStart(2, "0")}`; const spent = (exps.data ?? []).filter((expense) => expense.occurred_on.startsWith(key)).reduce((sum, expense) => sum + Number(expense.amount), 0); const limit = Number(yearTotals[key] ?? 0); const percent = limit > 0 ? spent / limit * 100 : 0; return <div key={key} className="grid grid-cols-[1fr_minmax(120px,1fr)_auto] items-center gap-2 border-t py-2 first:border-0"><span className="text-xs font-medium">{new Date(Number(year), index, 1).toLocaleDateString("tr-TR", { month: "long" })}</span><Input aria-label={`${key} toplam gider bütçesi`} type="number" inputMode="decimal" min="0" step="500" value={yearTotals[key] ?? ""} placeholder="Limit ₺" onChange={(event) => setYearTotals((current) => ({ ...current, [key]: Math.max(0, Number(event.target.value) || 0) }))}/><span className={`num text-right text-[11px] ${percent >= 100 ? "text-destructive" : percent >= 80 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{formatTL(spent)}{limit ? ` · %${Math.round(percent)}` : ""}</span></div>; })}</div><div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2"><p className="text-xs text-muted-foreground">Yıl toplamı: {formatTL(yearSpent)}{yearBudgetTotal ? ` / ${formatTL(yearBudgetTotal)}` : ""}</p><Button type="button" size="sm" variant="outline" disabled={budgetBusy || !me.data?.id} onClick={() => void persistBudgets()}>{budgetBusy ? "Kaydediliyor…" : "Yıllık planı kaydet"}</Button></div></details>
      {/* Kategori özeti */}
      {rows.length > 0 && (
        <div className="rounded-2xl border bg-card p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <PieChart className="size-3" />Kategorilere Göre
          </div>
          {(Object.entries(EXPENSE_LABELS) as [import("@/lib/finance").ExpenseCategory, string][])
            .map(([cat, label]) => {
              const catTotal = rows.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
              const pct = rows.reduce((s, e) => s + e.amount, 0);
              if (!catTotal) return null;
              return (
                <div key={cat} className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span>{label}</span>
                    <span className="num text-muted-foreground">{formatTL(catTotal)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-destructive/60" style={{ width: `${Math.round((catTotal / pct) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
        </div>
      )}

      <p className="num text-2xl text-destructive">
        {formatTL(rows.reduce((s, e) => s + e.amount, 0))}
      </p>
      {exps.error && <p className="text-destructive">Giderler yüklenemedi.</p>}
      {rows.map((e) => (
        <SwipeRow key={e.id} onDelete={() => del(e.id)}>
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{EXPENSE_LABELS[e.category]}</p>
              <p className="text-xs text-muted-foreground">{formatDate(e.occurred_on)} · {e.description}</p>
              {e.job_record_id && <p className="text-[11px] text-primary">İş bağlantısı · kârlılık hesabına dahil</p>}
            </div>
            <div className="flex items-center gap-3">
              {e.receipt_photo_url && <ReceiptPreview path={e.receipt_photo_url}/>}
              <span className="num text-destructive">{formatTL(e.amount)}</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 h-8 px-2"
                onClick={() => del(e.id)}
              >
                Sil
              </Button>
            </div>
          </div>
        </SwipeRow>
      ))}
      {!rows.length && !exps.isLoading && (
        <p className="py-8 text-center text-muted-foreground">Bu ay gider yok.</p>
      )}
      <ExpenseForm open={open} onOpenChange={setOpen} />
    </div>
  );
}

function ReceiptPreview({ path }: { path: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let active = true; void supabase.storage.from("saha-media").createSignedUrl(path, 3600).then(({ data }) => { if (active) setUrl(data?.signedUrl ?? ""); }); return () => { active = false; }; }, [path]);
  if (!url) return null;
  return <Button asChild size="icon" variant="ghost" title="Fiş fotoğrafını görüntüle" aria-label="Fiş fotoğrafını görüntüle"><a href={url} target="_blank" rel="noreferrer"><ReceiptText/></a></Button>;
}
