import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, Bell, CalendarDays, ChevronLeft, ChevronRight, Download, MessageCircle, Phone, Play, Plus, Search, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDrawer } from "@/components/app/forms/FormDrawer";
import { JobFormBody } from "@/components/app/JobFormBody";
import { SwipeRow } from "@/components/app/SwipeRow";
import { useMe } from "@/hooks/use-me";
import { useCustomers } from "@/lib/data";
import { customerBalance, formatDate, todayISO, type Tx } from "@/lib/finance";
import { useMembers } from "@/lib/job-fields";
import { persistWrite } from "@/lib/offline";
import { REMIND_OPTIONS, apptStart, askNotifyPermission, notifySupported } from "@/lib/reminders";
import { whatsappLink } from "@/lib/templates";
import { appointmentReminderText } from "@/lib/statement";
import { useTransactions } from "@/lib/data";
import { customerRestriction } from "@/lib/finance";
import { Textarea } from "@/components/ui/textarea";
import { buildReceipt, shareOrDownload } from "@/lib/receipt";
import { pageHead, useRecords, useSaveRecord, validateJobForm, type Payload, type WorkRecord } from "@/lib/work";
import { supabase } from "@/integrations/supabase/client";
import type { BusinessProfile } from "@/lib/receipt";

export const Route = createFileRoute("/_authenticated/randevu")({
  head: () => pageHead("Randevular", "İsme göre randevu takibi."),
  component: Appointments,
});

const STATUSES = ["Bekliyor", "Geldi", "İptal"] as const;
const norm = (s: unknown) => String(s ?? "").toLocaleLowerCase("tr-TR").trim();
const empty = (): Payload => ({ name: "", phone: "", date: todayISO(), time: "09:00", title: "", notes: "", status: "Bekliyor", remind: "30" });

function Appointments() {
  const recs = useRecords("appointment");
  const customers = useCustomers();
  const transactions = useTransactions();
  const save = useSaveRecord("appointment");
  const saveJob = useSaveRecord("job");
  const members = useMembers();
  const equipment = useRecords("equipment");
  const jobsAll = useRecords("job");
  const settings = useRecords("settings");
  const profile = settings.data?.[0]?.payload;
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [view, setView] = useState<"all" | "day" | "month" | "archive">("all");
  const [day, setDay] = useState(todayISO());
  const [edit, setEdit] = useState<{ id?: string; owner_id?: string; payload: Payload } | null>(null);
  const [job, setJob] = useState<{ appt: WorkRecord; form: Payload } | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [now, setNow] = useState(Date.now());
  const [perm, setPerm] = useState(notifySupported() ? Notification.permission : "denied");

  // Sayfa ilk açılınca bildirim izni iste (default ise)
  useEffect(() => {
    if (notifySupported() && Notification.permission === "default") {
      void askNotifyPermission().then(setPerm);
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const archivedCount = (recs.data ?? []).filter((r) => r.payload.archived).length;
  const rows = useMemo(() => {
    const needle = norm(q);
    return (recs.data ?? [])
      .filter(
        (r) =>
          !!r.payload.archived === (view === "archive") &&
          (!needle || norm(r.payload.name).includes(needle)) &&
          (view === "archive" || !status || r.payload.status === status) &&
          (view !== "day" || r.payload.date === day) &&
          (view !== "month" || String(r.payload.date ?? "").startsWith(day.slice(0, 7))),
      )
      .sort((a, b) => {
        const k = `${a.payload.date}${a.payload.time}`.localeCompare(`${b.payload.date}${b.payload.time}`);
        return view === "archive" ? -k : k;
      });
  }, [recs.data, q, status, view, day]);

  function exportCalendarFile() {
    const icalEscape = (value: unknown) => String(value ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const events = rows.filter((row) => row.payload.status !== "İptal" && row.payload.date && row.payload.time).map((row) => {
      const startsAt = new Date(`${String(row.payload.date)}T${String(row.payload.time)}:00+03:00`);
      if (Number.isNaN(startsAt.getTime())) return "";
      const endsAt = new Date(startsAt.getTime() + Math.max(15, Number(row.payload.duration_minutes ?? 60)) * 60_000);
      const utc = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
      const alarmMinutes = Math.max(0, Math.min(10080, Number(row.payload.remind ?? 30)));
      return ["BEGIN:VEVENT", `UID:${row.id}@saha.app`, `DTSTAMP:${utc(new Date())}`, `DTSTART:${utc(startsAt)}`, `DTEND:${utc(endsAt)}`, `SUMMARY:${icalEscape(`${String(row.payload.name ?? "Müşteri")} · ${String(row.payload.title ?? "Randevu")}`)}`, `DESCRIPTION:${icalEscape(row.payload.notes)}`, `LOCATION:${icalEscape(row.payload.address)}`, ...(alarmMinutes ? ["BEGIN:VALARM", `TRIGGER:-PT${alarmMinutes}M`, "ACTION:DISPLAY", `DESCRIPTION:${icalEscape("Saha randevusu")}`, "END:VALARM"] : []), "END:VEVENT"].join("\r\n");
    }).filter(Boolean);
    if (!events.length) { toast.error("Takvim dosyasına aktarılabilecek tarih ve saatli randevu yok."); return; }
    const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Saha//Randevular//TR", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `saha-randevular-${todayISO()}.ics`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`${events.length} randevu takvim dosyası olarak indirildi. Google veya Apple Takvim'e içe aktarabilirsin.`);
  }

  const groups = useMemo(() => {
    const m = new Map<string, WorkRecord[]>();
    for (const r of rows) {
      const d = String(r.payload.date ?? "");
      m.set(d, [...(m.get(d) ?? []), r]);
    }
    return [...m.entries()];
  }, [rows]);

  const setArchived = (r: WorkRecord, archived: boolean) =>
    save.mutate(
      { id: r.id, owner_id: r.owner_id, payload: { ...r.payload, archived, archived_at: archived ? new Date().toISOString() : null } },
      {
        onSuccess: () =>
          archived
            ? toast("Arşive taşındı", { action: { label: "Geri al", onClick: () => setArchived(r, false) } })
            : toast("Randevu geri alındı"),
      },
    );

  function purge(r: WorkRecord) {
    toast(`${String(r.payload.name)} kalıcı olarak silinsin mi?`, {
      description: "Bu işlem geri alınamaz.",
      action: {
        label: "Kalıcı sil",
        onClick: async () => {
          try {
            await persistWrite("work_records", "delete", { id: r.id });
            qc.invalidateQueries({ queryKey: ["work"] });
            toast.success("Kalıcı olarak silindi");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Silinemedi");
          }
        },
      },
    });
  }

  function purgeAll() {
    const list = (recs.data ?? []).filter((r) => r.payload.archived);
    if (!list.length) return;
    toast(`Arşivdeki ${list.length} randevu kalıcı silinsin mi?`, {
      description: "Bu işlem geri alınamaz.",
      action: {
        label: "Hepsini sil",
        onClick: async () => {
          try {
            for (const r of list) await persistWrite("work_records", "delete", { id: r.id });
            qc.invalidateQueries({ queryKey: ["work"] });
            toast.success("Arşiv temizlendi");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Silinemedi");
          }
        },
      },
    });
  }

  const shiftDay = (n: number) => setDay(new Date(Date.parse(day + "T12:00:00") + n * 86_400_000).toISOString().slice(0, 10));

  function setPickedName(name: string) {
    const c = (customers.data ?? []).find((x) => norm(x.name) === norm(name));
    setEdit((s) => s && { ...s, payload: { ...s.payload, name, customer_id: c?.id ?? null, phone: s.payload.phone || c?.phone || "" } });
  }

  function submitAppointment() {
    if (!edit) return;
    const p = edit.payload;
    if (!norm(p.name)) return void toast.error("İsim gerekli");
    const selectedCustomer = (customers.data ?? []).find((customer) => customer.id === p.customer_id);
    const customerTxs = (transactions.data ?? []).filter((tx) => tx.customer_id === selectedCustomer?.id);
    const credit = selectedCustomer ? customerRestriction(selectedCustomer, customerTxs) : null;
    if (credit?.blocked && !String(p.override_reason ?? "").trim()) return void toast.error("Cari kilitli. Tahsilat alın veya yönetici istisna gerekçesini yazın.");
    const clash = (recs.data ?? []).find(
      (r) => r.id !== edit.id && !r.payload.archived && r.payload.status === "Bekliyor" && r.payload.date === p.date && r.payload.time === p.time,
    );
    if (clash) toast.warning(`Aynı saatte ${String(clash.payload.name)} ile randevu var.`);
    save.mutate(edit, { onSuccess: () => setEdit(null) });
  }

  function openStartJob(a: WorkRecord) {
    const c = (customers.data ?? []).find((x) => x.id === a.payload.customer_id);
    setJob({
      appt: a,
      form: {
        title: String(a.payload.title || `${a.payload.name} işi`),
        customer_id: c?.id ?? null,
        owner_id: me.data?.id,
        date: todayISO(),
        equipment_id: null,
        address: c?.address ?? "",
        notes: String(a.payload.notes ?? ""),
        override_reason: String(a.payload.override_reason ?? ""),
        price: Number(a.payload.price ?? 0),
        vat_rate: 0,
        seconds: 0,
      },
    });
  }

  async function startJob() {
    if (!job) return;
    const { owner_id, ...payload } = job.form;
    if (!String(payload.title ?? "").trim()) return void toast.error("İş adı gerekli");
    const v = validateJobForm(job.form, equipment.data ?? [], jobsAll.data ?? []);
    if (v.error) return void toast.error(v.error);
    v.warnings.forEach((w) => toast.warning(w));
    try {
      const jobId = await saveJob.mutateAsync({
        owner_id: String(owner_id ?? me.data?.id),
        payload: { ...payload, status: "Devam Ediyor", started_at: new Date().toISOString(), appointment_id: job.appt.id },
      });
      await save.mutateAsync({ id: job.appt.id, owner_id: job.appt.owner_id, payload: { ...job.appt.payload, status: "Geldi", job_id: jobId } });
      setJob(null);
      void navigate({ to: "/isler" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İş başlatılamadı");
    }
  }

  async function completeAppointment(a: WorkRecord) {
    const customer = (customers.data ?? []).find((c) => c.id === a.payload.customer_id);
    if (!customer) {
      toast.error("Önce randevuyu kayıtlı bir müşteriyle eşleştirin.");
      setEdit({ id: a.id, owner_id: a.owner_id, payload: { ...a.payload } });
      return;
    }
    if (Number(a.payload.price ?? 0) <= 0) {
      toast.error("Önce randevuya tahsil edilecek iş tutarını girin.");
      setEdit({ id: a.id, owner_id: a.owner_id, payload: { ...a.payload } });
      return;
    }
    try {
      const { data: transactionId, error } = await supabase.rpc("complete_appointment", { _appointment_id: a.id });
      if (error) throw error;
      await Promise.all([qc.invalidateQueries({ queryKey: ["work"] }), qc.invalidateQueries({ queryKey: ["transactions"] })]);
      const { data: row, error: txError } = await supabase.from("transactions").select("*").eq("id", transactionId).single();
      if (txError) throw txError;
      const tx = { ...row, amount: Number(row.amount), material_cost: Number(row.material_cost), vat_rate: Number(row.vat_rate) } as Tx;
      const customerRows = (transactions.data ?? []).filter((item) => item.customer_id === customer.id);
      const file = await buildReceipt({ profile: (profile ?? {}) as BusinessProfile, customer, tx, balance: customerBalance([...customerRows, tx]) });
      setReceiptFile(file);
      toast.success("İş tamamlandı ve müşteri carisine işlendi. Makbuz hazır.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Randevu tamamlanamadı.");
    }
  }

  const today = todayISO();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const activeAppointments = (recs.data ?? []).filter((r) => !r.payload.archived && r.payload.status === "Bekliyor");
  const todayAppointments = activeAppointments.filter((r) => r.payload.date === today).length;
  const upcomingAppointments = activeAppointments.filter((r) => String(r.payload.date ?? "") > today).length;
  const tomorrowList = (recs.data ?? []).filter((r) => !r.payload.archived && r.payload.status === "Bekliyor" && r.payload.date === tomorrow);
  const calendarMonth = day.slice(0, 7);
  const calendarStart = new Date(`${calendarMonth}-01T12:00:00`);
  const calendarOffset = (calendarStart.getDay() + 6) % 7;
  const calendarDays = new Date(calendarStart.getFullYear(), calendarStart.getMonth() + 1, 0).getDate();
  const upd = (k: string, v: string) => setEdit((s) => s && { ...s, payload: { ...s.payload, [k]: v } });
  const appointmentCustomer = customers.data?.find((customer) => customer.id === edit?.payload.customer_id);
  const appointmentCustomerTransactions = (transactions.data ?? []).filter((tx) => tx.customer_id === appointmentCustomer?.id);
  const appointmentCredit = appointmentCustomer ? customerRestriction(appointmentCustomer, appointmentCustomerTransactions) : null;

  return (
    <div className="space-y-4">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-5 text-white shadow-lg sm:p-7">
        <div className="absolute -right-12 -top-16 size-56 rounded-full bg-violet-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-violet-300"><CalendarDays className="size-4"/>SAHA · PLANLAMA</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">Randevu takvimi</h1><p className="mt-1 text-sm text-slate-300">Gününü planla, müşteriye hatırlat ve randevudan iş kaydı başlat.</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={exportCalendarFile}><Download/>Takvime aktar</Button><Button className="bg-white text-slate-950 hover:bg-slate-100" onClick={() => setEdit({ payload: empty() })}><Plus/>Yeni randevu</Button></div>
        </div>
        <div className="relative mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          {[["Bugün", todayAppointments, "text-violet-200"], ["Bekleyen", activeAppointments.length, "text-amber-200"], ["İleri tarih", upcomingAppointments, "text-emerald-200"]].map(([label, count, tone]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[.06] p-3"><p className="text-xs text-slate-300">{label}</p><p className={`mt-1 text-xl font-bold ${tone}`}>{count}</p></div>)}
        </div>
      </header>

      {notifySupported() && perm !== "granted" && (
        <Button
          variant="secondary"
          className="w-full"
          disabled={perm === "denied"}
          onClick={async () => setPerm(await askNotifyPermission())}
        >
          <Bell />
          {perm === "denied" ? "Bildirimler tarayıcı ayarlarından engelli" : "Randevu bildirimlerini aç"}
        </Button>
      )}

      {tomorrowList.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-primary/40 bg-primary/10 p-4">
          <h2 className="text-sm font-semibold">Yarın {tomorrowList.length} randevu var · müşterilere hatırlat</h2>
          {tomorrowList.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{String(r.payload.time)} · {String(r.payload.name)}</span>
              {r.payload.phone ? (
                <Button asChild size="sm" variant="secondary">
                  <a href={whatsappLink(String(r.payload.phone), appointmentReminderText(profile, r.payload))} target="_blank" rel="noreferrer"><MessageCircle />Gönder</a>
                </Button>
              ) : <span className="text-xs text-muted-foreground">Telefon yok</span>}
            </div>
          ))}
        </section>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
        <Input aria-label="İsme göre ara" placeholder="İsme göre ara…" className="h-11 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" variant={view === "all" ? "default" : "secondary"} onClick={() => setView("all")}>Tüm tarihler</Button>
        <Button size="sm" variant={view === "day" ? "default" : "secondary"} onClick={() => setView("day")}>Gün gün</Button>
        <Button size="sm" variant={view === "month" ? "default" : "secondary"} onClick={() => setView("month")}>Takvim</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant={view === "archive" ? "default" : "secondary"} onClick={() => setView("archive")}>
          <Archive /> Arşiv{archivedCount ? ` (${archivedCount})` : ""}
        </Button>
        <span className="flex items-center justify-end px-2 text-xs text-muted-foreground">{rows.length} randevu gösteriliyor</span>
      </div>

      {view === "month" && <section className="space-y-3 rounded-2xl border bg-card p-3 sm:p-4">
        <div className="flex items-center justify-between"><Button variant="secondary" size="icon" aria-label="Önceki ay" onClick={() => { const d = new Date(`${calendarMonth}-01T12:00:00`); d.setMonth(d.getMonth() - 1); setDay(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`); }}><ChevronLeft/></Button><h2 className="font-semibold capitalize">{calendarStart.toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}</h2><Button variant="secondary" size="icon" aria-label="Sonraki ay" onClick={() => { const d = new Date(`${calendarMonth}-01T12:00:00`); d.setMonth(d.getMonth() + 1); setDay(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`); }}><ChevronRight/></Button></div>
        <div className="grid grid-cols-7 gap-1">{["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pa"].map((x) => <span key={x} className="py-1 text-center text-[10px] font-semibold text-muted-foreground">{x}</span>)}{Array.from({ length: calendarOffset }, (_, i) => <span key={`blank-${i}`}/>)}{Array.from({ length: calendarDays }, (_, i) => { const date = `${calendarMonth}-${String(i + 1).padStart(2, "0")}`; const count = (recs.data ?? []).filter((r) => !r.payload.archived && r.payload.date === date).length; return <button type="button" key={date} onClick={() => { setDay(date); setView("day"); }} className={`min-h-14 rounded-xl border p-1 text-left text-xs transition hover:border-violet-500 ${date === today ? "border-violet-500 bg-violet-500/10" : "border-border"}`}><span className="font-semibold">{i + 1}</span>{count > 0 && <span className="mt-1 block truncate rounded-md bg-violet-500/15 px-1 text-[9px] font-semibold text-violet-700 dark:text-violet-300">{count} randevu</span>}</button>; })}</div>
        <p className="text-xs text-muted-foreground">Bir güne dokunarak o günün randevularını açın.</p>
      </section>}

      {view === "day" && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon" aria-label="Önceki gün" onClick={() => shiftDay(-1)}><ChevronLeft /></Button>
          <Input type="date" aria-label="Gün" className="h-10 flex-1" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <Button variant="secondary" size="icon" aria-label="Sonraki gün" onClick={() => shiftDay(1)}><ChevronRight /></Button>
          <Button variant="ghost" size="sm" onClick={() => setDay(todayISO())}>Bugün</Button>
        </div>
      )}

      {view === "month" ? null : view === "archive" ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Silinen randevular burada durur; geri alabilir veya kalıcı silebilirsiniz.</p>
          {archivedCount > 0 && <Button size="sm" variant="ghost" className="text-destructive" onClick={purgeAll}>Arşivi boşalt</Button>}
        </div>
      ) : (
        <div className="flex gap-2">
          {["", ...STATUSES].map((s) => (
            <Button key={s || "all"} size="sm" variant={status === s ? "default" : "secondary"} onClick={() => setStatus(s)}>
              {s || "Tümü"}
            </Button>
          ))}
        </div>
      )}

      {recs.error && <p className="text-destructive">Randevular yüklenemedi.</p>}

      {view !== "month" && groups.map(([date, list]) => (
        <section key={date} className="space-y-2">
          <h2 className={"text-sm font-semibold " + (date === today ? "text-primary" : "text-muted-foreground")}>
            {date === today ? "Bugün · " : ""}
            {formatDate(date)}
          </h2>
          {list.map((r) => {
            const due = r.payload.status === "Bekliyor" && now >= apptStart(r.payload);
            const phone = String(r.payload.phone ?? "");
            return (
              <SwipeRow key={r.id} onDelete={() => (view === "archive" ? purge(r) : setArchived(r, true))} onComplete={view !== "archive" && me.data?.isUsta && r.payload.status !== "Tamamlandı" ? () => void completeAppointment(r) : undefined}>
                <div className="space-y-3 p-4">
                  <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setEdit({ id: r.id, owner_id: r.owner_id, payload: r.payload })}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{String(r.payload.name)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {String(r.payload.time ?? "")} {r.payload.title ? "· " + r.payload.title : ""}
                      </p>
                    </div>
                    <span className={"rounded-full px-2 py-1 text-xs " + (r.payload.status === "Geldi" ? "bg-primary/15 text-primary" : r.payload.status === "İptal" ? "bg-destructive/15 text-destructive" : due ? "bg-warning/20 text-warning" : "bg-secondary")}>
                      {due ? "Zamanı geldi" : String(r.payload.status ?? "Bekliyor")}
                    </span>
                  </button>
                  {(
                    <div className="flex items-center gap-2">
                      {view === "archive" ? (
                        <>
                          <Button variant="secondary" className="h-11 flex-1" onClick={() => setArchived(r, false)}>
                            <Undo2 />
                            Geri al
                          </Button>
                          <Button variant="ghost" className="h-11 text-destructive hover:bg-destructive/10" onClick={() => purge(r)}>
                            <Trash2 />
                            Kalıcı sil
                          </Button>
                        </>
                      ) : null}
                      {view !== "archive" && due && (
                        <Button className="h-11 flex-1" onClick={() => openStartJob(r)}>
                          <Play />
                          İşi başlat
                        </Button>
                      )}
                      {view !== "archive" && phone && (
                        <>
                          <Button asChild variant="secondary" size="icon" className="h-11 w-11" title="Ara">
                            <a href={"tel:" + phone}><Phone /></a>
                          </Button>
                          <Button asChild variant="secondary" size="icon" className="h-11 w-11" title="WhatsApp ile hatırlat">
                            <a target="_blank" rel="noreferrer" href={whatsappLink(phone, appointmentReminderText(profile, r.payload))}>
                              <MessageCircle />
                            </a>
                          </Button>
                        </>
                      )}
                      {view !== "archive" && (
                        <Button variant="ghost" size="icon" className="ml-auto h-11 w-11 text-destructive hover:bg-destructive/10" title="Sil (arşive taşı)" onClick={() => setArchived(r, true)}>
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </SwipeRow>
            );
          })}
        </section>
      ))}
      {view !== "month" && !rows.length && !recs.isLoading && (
        <p className="py-8 text-center text-muted-foreground">{q ? "Bu isimle randevu bulunamadı." : view === "archive" ? "Arşiv boş." : view === "day" ? "Bu gün için randevu yok." : "Randevu yok."}</p>
      )}

      <FormDrawer open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? "Randevuyu düzenle" : "Yeni randevu"} busy={save.isPending} onSubmit={submitAppointment}>
        {edit && (
          <>
            <div className="space-y-2">
              <Label htmlFor="ap-name">İsim</Label>
              <Input id="ap-name" required list="ap-customers" autoComplete="off" value={String(edit.payload.name ?? "")} onChange={(e) => setPickedName(e.target.value)} />
              <datalist id="ap-customers">
                {(customers.data ?? []).map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ap-date">Tarih</Label>
                <Input id="ap-date" type="date" required value={String(edit.payload.date ?? "")} onChange={(e) => upd("date", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ap-time">Saat</Label>
                <Input id="ap-time" type="time" required value={String(edit.payload.time ?? "")} onChange={(e) => upd("time", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap-phone">Telefon</Label>
              <Input id="ap-phone" type="tel" value={String(edit.payload.phone ?? "")} onChange={(e) => upd("phone", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap-title">Konu</Label>
              <Input id="ap-title" value={String(edit.payload.title ?? "")} onChange={(e) => upd("title", e.target.value)} />
            </div>
            <div className="space-y-2"><Label htmlFor="ap-price">Tahmini iş tutarı (₺)</Label><Input id="ap-price" type="number" min="0" step="0.01" value={String(edit.payload.price ?? "")} onChange={(e) => upd("price", e.target.value)}/></div>
            <label className="flex min-h-12 items-center gap-3 rounded-xl border px-3"><input type="checkbox" checked={edit.payload.outdoor === true} onChange={(e) => setEdit((current) => current && ({ ...current, payload: { ...current.payload, outdoor: e.target.checked } }))}/><span className="text-sm">Açık alan randevusu</span></label>
            {appointmentCredit?.blocked && <div role="alert" className="space-y-2 rounded-xl border-2 border-destructive/70 bg-destructive/10 p-3 text-sm"><p className="font-semibold text-destructive">Cari kilidi · {appointmentCustomer?.name}</p><ul className="list-disc pl-5 text-destructive">{appointmentCredit.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="text-xs">Randevuyu kaydetmek için tahsilat alın veya yönetici istisna gerekçesi yazın.</p><Textarea required aria-label="Yönetici istisna gerekçesi" value={String(edit.payload.override_reason ?? "")} onChange={(e) => upd("override_reason", e.target.value)} placeholder="İstisna gerekçesi"/></div>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ap-remind">Hatırlat</Label>
                <select id="ap-remind" className="h-11 w-full rounded-md border bg-secondary px-3 text-sm" value={String(edit.payload.remind ?? "30")} onChange={(e) => upd("remind", e.target.value)}>
                  {REMIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ap-status">Durum</Label>
                <select id="ap-status" className="h-11 w-full rounded-md border bg-secondary px-3 text-sm" value={String(edit.payload.status ?? "Bekliyor")} onChange={(e) => upd("status", e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap-notes">Not</Label>
              <Input id="ap-notes" value={String(edit.payload.notes ?? "")} onChange={(e) => upd("notes", e.target.value)} />
            </div>
          </>
        )}
      </FormDrawer>

      <FormDrawer open={!!job} onOpenChange={(o) => !o && setJob(null)} title="İşi başlat" busy={saveJob.isPending} onSubmit={() => void startJob()}>
        {job && <JobFormBody form={job.form} onChange={(form) => setJob({ ...job, form })} customers={customers.data ?? []} members={members} equipment={equipment.data ?? []} jobs={jobsAll.data ?? []} startingNow />}
      </FormDrawer>
      <FormDrawer open={Boolean(receiptFile)} onOpenChange={(o) => !o && setReceiptFile(null)} title="İş makbuzu hazır" submitLabel="Makbuzu paylaş / indir" onSubmit={() => { if (receiptFile) void shareOrDownload(receiptFile).then(() => setReceiptFile(null)); }}>
        <div className="space-y-3 rounded-2xl border bg-card p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-700"><Download/></div><div><p className="font-semibold">Cari borç işlendi</p><p className="text-sm text-muted-foreground">Makbuz PDF’i oluşturuldu. Paylaşım ekranını açmak için alttaki düğmeye dokunun.</p></div></div>{receiptFile && <p className="text-xs text-muted-foreground">{receiptFile.name} · {Math.max(1, Math.round(receiptFile.size / 1024))} KB</p>}</div>
      </FormDrawer>
    </div>
  );
}
