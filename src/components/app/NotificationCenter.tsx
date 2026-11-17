import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Bell, CalendarClock, CheckCheck, HandCoins, Timer, Wrench } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMe } from "@/hooks/use-me";
import { useCustomers, useTransactions } from "@/lib/data";
import { formatTL, overdueAmount, todayISO } from "@/lib/finance";
import { elapsedSeconds, maintenanceStatus, useRecords } from "@/lib/work";
import { supabase } from "@/integrations/supabase/client";

type Notice = { id: string; title: string; detail: string; kind: "money" | "equipment" | "appointment" | "timer" | "debt"; open: () => void };

export function NotificationCenter() {
  const me = useMe();
  const navigate = useNavigate();
  const customers = useCustomers();
  const transactions = useTransactions();
  const equipment = useRecords("equipment");
  const jobs = useRecords("job");
  const appointments = useRecords("appointment");
  const debtRows = useQuery({ queryKey: ["debt-records"], enabled: me.data?.isUsta === true, queryFn: async () => {
    const { data, error } = await supabase.from("debt_records").select("id,name,direction");
    if (error) throw error;
    return data ?? [];
  }});
  const debtInstallments = useQuery({ queryKey: ["debt-installments"], enabled: me.data?.isUsta === true, queryFn: async () => {
    const { data, error } = await supabase.from("debt_installments").select("id,debt_id,installment_no,amount,paid_amount,due_on");
    if (error) throw error;
    return data ?? [];
  }});
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const storageKey = `saha-notifications-read:${me.data?.id ?? "guest"}`;

  useEffect(() => {
    try { const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]"); setDismissed(Array.isArray(saved) && saved.every((item) => typeof item === "string") ? saved : []); }
    catch { setDismissed([]); }
  }, [storageKey]);

  const notices = useMemo<Notice[]>(() => {
    const result: Notice[] = [];
    const txs = transactions.data ?? [];
    for (const customer of customers.data ?? []) {
      const overdue = overdueAmount(txs.filter((tx) => tx.customer_id === customer.id), new Date(), customer.payment_due_days ?? 15);
      if (overdue > 0) result.push({
        id: `overdue:${customer.id}`, kind: "money", title: `${customer.name} · vadesi geçmiş alacak`, detail: formatTL(overdue),
        open: () => { setOpen(false); void navigate({ to: "/cari/$id", params: { id: customer.id } }); },
      });
    }
    for (const item of equipment.data ?? []) {
      const maintenance = maintenanceStatus(item.payload);
      if (maintenance.level === "warn" || maintenance.level === "over" || item.payload["maintenance_blocked"] === true) result.push({
        id: `maintenance:${item.id}`, kind: "equipment", title: `${String(item.payload.name ?? "Ekipman")} · bakım`,
        detail: maintenance.level === "over" ? `Bakım ${Math.abs(maintenance.remaining).toFixed(1)} saat gecikti.` : maintenance.level === "warn" ? `Bakım için ${maintenance.remaining.toFixed(1)} saat kaldı.` : "Bakım nedeniyle ekipman kilitli.",
        open: () => { setOpen(false); void navigate({ to: "/ekipman" }); },
      });
    }
    const today = todayISO();
    for (const appointment of appointments.data ?? []) {
      if (appointment.payload.date === today && appointment.payload.status !== "Tamamlandı" && appointment.payload.status !== "İptal") result.push({
        id: `appointment:${appointment.id}`, kind: "appointment", title: "Bugün randevu var", detail: `${String(appointment.payload.time ?? "Saat belirtilmedi")} · ${String(appointment.payload.title ?? appointment.payload["customer_name"] ?? "Randevu")}`,
        open: () => { setOpen(false); void navigate({ to: "/randevu" }); },
      });
    }
    const debtNames = new Map((debtRows.data ?? []).map((d) => [d.id, d]));
    const weekAhead = new Date(`${today}T12:00:00`);
    weekAhead.setDate(weekAhead.getDate() + 7);
    const weekDate = `${weekAhead.getFullYear()}-${String(weekAhead.getMonth() + 1).padStart(2, "0")}-${String(weekAhead.getDate()).padStart(2, "0")}`;
    for (const installment of debtInstallments.data ?? []) {
      const remaining = Number(installment.amount) - Number(installment.paid_amount);
      if (remaining <= 0 || installment.due_on > weekDate) continue;
      const debt = debtNames.get(installment.debt_id);
      if (!debt) continue;
      const late = installment.due_on < today;
      result.push({ id: `debt:${installment.id}`, kind: "debt", title: `${late ? "Geciken taksit" : installment.due_on === today ? "Bugün taksit vadesi" : "Yaklaşan taksit"} · ${debt.name}`, detail: `${debt.direction === "payable" ? "Ödenecek" : "Tahsil edilecek"} · ${installment.installment_no}. taksit · ${formatTL(remaining)} · vade ${new Date(`${installment.due_on}T12:00:00`).toLocaleDateString("tr-TR")}`, open: () => { setOpen(false); void navigate({ to: "/borc" }); } });
    }
    for (const job of jobs.data ?? []) {
      if (job.payload.started_at && elapsedSeconds(job.payload, Date.now()) >= 8 * 3600) result.push({
        id: `timer:${job.id}:${String(job.payload.started_at)}`, kind: "timer", title: `Uzun süredir açık kronometre · ${String(job.payload.title ?? "İş")}`,
        detail: "İş süresinin doğru kaydedildiğini kontrol edin.", open: () => { setOpen(false); void navigate({ to: "/isler" }); },
      });
    }
    return result.sort((a, b) => a.title.localeCompare(b.title, "tr-TR"));
  }, [appointments.data, customers.data, debtInstallments.data, debtRows.data, equipment.data, jobs.data, navigate, transactions.data]);

  const unread = notices.filter((item) => !dismissed.includes(item.id));
  const markAllRead = () => {
    const next = [...new Set([...dismissed, ...unread.map((item) => item.id)])];
    setDismissed(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* optional device storage */ }
  };

  return (
    <>
      <Button variant="ghost" size="icon" className="relative" aria-label={`Bildirimler${unread.length ? `, ${unread.length} yeni` : ""}`} title="Bildirim merkezi" onClick={() => setOpen(true)}>
        <Bell className="size-5" />
        {unread.length > 0 && <span className="absolute right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground">{unread.length > 9 ? "9+" : unread.length}</span>}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[min(92vw,390px)] overflow-y-auto sm:w-full">
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>Bildirim merkezi</SheetTitle>
            <SheetDescription>Geciken alacak, ekipman bakımı ve saha hatırlatmaları.</SheetDescription>
          </SheetHeader>
          <p className="mt-3 rounded-xl bg-secondary/70 p-3 text-xs leading-5 text-muted-foreground">Bu uyarılar uygulamadaki kayıtlarından üretilir ve okundu bilgisi bu cihazda saklanır.</p>
          {unread.length > 0 && <Button variant="ghost" size="sm" className="mt-3" onClick={markAllRead}><CheckCheck className="size-4"/>Tümünü okundu işaretle</Button>}
          <div className="mt-3 space-y-2">
            {unread.map((notice) => {
              const Icon = notice.kind === "money" ? AlertTriangle : notice.kind === "equipment" ? Wrench : notice.kind === "timer" ? Timer : notice.kind === "debt" ? HandCoins : CalendarClock;
              return <button type="button" key={notice.id} onClick={notice.open} className="flex w-full items-start gap-3 rounded-2xl border bg-card p-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4"/></span>
                <span className="min-w-0"><span className="block text-sm font-semibold">{notice.title}</span><span className="mt-1 block text-xs text-muted-foreground">{notice.detail}</span></span>
              </button>;
            })}
            {unread.length === 0 && <div className="rounded-2xl border border-dashed p-8 text-center"><CheckCheck className="mx-auto size-7 text-emerald-500"/><p className="mt-2 text-sm font-medium">Yeni bildirim yok</p><p className="mt-1 text-xs text-muted-foreground">Önemli bir durum oluştuğunda burada gösterilir.</p></div>}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
