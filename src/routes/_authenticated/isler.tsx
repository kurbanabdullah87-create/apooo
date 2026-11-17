import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Play, Pause, Check, Copy, ChevronDown, Clock, Download, Search, X, CalendarCheck, Activity, Phone, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormDrawer } from "@/components/app/forms/FormDrawer";
import { JobFormBody, MachineInfo } from "@/components/app/JobFormBody";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MediaTools } from "@/components/app/MediaTools";
import { useCustomers, useExpenses } from "@/lib/data";
import { useMembers } from "@/lib/job-fields";
import { RouteButtons } from "@/components/app/RouteButtons";
import { LocationButton } from "@/components/app/LocationButton";
import { VoiceNoteButton } from "@/components/app/VoiceNoteButton";
import { useMe } from "@/hooks/use-me";
import { supabase } from "@/integrations/supabase/client";
import {
  useRecords,
  useSaveRecord,
  elapsedSeconds,
  hourlyCharge,
  payrollEntryAmount,
  maintenanceStatus,
  validateJobForm,
  pageHead,
  type Payload,
  type WorkRecord,
} from "@/lib/work";
import { todayISO, formatTL } from "@/lib/finance";
import { applyVoiceJob, parseVoiceJob } from "@/lib/voice-job";
import { whatsappLink } from "@/lib/templates";
import { SwipeRow } from "@/components/app/SwipeRow";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/isler")({
  head: () => pageHead("İşler", "İş planı, çalışma süreleri ve saha kayıtları."),
  component: Jobs,
});

const STATUSES = ["Bekliyor", "Devam Ediyor", "Tamamlandı", "Ertelendi"];

function Jobs() {
  const jobs = useRecords("job");
  const templates = useRecords("job_template");
  const saveTemplate = useSaveRecord("job_template");
  const save = useSaveRecord("job");
  const customers = useCustomers();
  const payrollRows = useRecords("payroll");
  const expenses = useExpenses();
  const equipment = useRecords("equipment");
  const me = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkRecord>();
  const [form, setForm] = useState<Payload>({});
  const [filter, setFilter] = useState("Tümü");
  const [searchQuery, setSearchQuery] = useState("");
  const [date, setDate] = useState(todayISO());
  const [showProgress, setShowProgress] = useState(true);
  const [expanded, setExpanded] = useState<string>();
  const [now, setNow] = useState(Date.now());
  const [billing, setBilling] = useState(false);
  const [weather, setWeather] = useState("");
  const [dur, setDur] = useState<{ job: WorkRecord; h: string; m: string } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const members = useMembers();

  function edit(j?: WorkRecord, p?: Payload) {
    setEditing(j);
    setForm(
      j
        ? { ...j.payload, owner_id: j.owner_id }
        : {
            title: "",
            date,
            seconds: 0,
            started_at: null,
            status: "Bekliyor",
            vat_rate: 0,
            equipment_id: null,
            owner_id: me.data?.id,
            ...p,
          },
    );
    setOpen(true);
  }

  async function change(j: WorkRecord, p: Payload) {
    await save.mutateAsync({ id: j.id, owner_id: j.owner_id, payload: p });
  }

  async function bill(j: WorkRecord) {
    setBilling(true);
    try {
      const { error } = await supabase.rpc("bill_job", { _job_id: j.id });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["work"] }),
        qc.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
      toast.success("Borç cariye işlendi.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cariye işlenemedi");
    } finally {
      setBilling(false);
    }
  }

  /** İşi tamamlar (cariden bağımsız). Süreyi makine sayacına ekleme işini veritabanı tetikleyicisi bir kez yapar. */
  async function complete(j: WorkRecord, seconds: number) {
    const p = j.payload;
    const secs = Math.round(seconds);
    const eq = equipment.data?.find((e) => e.id === p.equipment_id);
    if (eq && secs < 60 && !confirm("Bu işin süresi 0. Makine sayacına süre eklenmeyecek. Yine de tamamlansın mı? (Süreyi sonradan 'Süreyi düzenle' ile girebilirsiniz.)")) return;
    await change(j, { ...p, seconds: secs, started_at: null, status: "Tamamlandı", completed_at: new Date().toISOString() });
    if (!eq) return;
    const applied = p.machine_applied_to === eq.id ? Number(p.machine_applied_seconds ?? 0) : 0;
    const m = maintenanceStatus(eq.payload, Date.now(), secs - applied);
    toast.info(`${String(eq.payload.name)} sayacına ${((secs - applied) / 3600).toFixed(2)} saat eklenecek.`);
    if (m.level === "over") toast.error(`${String(eq.payload.name)}: bakım zamanı geçti (${(-m.remaining).toFixed(1)} saat)`);
    else if (m.level === "warn") toast.warning(`${String(eq.payload.name)}: bakıma ${m.remaining.toFixed(1)} saat kaldı`);
  }

  async function downloadJobReport(job: WorkRecord, share = false) {
    try {
      const [{ jsPDF }, customer] = await Promise.all([
        import("jspdf"),
        Promise.resolve(customers.data?.find((item) => item.id === job.payload.customer_id)),
      ]);
      const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
      const loadFont = async (path: string) => {
        const bytes = new Uint8Array(await (await fetch(path)).arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
      };
      doc.addFileToVFS("DejaVuSans.ttf", await loadFont("/fonts/DejaVuSans.ttf"));
      doc.addFileToVFS("DejaVuSans-Bold.ttf", await loadFont("/fonts/DejaVuSans-Bold.ttf"));
      doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
      doc.addFont("DejaVuSans-Bold.ttf", "DejaVu", "bold");
      const margin = 18;
      let y = 22;
      doc.setFillColor(15, 31, 54); doc.rect(0, 0, 210, 42, "F");
      doc.setFont("DejaVu", "bold"); doc.setFontSize(19); doc.setTextColor(255, 255, 255); doc.text("SAHA · İŞ RAPORU", margin, y);
      y += 10; doc.setFont("DejaVu", "normal"); doc.setFontSize(9); doc.setTextColor(205, 219, 235); doc.text(`Rapor tarihi: ${new Date().toLocaleString("tr-TR")}`, margin, y);
      y = 56;
      const section = (title: string) => { doc.setFont("DejaVu", "bold"); doc.setFontSize(11); doc.setTextColor(15, 31, 54); doc.text(title, margin, y); y += 3; doc.setDrawColor(220, 227, 236); doc.line(margin, y, 192, y); y += 8; };
      const field = (label: string, value: unknown) => {
        const val = String(value ?? "—").trim() || "—";
        doc.setFont("DejaVu", "bold"); doc.setFontSize(8.5); doc.setTextColor(88, 101, 119); doc.text(label, margin, y);
        doc.setFont("DejaVu", "normal"); doc.setTextColor(25, 35, 48);
        const lines = doc.splitTextToSize(val, 125) as string[];
        doc.text(lines, 63, y); y += Math.max(7, lines.length * 4.5);
      };
      section("İŞ BİLGİLERİ");
      field("İş", job.payload.title); field("Müşteri", customer?.name ?? "Kayıtlı müşteri yok");
      if (customer?.phone) field("Telefon", customer.phone);
      field("Tarih", job.payload.date); field("Durum", job.payload.status);
      field("Adres", job.payload.address || customer?.address || "—");
      field("Ekipman", equipment.data?.find((item) => item.id === job.payload.equipment_id)?.payload.name ?? (job.payload.no_machine ? "Makinesiz" : "—"));
      field("Açıklama", job.payload.notes);
      y += 3; section("SÜRE VE ÜCRET");
      const seconds = elapsedSeconds(job.payload, Date.now());
      field("Çalışma süresi", `${Math.floor(seconds / 3600)} sa ${Math.floor((seconds % 3600) / 60)} dk`);
      field("Ücret", formatTL(Number(job.payload.hourly_rate) > 0 ? hourlyCharge(seconds, Number(job.payload.hourly_rate)) : Number(job.payload.price ?? 0)));
      field("Malzeme maliyeti", formatTL(Number(job.payload.material_cost ?? 0)));
      if (job.payload["estimated_profit_margin"] != null) field("Tahmini kâr marjı", `%${Number(job.payload["estimated_profit_margin"]).toFixed(1)}`);
      doc.setFont("DejaVu", "normal"); doc.setFontSize(7.5); doc.setTextColor(115, 126, 141);
      doc.text("Bu rapor uygulamadaki iş kaydına dayanır; fatura veya resmi belge yerine geçmez.", margin, 282, { maxWidth: 175 });
      const filename = `saha-is-raporu-${String(job.payload.date ?? todayISO())}.pdf`;
      const blob = doc.output("blob");
      if (share && typeof File !== "undefined") {
        const file = new File([blob], filename, { type: "application/pdf" });
        if (navigator.canShare?.({ files: [file] }) && navigator.share) {
          await navigator.share({ title: `İş raporu · ${String(job.payload.title ?? "Saha")}`, files: [file] });
          toast.success("İş raporu paylaşım ekranında açıldı.");
          return;
        }
      }
      doc.save(filename);
      toast.success(share ? "Bu cihazda doğrudan paylaşım desteklenmiyor; PDF indirildi." : "İş raporu PDF olarak indirildi.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
      toast.error("İş raporu oluşturulamadı. Yeniden deneyin.");
    }
  }

  function getWeather() {
    if (!navigator.geolocation) {
      setWeather("Konum desteklenmiyor");
      return;
    }
    setWeather("Hava durumu alınıyor…");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const r = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,precipitation,wind_speed_10m&timezone=auto`,
          );
          if (!r.ok) throw new Error();
          const w = await r.json();
          setWeather(
            `${w.current.temperature_2m}°C · Yağış ${w.current.precipitation} mm · Rüzgâr ${w.current.wind_speed_10m} km/sa`,
          );
        } catch {
          setWeather("Hava durumu alınamadı");
        }
      },
      () => setWeather("Konum izni verilmedi"),
    );
  }

  const dateRows = (jobs.data ?? []).filter((job) => !date || job.payload.date === date);
  const statusCounts = Object.fromEntries(["Tümü", ...STATUSES].map((status) => [
    status,
    status === "Tümü" ? dateRows.length : dateRows.filter((job) => String(job.payload.status ?? "Bekliyor") === status).length,
  ])) as Record<string, number>;
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("tr-TR");
  const rows = dateRows.filter((job) => {
    if (filter !== "Tümü" && String(job.payload.status ?? "Bekliyor") !== filter) return false;
    if (!normalizedQuery) return true;
    const customer = customers.data?.find((item) => item.id === job.payload.customer_id);
    const machine = equipment.data?.find((item) => item.id === job.payload.equipment_id);
    const assigned = members.find((item) => item.id === job.owner_id);
    const searchable = [job.payload.title, customer?.name, customer?.phone, job.payload.address, customer?.address, job.payload.notes, machine?.payload.name, assigned?.username]
      .map((value) => String(value ?? "").toLocaleLowerCase("tr-TR"));
    return searchable.some((value) => value.includes(normalizedQuery));
  });
  const runningCount = dateRows.filter((job) => Boolean(job.payload.started_at) && job.payload.status !== "Tamamlandı").length;
  const completedCount = dateRows.filter((job) => job.payload.status === "Tamamlandı").length;
  const dateOffset = (days: number) => {
    const target = new Date(`${todayISO()}T12:00:00`);
    target.setDate(target.getDate() + days);
    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">İşler</h1>
        {me.data?.isUsta && (
          <Button onClick={() => edit()}>
            <Plus />
            İş ekle
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="İş günü"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border bg-secondary p-2 text-sm"
        />
        <Button variant="ghost" size="sm" onClick={() => setDate("")}>
          Tüm tarihler
        </Button>
        <Button variant={date === todayISO() ? "secondary" : "outline"} size="sm" onClick={() => setDate(todayISO())}><CalendarCheck className="size-4"/>Bugün</Button>
        <Button variant={date === dateOffset(1) ? "secondary" : "outline"} size="sm" onClick={() => setDate(dateOffset(1))}>Yarın</Button>
        <Button variant="outline" size="sm" onClick={getWeather}>
          Hava durumu
        </Button>
      </div>
      {weather && <p className="text-sm text-muted-foreground">{weather}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5"><Activity className="size-4 text-primary"/><span className="text-xs text-muted-foreground">Görünen tarihte</span><span className="ml-auto font-semibold">{dateRows.length}</span></div>
        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5"><Play className="size-4 text-emerald-500"/><span className="text-xs text-muted-foreground">Çalışıyor</span><span className="ml-auto font-semibold">{runningCount}</span></div>
        <div className="col-span-2 flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 sm:col-span-1"><Check className="size-4 text-sky-500"/><span className="text-xs text-muted-foreground">Tamamlandı</span><span className="ml-auto font-semibold">{completedCount}{dateRows.length ? ` / ${dateRows.length}` : ""}</span></div>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
        <Input aria-label="İşlerde ara" className="h-11 pl-9 pr-10" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="İş, müşteri, telefon, adres veya ekipman ara"/>
        {searchQuery && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-9 -translate-y-1/2" aria-label="Aramayı temizle" onClick={() => setSearchQuery("")}><X className="size-4"/></Button>}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="İş durumu filtresi">
        {["Tümü", ...STATUSES].map((status) => <Button key={status} type="button" size="sm" variant={filter === status ? "default" : "outline"} className="shrink-0" aria-pressed={filter === status} onClick={() => setFilter(status)}>{status}<span className="ml-1 rounded-full bg-background/20 px-1.5 text-[10px]">{statusCounts[status] ?? 0}</span></Button>)}
      </div>
      {me.data?.isUsta && !!templates.data?.length && (
        <div className="flex flex-wrap gap-2">
          {templates.data.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant="secondary"
              onClick={() => edit(undefined, t.payload)}
            >
              <Copy />
              {t.payload.title}
            </Button>
          ))}
        </div>
      )}
      {jobs.error && <p className="text-destructive">İşler yüklenemedi.</p>}
      {jobs.isLoading ? (
        <div className="space-y-3" aria-label="İşler yükleniyor" aria-busy="true">{[0, 1, 2].map((key) => <div key={key} className="space-y-3 rounded-2xl border bg-card p-4"><Skeleton className="h-5 w-2/5"/><Skeleton className="h-4 w-3/5"/><Skeleton className="h-10 w-full"/></div>)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center"><Search className="mx-auto size-6 text-muted-foreground"/><p className="mt-2 text-sm font-medium">{normalizedQuery ? "Aramayla eşleşen iş bulunamadı." : filter !== "Tümü" ? `${filter} durumunda iş yok.` : "Bu tarihte iş yok."}</p>{(normalizedQuery || filter !== "Tümü") && <Button className="mt-3" size="sm" variant="secondary" onClick={() => { setSearchQuery(""); setFilter("Tümü"); }}>Filtreleri temizle</Button>}</div>
      ) : (
        rows.map((j, index) => {
          const p = j.payload;
          const seconds = elapsedSeconds(p, now);
          const customer = customers.data?.find((c) => c.id === p.customer_id);
          const address = String(p.address || customer?.address || "");
          return (
            <SwipeRow key={j.id} {...(me.data?.isUsta && p.status !== "Tamamlandı" ? { onComplete: () => void complete(j, seconds) } : {})}>
            <article className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold break-words">
                    {index + 1}. {p.title}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {[customer?.name, p.date, p.time].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="İş detayları"
                  onClick={() => setExpanded(expanded === j.id ? undefined : j.id)}
                >
                  <ChevronDown />
                </Button>
              </div>
              {Boolean(p.equipment_id) && <MachineInfo equipment={equipment.data ?? []} id={String(p.equipment_id)} />}
              <div className="flex items-center justify-between">
                <span className={p.status === "Tamamlandı" ? "text-success" : "text-warning"}>
                  {p.status}
                </span>
                <span className="num">
                  {Math.floor(seconds / 3600)}:
                  {String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:
                  {String(Math.floor(seconds) % 60).padStart(2, "0")}
                </span>
              </div>
              {me.data?.isUsta && (
                <>
                  <p className="num text-primary">
                    {formatTL(
                      Number(p.hourly_rate) > 0
                        ? hourlyCharge(seconds, Number(p.hourly_rate))
                        : Number(p.price ?? 0),
                    )}
                  </p>
                  {customer?.phone && <div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><a href={`tel:${customer.phone}`} aria-label={`${customer.name} müşterisini ara`}><Phone className="size-4"/>Ara</a></Button><Button asChild variant="outline" size="sm"><a href={whatsappLink(customer.phone, `Merhaba ${customer.name}, ${String(p.title ?? "işiniz")} için iletişime geçiyorum.`)} target="_blank" rel="noreferrer"><MessageCircle className="size-4"/>WhatsApp</a></Button></div>}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={save.isPending || Boolean(p.billed) || p.status === "Tamamlandı"}
                      onClick={() =>
                        void change(j, {
                          ...p,
                          seconds,
                          started_at: p.started_at ? null : new Date().toISOString(),
                          status: p.started_at ? "Bekliyor" : "Devam Ediyor",
                        })
                      }
                    >
                      {p.started_at ? <Pause /> : <Play />}
                      {p.started_at ? "Duraklat" : "Başlat"}
                    </Button>
                    {p.status !== "Tamamlandı" && (
                      <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => void complete(j, seconds)}>
                        <Check />
                        İşi tamamla
                      </Button>
                    )}
                    {p.status === "Tamamlandı" && !p.billed && (
                      <Button size="sm" variant="outline" onClick={() => setDur({ job: j, h: String(Math.floor(Number(p.seconds ?? 0) / 3600)), m: String(Math.round((Number(p.seconds ?? 0) % 3600) / 60)) })}>
                        <Clock />
                        Süreyi düzenle
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={billing || Boolean(p.billed) || !navigator.onLine}
                      onClick={() => void bill(j)}
                    >
                      <Check />
                      {p.billed ? "Cariye işlendi" : "Cariye işle"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={Boolean(p.billed)}
                      onClick={() => edit(j)}
                    >
                      Düzenle
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={async () => {
                        if (confirm("Bu işi silmek istediğinize emin misiniz?")) {
                          // Önce transactions tablosundaki olası bağlantı sütunlarını temizliyoruz
                          await supabase.from("transactions").delete().eq("job_record_id", j.id);

                          // Şimdi işi siliyoruz
                          const { error } = await supabase.from("work_records").delete().eq("id", j.id);
                          if (error) {
                            alert("Silinemedi: " + error.message);
                          } else {
                            window.location.reload();
                          }
                        }
                      }}
                    >
                      Sil
                    </Button>
                  </div>
                </>
              )}
              <RouteButtons p={{ ...p, address }} />
              {expanded === j.id && (
                <div className="space-y-3 border-t pt-3">
                  <p className="text-sm break-words">{p.notes}</p>
                  {me.data?.isUsta && (
                    <>
                      <select
                        aria-label="İş durumunu değiştir"
                        className="w-full rounded-md border bg-secondary p-2"
                        disabled={Boolean(p.billed)}
                        value={String(p.status)}
                        onChange={(e) => (e.target.value === "Tamamlandı" ? void complete(j, seconds) : void change(j, { ...p, status: e.target.value }))}
                      >
                        {STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          saveTemplate.mutate({
                            payload: {
                              title: p.title,
                              hourly_rate: p.hourly_rate,
                              price: p.price,
                              material_cost: p.material_cost,
                              vat_rate: p.vat_rate,
                              notes: p.notes,
                            },
                          })
                        }
                      >
                        <Copy />
                        Şablon olarak kaydet
                      </Button>
                    </>
                  )}
                  <MediaTools record={j} readOnly={!me.data?.isUsta} onSave={(p) => change(j, p)} />
                  {me.data?.isUsta && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => void downloadJobReport(j)}><Download className="size-4"/>PDF indir</Button><Button variant="secondary" size="sm" onClick={() => void downloadJobReport(j, true)}><Share2 className="size-4"/>PDF paylaş</Button></div>}
                </div>
              )}
            </article>
            </SwipeRow>
          );
        })
      )}
      <FormDrawer
        open={open}
        onOpenChange={setOpen}
        title={editing ? "İşi düzenle" : "Yeni iş"}
        busy={save.isPending}
        onSubmit={() => {
          if (!String(form.title ?? "").trim()) return void toast.error("İş adı gerekli");
          const v = validateJobForm(form, equipment.data ?? [], jobs.data ?? [], editing?.id);
          if (v.error) return void toast.error(v.error);
          v.warnings.forEach((w) => toast.warning(w));
          const quote = Number(form.price ?? 0) || Number(form.hourly_rate ?? 0) * Number(form.planned_hours ?? 0);
          const linkedLabor = editing ? (payrollRows.data ?? []).filter((r) => r.payload["job_id"] === editing.id).reduce((sum, r) => sum + payrollEntryAmount(r.payload), 0) : 0;
          const linkedExpense = editing ? (expenses.data ?? []).filter((r) => r.job_record_id === editing.id).reduce((sum, r) => sum + r.amount, 0) : 0;
          const costs = Number(form.material_cost ?? 0) + (linkedLabor || Number(form["estimated_labor_cost"] ?? 0)) + (linkedExpense || Number(form["estimated_expense_cost"] ?? 0));
          const estimated_profit_margin = quote > 0 ? Math.round(((quote - costs) / quote) * 10000) / 100 : null;
          const { owner_id, ...payload } = form;
          save.mutate(
            { id: editing?.id, owner_id: String(owner_id ?? me.data?.id), payload: { ...payload, estimated_profit_margin } },
            { onSuccess: () => setOpen(false) },
          );
        }}
      >
        <JobFormBody form={form} onChange={setForm} customers={customers.data ?? []} members={members} equipment={equipment.data ?? []} jobs={jobs.data ?? []} selfId={editing?.id}>
          <LocationButton value={form} onChange={setForm} />
          <VoiceNoteButton onText={(t) => {
            const draft = parseVoiceJob(t, customers.data ?? []);
            setForm((current) => applyVoiceJob(current, draft));
            toast.success(`Sesli taslak dolduruldu${draft.customer ? ` · ${draft.customer.name}` : ""}${draft.plannedHours ? ` · ${draft.plannedHours} sa` : ""}${draft.price ? ` · ${formatTL(draft.price)}` : ""}`);
          }} />
        </JobFormBody>
      </FormDrawer>
      <FormDrawer
        open={!!dur}
        onOpenChange={(o) => !o && setDur(null)}
        title="Çalışma süresini düzenle"
        busy={save.isPending}
        onSubmit={() => {
          if (!dur) return;
          const secs = Math.max(0, Math.round(Number(dur.h || 0) * 3600 + Number(dur.m || 0) * 60));
          void change(dur.job, { ...dur.job.payload, seconds: secs }).then(() => setDur(null));
        }}
      >
        {dur && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="dur-h">Saat</Label><Input id="dur-h" className="h-12" type="number" min="0" inputMode="numeric" value={dur.h} onChange={(e) => setDur({ ...dur, h: e.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="dur-m">Dakika</Label><Input id="dur-m" className="h-12" type="number" min="0" max="59" inputMode="numeric" value={dur.m} onChange={(e) => setDur({ ...dur, m: e.target.value })} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Makine sayacına yalnızca eski ve yeni süre arasındaki fark eklenir ya da düşülür.</p>
          </>
        )}
      </FormDrawer>
    </div>
  );
}
