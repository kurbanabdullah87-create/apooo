import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, UserPlus, Search, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SwipeRow } from "@/components/app/SwipeRow";
import { CustomerForm } from "@/components/app/forms/CustomerForm";
import { useCustomers, useTransactions, useUndoableDelete } from "@/lib/data";
import { customerBalance, formatTL, overdueAmount } from "@/lib/finance";
import { pageHead, useRecords } from "@/lib/work";

export const Route = createFileRoute("/_authenticated/cari/")({
  head: () => pageHead("Cari Hesaplar", "Müşteri bakiyeleri ve hesap ekstreleri."),
  component: CariList,
});

function CariList() {
  const customers = useCustomers();
  const txs = useTransactions();
  const jobs = useRecords("job");
  const del = useUndoableDelete("customers");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "grid2" | "grid3" | "compact">(() => {
    try { const saved = localStorage.getItem("saha-customer-view"); return saved === "grid2" || saved === "grid3" || saved === "compact" ? saved : "list"; } catch { return "list"; }
  });

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("action") === "new") {
        url.searchParams.delete("action");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        setOpen(true);
        return;
      }
      if (sessionStorage.getItem("saha.openCustomerForm") !== "1") return;
      sessionStorage.removeItem("saha.openCustomerForm");
      setOpen(true);
    } catch { /* optional cross-route quick action */ }
  }, []);

  const rows = useMemo(
    () =>
      (customers.data ?? [])
        .filter(c => !q || c.name.toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR")))
        .map((c) => {
        const ct = (txs.data ?? []).filter((t) => t.customer_id === c.id);
        const customerJobs = (jobs.data ?? []).filter((job) => job.payload.customer_id === c.id && job.payload.status !== "İptal");
        const lastActivity = customerJobs.map((job) => String(job.payload.completed_at ?? job.payload.date ?? job.created_at).slice(0, 10)).sort().at(-1) ?? c.created_at.slice(0, 10);
        const silentDays = Math.max(0, Math.floor((Date.now() - new Date(`${lastActivity}T12:00:00`).getTime()) / 86_400_000));
        const lifetimeCollected = ct.filter((tx) => tx.kind === "payment").reduce((sum, tx) => sum + Number(tx.amount), 0);
        const segment = silentDays >= 90 ? "Kayıp riski" : silentDays >= 60 ? "Geri kazanım" : customerJobs.length >= 3 && lifetimeCollected > 0 ? "Sadık" : "Yeni / gelişen";
        return { c, balance: customerBalance(ct), overdue: overdueAmount(ct), silentDays, segment };
      }),
    [customers.data, txs.data, jobs.data],
  );
  const total = rows.reduce((s, r) => s + Math.max(0, r.balance), 0);
  const changeView = (next: typeof view) => { setView(next); try { localStorage.setItem("saha-customer-view", next); } catch { /* preference is optional */ } };

  return (
    <div className="space-y-4">
      {/* Özet kartlar */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><TrendingUp className="size-3 text-warning" />Toplam Alacak</div>
          <div className="num font-bold text-warning">{formatTL(total)}</div>
          <div className="text-[10px] text-muted-foreground">{rows.filter(r => r.balance > 0).length} müşteri</div>
        </div>
        <div className="rounded-2xl border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><TrendingDown className="size-3 text-green-600" />Toplam Ödenmiş</div>
          <div className="num font-bold text-green-600">{formatTL(rows.reduce((s,r) => s + Math.max(0, -r.balance), 0))}</div>
          <div className="text-[10px] text-muted-foreground">{rows.filter(r => r.balance <= 0).length} müşteri</div>
        </div>
      </div>
      {rows.length > 0 && <section className="rounded-2xl border bg-card p-3"><h2 className="text-sm font-semibold">Müşteri geri kazanım görünümü</h2><p className="mt-1 text-xs text-muted-foreground">İş kayıtlarının son tarihine göre; otomatik mesaj gönderilmez.</p><div className="mt-2 flex flex-wrap gap-2">{(["Sadık", "Yeni / gelişen", "Geri kazanım", "Kayıp riski"] as const).map((segment) => <span key={segment} className="rounded-full bg-secondary px-2.5 py-1 text-xs">{segment} · {rows.filter((row) => row.segment === segment).length}</span>)}</div></section>}

      {/* Arama */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Müşteri ara..."
          className="w-full h-10 pl-9 pr-3 rounded-xl border bg-secondary text-sm outline-none"
        />
      </div>

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cari hesaplar</h1>
          <p className="text-sm text-muted-foreground">
            Toplam alacak <span className="num text-warning">{formatTL(total)}</span>
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <UserPlus /> Müşteri
        </Button>
      </div>
      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1" role="group" aria-label="Müşteri görünümü">{([ ["list", "Liste"], ["grid2", "2 sütun"], ["grid3", "3 sütun"], ["compact", "Kompakt"] ] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => changeView(key)} className={`min-h-9 flex-1 rounded-lg px-3 text-xs font-semibold transition ${view === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary"}`}>{label}</button>)}</div>
      {customers.isLoading ? null : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Henüz müşteri yok. Sağ alttaki + ile ekleyin.</div>
      ) : (
        <div className={view === "grid2" ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : view === "grid3" ? "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2"}>
          {rows.map(({ c, balance, overdue, silentDays, segment }) => (
            <SwipeRow key={c.id} onDelete={() => del(c.id, `${c.name} silindi`)}>
              <Link to="/cari/$id" params={{ id: c.id }} className={`group flex h-full transition hover:border-primary/35 hover:bg-primary/[0.025] ${view === "grid2" || view === "grid3" ? "min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-4 text-center hover:-translate-y-0.5 hover:shadow-md" : view === "compact" ? "min-h-10 items-center gap-2 px-3 py-1.5" : "items-center gap-3 p-4"}`}>
                <CustomerAvatar name={c.name} className={view === "grid2" || view === "grid3" ? "size-14 text-lg" : view === "compact" ? "size-7 text-[10px]" : "size-10"}/>
                <div className={`min-w-0 ${view === "grid2" || view === "grid3" ? "w-full" : "flex-1"}`}>
                  <div className="truncate font-medium">{c.name}</div>
                  {view !== "compact" && <div className={`truncate text-xs text-muted-foreground ${view === "grid2" || view === "grid3" ? "mt-0.5" : ""}`}>{c.phone || c.address || "—"}{view !== "grid2" && view !== "grid3" ? ` · ${segment} · ${silentDays} gün` : ""}</div>}
                  {(view === "grid2" || view === "grid3") && <div className="mt-1 truncate text-[10px] text-muted-foreground">{segment} · {silentDays} gündür hareket yok</div>}
                </div>
                <div className={view === "grid2" || view === "grid3" ? "text-center" : "text-right"}>
                  <div className={`num font-semibold ${balance > 0 ? "text-warning" : balance < 0 ? "text-success" : "text-muted-foreground"}`}>{formatTL(balance)}</div>
                  {overdue > 0 && <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">30+ gün</span>}
                </div>
                {view !== "grid2" && view !== "grid3" && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
              </Link>
            </SwipeRow>
          ))}
          <p className="pt-1 text-center text-xs text-muted-foreground">Silmek için sola kaydırın</p>
        </div>
      )}
      <CustomerForm open={open} onOpenChange={setOpen} />
    </div>
  );
}

function CustomerAvatar({ name, className }: { name: string; className: string }) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr-TR")).join("") || "?";
  const hue = [...name].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7) % 360;
  return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-sm ring-2 ring-background ${className}`} style={{ backgroundColor: `hsl(${hue} 62% 36%)` }}>{initials}</span>;
}
