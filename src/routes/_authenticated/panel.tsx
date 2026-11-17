import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, AlertTriangle, MapPin, MessageCircle, Wallet, HardHat } from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useCustomers, useExpenses, useTransactions } from "@/lib/data";
import { customerBalance, customerRestriction, EXPENSE_LABELS, formatTL, monthKey, monthSummary, overdueAmount, profitBreakdown, todayISO, type ExpenseCategory } from "@/lib/finance";
import { pageHead, useSaveRecord } from "@/lib/work";
import { MaintenanceAlerts } from "@/components/app/MaintenanceAlerts";
import { getPosition, coordsOf, distanceMeters } from "@/lib/geo";
import { useMe } from "@/hooks/use-me";
import { toast } from "sonner";
import { whatsappLink } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { CurrencyConverter } from "@/components/app/CurrencyConverter";

export const Route = createFileRoute("/_authenticated/panel")({
  head: () => pageHead("Panel", "Aylık gelir, gider ve kâr özeti."),
  component: Panel,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function shiftMonth(m: string, d: number) {
  const [y = 2026, mo = 1] = m.split("-").map(Number);
  const dt = new Date(y, mo - 1 + d, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}


function Panel() {
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [quickNote, setQuickNote] = useState(() => { try { return localStorage.getItem("panel_note") ?? ""; } catch { return ""; } });
  const saveNote = (v: string) => { setQuickNote(v); try { localStorage.setItem("panel_note", v); } catch {} };
  const txs = useTransactions();
  const exps = useExpenses();
  const customers = useCustomers();
  const saveJob = useSaveRecord("job");
  const me = useMe();
  const navigate = useNavigate();
  const [nearby, setNearby] = useState<{ customer: NonNullable<typeof customers.data>[number]; meters: number } | null>(null);

  const data = useMemo(() => {
    const t = txs.data ?? [];
    const e = exps.data ?? [];
    const s = monthSummary(t, e, month);
    const monthDebts = t.filter((x) => x.kind === "debt" && monthKey(x.occurred_on) === month);
    const profit = monthDebts.reduce((acc, x) => acc + profitBreakdown(x.amount, x.material_cost, x.vat_rate).profit, 0);
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
        return { c, overdue: overdueAmount(ct, new Date(), c.payment_due_days ?? 15), balance: customerBalance(ct) };
      })
      .filter((x) => x.overdue > 0)
      .sort((a, b) => b.overdue - a.overdue);
    return { s, profit, byCat, bars, overdue };
  }, [txs.data, exps.data, customers.data, month]);

  const label = new Date(month + "-01T00:00:00").toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  const today = todayISO();
  const todayIncome = (txs.data ?? []).filter((tx) => tx.kind === "payment" && tx.occurred_on === today).reduce((sum, tx) => sum + tx.amount, 0);
  const todayExpense = (exps.data ?? []).filter((e) => e.occurred_on === today).reduce((sum, e) => sum + e.amount, 0);
  useEffect(() => {
    let active = true;
    if (!customers.data?.length) return;
    void getPosition(5000).then((position) => {
      if (!active) return;
      const closest = customers.data!.map((customer) => { const coords = coordsOf({ lat: customer.latitude, lng: customer.longitude }); return coords ? { customer, meters: distanceMeters(position, coords) } : null; }).filter((row): row is { customer: NonNullable<typeof customers.data>[number]; meters: number } => row !== null && row.meters <= 100).sort((a, b) => a.meters - b.meters)[0] ?? null;
      setNearby(closest);
    }).catch(() => setNearby(null));
    return () => { active = false; };
  }, [customers.data]);

  function startNearbyJob(customer: NonNullable<typeof customers.data>[number]) {
    const related = (txs.data ?? []).filter((tx) => tx.customer_id === customer.id);
    const risk = customerRestriction(customer, related);
    if (risk.blocked) { toast.error("Cari kilidi aktif; önce tahsilat alın."); void navigate({ to: "/cari/$id", params: { id: customer.id } }); return; }
    saveJob.mutate({ owner_id: me.data?.id, payload: { title: "Hızlı saha işi", customer_id: customer.id, address: customer.address ?? "", date: today, status: "Devam Ediyor", seconds: 0, started_at: new Date().toISOString(), no_machine: true, equipment_id: null, vat_rate: 0 } }, { onSuccess: () => void navigate({ to: "/isler" }) });
  }

  return (
    <div className="space-y-5">
      {/* Hızlı Not */}
      <div className="rounded-2xl border bg-amber-50 dark:bg-amber-950/20 p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm">📝</span>
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Hızlı Not</span>
        </div>
        <textarea
          value={quickNote}
          onChange={e => saveNote(e.target.value)}
          placeholder="Bugün için notunuzu buraya yazın..."
          className="w-full bg-transparent text-sm resize-none outline-none text-foreground placeholder:text-muted-foreground min-h-[60px]"
          rows={3}
        />
      </div>

      <CurrencyConverter />

      {nearby && <section className="rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/10 p-4"><div className="flex items-start gap-3"><MapPin className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300"/><div className="min-w-0 flex-1"><p className="font-semibold">Şu an {nearby.customer.name} konumuna yakınsınız</p><p className="text-xs text-muted-foreground">Yaklaşık {Math.round(nearby.meters)} metre · konum yalnızca cihazda karşılaştırılır</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={saveJob.isPending} onClick={() => startNearbyJob(nearby.customer)}><HardHat/>Hızlı iş başlat</Button><Button asChild size="sm" variant="secondary"><Link to="/cari/$id" params={{ id: nearby.customer.id }}><Wallet/>Tahsilat al</Link></Button></div></div></div></section>}
      <MaintenanceAlerts />
      <section className="grid grid-cols-2 gap-3"><div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">Bugünkü tahsilat</p><p className="mt-1 text-xl font-bold text-success">{formatTL(todayIncome)}</p></div><div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">Bugünkü gider</p><p className="mt-1 text-xl font-bold text-destructive">{formatTL(todayExpense)}</p></div><div className="col-span-2 rounded-2xl bg-slate-950 p-4 text-white"><p className="text-xs text-slate-300">GÜNÜN NET NAKİT AKIŞI</p><p className={`mt-1 text-2xl font-bold ${todayIncome - todayExpense < 0 ? "text-rose-300" : "text-emerald-300"}`}>{formatTL(todayIncome - todayExpense)}</p></div></section>
      <div className="flex items-center justify-between">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-full p-2 hover:bg-secondary" aria-label="Önceki ay">
          <ChevronLeft />
        </button>
        <h1 className="text-xl font-bold capitalize">{label}</h1>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-full p-2 hover:bg-secondary" aria-label="Sonraki ay">
          <ChevronRight />
        </button>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="text-sm text-muted-foreground">Net (tahsilat − gider)</div>
        <div className={`num mt-1 text-4xl font-bold ${data.s.net < 0 ? "text-destructive" : "text-foreground"}`}>{formatTL(data.s.net)}</div>
        <div className="mt-2 text-xs text-muted-foreground">
          Bu ay yapılan işlerin KDV ve malzeme sonrası kârı: <span className="num text-success">{formatTL(data.profit)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Gelir" value={data.s.income} tone="text-success" />
        <Stat label="Gider" value={data.s.expense} tone="text-destructive" />
        <Stat label="Alacak" value={data.s.receivable} tone="text-warning" />
      </div>

      {data.overdue.length > 0 && (
        <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-4" /> 30 günü geçen alacaklar
          </div>
          {data.overdue.slice(0, 3).map(({ c, overdue }) => (
            <div key={c.id} className="flex items-center gap-2 border-b border-destructive/15 py-2"><Link to="/cari/$id" params={{ id: c.id }} className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</Link><span className="num whitespace-nowrap text-sm font-semibold text-destructive">{formatTL(overdue)}</span>{c.phone && <Button asChild size="icon" variant="secondary" className="size-9"><a target="_blank" rel="noreferrer" href={whatsappLink(c.phone, `Merhaba ${c.name}, ${formatTL(overdue)} tutarında vadesi geçmiş bakiyeniz bulunuyor. Uygun olduğunuzda ödeme bilgisini paylaşabilir misiniz?`)} aria-label={`${c.name} için WhatsApp ödeme hatırlatması`}><MessageCircle/></a></Button>}</div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Son 6 ay</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.bars}>
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
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
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`num mt-1 truncate text-sm font-semibold ${tone}`}>{formatTL(value)}</div>
    </div>
  );
}
