import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, PieChart, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpenseForm } from "@/components/app/forms/ExpenseForm";
import { SwipeRow } from "@/components/app/SwipeRow";
import { useExpenses, useUndoableDelete } from "@/lib/data";
import { EXPENSE_LABELS, formatDate, formatTL, todayISO } from "@/lib/finance";
import { pageHead } from "@/lib/work";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/giderler")({
  head: () => pageHead("Giderler", "Yakıt, yemek, hırdavat ve vergi giderleri."),
  component: Expenses,
});

function Expenses() {
  const exps = useExpenses();
  const del = useUndoableDelete("expenses");
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(todayISO().slice(0, 7));

  const rows = (exps.data ?? []).filter((e) => e.occurred_on.startsWith(month));

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
