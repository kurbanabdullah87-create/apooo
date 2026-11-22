import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Play, Pause, Check, Copy, ChevronDown, Clock, Download, Search, X, CalendarCheck, Activity, Phone, MessageCircle, Share2, FileText, ClipboardCheck, Mail, LayoutGrid, LayoutList, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormDrawer } from "@/components/app/forms/FormDrawer";
import { JobFormBody, MachineInfo } from "@/components/app/JobFormBody";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  jobPriorityScore,
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
import { scanJobRequestEmails, type GmailJobRequest } from "@/lib/gmail-bank";

export const Route = createFileRoute("/_authenticated/isler")({
  head: () => pageHead("İşler", "İş planı, çalışma süreleri ve saha kayıtları."),
  component: Jobs,
});

const STATUSES = ["Teklif", "Bekliyor", "Devam Ediyor", "Tamamlandı", "Ertelendi"];
type ChecklistItem = { label: string; done: boolean };
function checklistFor(payload: Payload): ChecklistItem[] {
  try {
    const parsed: unknown = JSON.parse(String(payload.checklist_json ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ChecklistItem => typeof item === "object" && item !== null && typeof item.label === "string" && typeof item.done === "boolean");
  } catch { return []; }
}

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
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [date, setDate] = useState(todayISO());
  const [quickRange, setQuickRange] = useState<"" | "today" | "week" | "month">("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [minimumAmount, setMinimumAmount] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [showProgress, setShowProgress] = useState(true);
  const [expanded, setExpanded] = useState<string>();
  const [now, setNow] = useState(Date.now());
  const [billing, setBilling] = useState(false);
  const [weather, setWeather] = useState("");
  const [dur, setDur] = useState<{ job: WorkRecord; h: string; m: string } | null>(null);
  const [emailPanel, setEmailPanel] = useState(false);
  const [emailConsent, setEmailConsent] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailRequests, setEmailRequests] = useState<GmailJobRequest[]>([]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(searchQuery), 300); return () => window.clearTimeout(timer); }, [searchQuery]);

  const members = useMembers();

  const edit = useCallback((j?: WorkRecord, p?: Payload) => {
    setEditing(j);
    setForm(
      j
        ? { ...j.payload, checklist_draft: checklistFor(j.payload).map((item) => item.label).join("\n"), owner_id: j.owner_id }
        : {
            title: "",
            date,
            seconds: 0,
            started_at: null,
            status: "Bekliyor",
            checklist_draft: "",
            vat_rate: 0,
            equipment_id: null,
            owner_id: me.data?.id,
            ...p,
          },
    );
    setOpen(true);
  }, [date, me.data?.id]);

  useEffect(() => {
    const openJobForm = () => edit();
    window.addEventListener("saha-open-job-form", openJobForm);
    return () => window.removeEventListener("saha-open-job-form", openJobForm);
  }, [edit]);

  useEffect(() => {
    try {
      if (jobs.isLoading) return;
      const requested = sessionStorage.getItem("saha.openJobForm");
      if (!requested) return;
      sessionStorage.removeItem("saha.openJobForm");
      if (requested === "camera") {
        const target = (jobs.data ?? []).find((job) => !["Tamamlandı", "İptal"].includes(String(job.payload.status)));
        if (target) {
          setDate(String(target.payload.date ?? todayISO())); setFilter("Tümü"); setExpanded(target.id);
          toast("İş açıldı. Fotoğrafı kayda eklemek için Öncesi veya Sonrası düğmesine dokun.");
          return;
        }
        edit(); toast("Önce işi kaydet; ardından iş kartındaki Fotoğraf düğmesiyle çekimi ekle.");
        return;
      }
      edit();
    } catch { /* optional cross-route quick action */ }
  }, [jobs.isLoading, jobs.data, edit]);

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
    const prerequisite = (jobs.data ?? []).find((candidate) => candidate.id === String(p.depends_on_job_id ?? ""));
    if (prerequisite && prerequisite.payload.status !== "Tamamlandı") {
      toast.error(`Önce “${String(prerequisite.payload.title)}” işinin tamamlanması gerekiyor.`);
      return;
    }
    const checklist = checklistFor(p);
    if (p.checklist_required === true && checklist.some((item) => !item.done)) {
      toast.error("İş kapatılamadı. Önce kontrol listesindeki bütün adımları tamamlayın.");
      setExpanded(j.id);
      return;
    }
    const secs = Math.round(seconds);
    let delayReason = String(p.delay_reason ?? "");
    if (p.promised_date && String(p.promised_date) < todayISO() && !delayReason.trim()) {
      const reason = window.prompt("Teslim tarihi geçti. Gecikme nedenini kaydedin:");
      if (!reason?.trim()) { toast.error("Gecikme nedeni girilmeden iş tamamlanamaz."); return; }
      delayReason = reason.trim().slice(0, 500);
    }
    const eq = equipment.data?.find((e) => e.id === p.equipment_id);
    if (eq && secs < 60 && !confirm("Bu işin süresi 0. Makine sayacına süre eklenmeyecek. Yine de tamamlansın mı? (Süreyi sonradan 'Süreyi düzenle' ile girebilirsiniz.)")) return;
    await change(j, { ...p, seconds: secs, started_at: null, status: "Tamamlandı", completed_at: new Date().toISOString(), ...(delayReason ? { delay_reason: delayReason } : {}) });
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
      const isQuote = job.payload.status === "Teklif";
      const margin = 18;
      let y = 22;
      doc.setFillColor(15, 31, 54); doc.rect(0, 0, 210, 42, "F");
      doc.setFont("DejaVu", "bold"); doc.setFontSize(19); doc.setTextColor(255, 255, 255); doc.text(isQuote ? "SAHA · FİYAT TEKLİFİ" : "SAHA · İŞ RAPORU", margin, y);
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
      section(isQuote ? "TEKLİF DETAYLARI" : "İŞ BİLGİLERİ");
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
      if (isQuote) field("Teklif tutarı", formatTL(Number(job.payload.price ?? 0) || Number(job.payload.planned_hours ?? 0) * Number(job.payload.hourly_rate ?? 0)));
      field("Malzeme maliyeti", formatTL(Number(job.payload.material_cost ?? 0)));
      if (job.payload["estimated_profit_margin"] != null) field("Tahmini kâr marjı", `%${Number(job.payload["estimated_profit_margin"]).toFixed(1)}`);
      doc.setFont("DejaVu", "normal"); doc.setFontSize(7.5); doc.setTextColor(115, 126, 141);
      doc.text(isQuote ? "Bu belge fiyat teklifidir; iş onayı veya fatura yerine geçmez." : "Bu rapor uygulamadaki iş kaydına dayanır; fatura veya resmi belge yerine geçmez.", margin, 282, { maxWidth: 175 });
      const filename = `${isQuote ? "saha-fiyat-teklifi" : "saha-is-raporu"}-${String(job.payload.date ?? todayISO())}.pdf`;
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

  async function scanRequestsFromGmail() {
    if (!emailConsent) { toast.error("Önce e-posta içeriğinin bu cihazda geçici işlenmesine izin ver."); return; }
    setEmailBusy(true);
    try {
      const requests = await scanJobRequestEmails();
      setEmailRequests(requests);
      toast.success(`${requests.length} olası iş talebi bulundu. Hiçbiri otomatik kaydedilmedi.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gmail taraması başarısız.");
    } finally { setEmailBusy(false); }
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

  const dateRange = (() => {
    const today = todayISO();
    if (quickRange === "today") return [today, today] as const;
    if (quickRange === "week") { const monday = new Date(`${today}T12:00:00`); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); const start = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`; return [start, today] as const; }
    if (quickRange === "month") return [today.slice(0, 7) + "-01", today] as const;
    return null;
  })();
  const dateRows = (jobs.data ?? []).filter((job) => {
    const rowDate = String(job.payload.date ?? "");
    if (dateRange) return rowDate >= dateRange[0] && rowDate <= dateRange[1];
    return !date || rowDate === date;
  });
  const statusCounts = Object.fromEntries(["Tümü", ...STATUSES].map((status) => [
    status,
    status === "Tümü" ? dateRows.length : dateRows.filter((job) => String(job.payload.status ?? "Bekliyor") === status).length,
  ])) as Record<string, number>;
  const normalizedQuery = debouncedQuery.trim().toLocaleLowerCase("tr-TR");
  const queryRows = dateRows.filter((job) => {
    const customer = customers.data?.find((item) => item.id === job.payload.customer_id);
    const amount = Number(job.payload.price ?? 0) || hourlyCharge(elapsedSeconds(job.payload, now), Number(job.payload.hourly_rate ?? 0));
    if (customerFilter && job.payload.customer_id !== customerFilter) return false;
    if (minimumAmount && amount < Number(minimumAmount)) return false;
    if (!normalizedQuery) return true;
    const machine = equipment.data?.find((item) => item.id === job.payload.equipment_id);
    const assigned = members.find((item) => item.id === job.owner_id);
    const searchable = [job.payload.title, customer?.name, customer?.phone, job.payload.address, customer?.address, job.payload.notes, machine?.payload.name, assigned?.username]
      .map((value) => String(value ?? "").toLocaleLowerCase("tr-TR"));
    return searchable.some((value) => value.includes(normalizedQuery));
  }).sort((a, b) => jobPriorityScore(b.payload) - jobPriorityScore(a.payload) || String(a.payload.time ?? "").localeCompare(String(b.payload.time ?? "")));
  const rows = queryRows.filter((job) => filter === "Tümü" || String(job.payload.status ?? "Bekliyor") === filter);
  const displayRows = viewMode === "kanban" ? queryRows : rows;
  const activeFilterCount = Number(Boolean(normalizedQuery)) + Number(filter !== "Tümü") + Number(Boolean(dateRange)) + Number(Boolean(customerFilter)) + Number(Boolean(minimumAmount));
  const capacityRows = (jobs.data ?? []).filter((job) => job.payload.date === date && job.payload.status !== "Tamamlandı" && job.payload.status !== "İptal");
  const capacity = members.map((member) => ({ member, count: capacityRows.filter((job) => job.owner_id === member.id).length })).filter((row) => row.count > 0).sort((a, b) => b.count - a.count);
  const runningCount = dateRows.filter((job) => Boolean(job.payload.started_at) && job.payload.status !== "Tamamlandı").length;
  const completedCount = dateRows.filter((job) => job.payload.status === "Tamamlandı").length;
  const dateOffset = (days: number) => {
    const target = new Date(`${todayISO()}T12:00:00`);
    target.setDate(target.getDate() + days);
    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">İşler</h1>
        {me.data?.isUsta && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => edit(undefined, { status: "Teklif" })}><FileText className="size-4"/>Teklif hazırla</Button><Button variant="outline" onClick={() => { setEmailPanel((open) => !open); setEmailRequests([]); }}><Mail className="size-4"/>E-postadan talep</Button><Button onClick={() => edit()}><Plus/>İş ekle</Button></div>}
      </div>
      {emailPanel && <section className="space-y-3 rounded-2xl border border-primary/20 bg-card p-4"><div><h2 className="font-semibold">Gmail’den iş talebi taslakları</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Son 90 günde konu satırında servis, bakım, arıza, onarım veya teklif geçen en fazla 30 ileti aranır. Gmail izni teknik olarak iletileri okuyabilir; içerik yalnızca tarayıcı belleğinde geçici işlenir ve aşağıdaki düğmeye basmadıkça iş kaydı oluşturulmaz.</p></div><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={emailConsent} onChange={(event) => { setEmailConsent(event.target.checked); if (!event.target.checked) setEmailRequests([]); }}/><span>Bu Gmail taramasını başlatmama ve bulunan ileti metnini taslakta göstermeme izin veriyorum.</span></label><div className="flex flex-wrap gap-2"><Button onClick={() => void scanRequestsFromGmail()} disabled={!emailConsent || emailBusy}>{emailBusy ? "Gmail taranıyor…" : "Google ile izin ver ve tara"}</Button>{emailRequests.length > 0 && <Button variant="ghost" onClick={() => setEmailRequests([])}>Sonuçları temizle</Button>}</div>{emailRequests.map((request) => <article key={request.id} className="space-y-2 rounded-xl border bg-background p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="font-medium">{request.subject}</h3><p className="text-xs text-muted-foreground">{request.sender}{request.receivedAt ? ` · ${new Date(request.receivedAt).toLocaleString("tr-TR")}` : ""}</p></div><Button size="sm" variant="secondary" onClick={() => { edit(undefined, { title: request.subject, notes: [`E-posta göndereni: ${request.sender}`, request.excerpt].filter(Boolean).join("\n"), status: "Teklif", date: todayISO() }); setEmailPanel(false); setEmailRequests([]); }}>Taslağa aktar</Button></div><p className="max-h-24 overflow-auto whitespace-normal text-xs text-muted-foreground">{request.excerpt || "İleti gövdesi boş."}</p></article>)}</section>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="İş günü"
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); setQuickRange(""); }}
          className="rounded-md border bg-secondary p-2 text-sm"
        />
        <Button variant="ghost" size="sm" onClick={() => { setDate(""); setQuickRange(""); }}>Tüm tarihler</Button>
        <Button variant={quickRange === "today" || (!quickRange && date === todayISO()) ? "secondary" : "outline"} size="sm" onClick={() => { setDate(""); setQuickRange("today"); }}><CalendarCheck className="size-4"/>Bugün</Button>
        <Button variant={quickRange === "week" ? "secondary" : "outline"} size="sm" onClick={() => { setDate(""); setQuickRange("week"); }}>Bu hafta</Button>
        <Button variant={quickRange === "month" ? "secondary" : "outline"} size="sm" onClick={() => { setDate(""); setQuickRange("month"); }}>Bu ay</Button>
        <Button variant={date === dateOffset(1) && !quickRange ? "secondary" : "outline"} size="sm" onClick={() => { setQuickRange(""); setDate(dateOffset(1)); }}>Yarın</Button>
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
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
        <select aria-label="Müşteriye göre filtrele" className="h-10 rounded-xl border bg-secondary px-3 text-sm" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}><option value="">Tüm müşteriler</option>{(customers.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>
        <Input aria-label="En düşük iş tutarı" type="number" min="0" step="100" value={minimumAmount} onChange={(event) => setMinimumAmount(event.target.value)} placeholder="En az tutar ₺" />
        <Button type="button" variant="outline" size="sm" onClick={() => { setFilter("Tümü"); setViewMode(viewMode === "list" ? "kanban" : "list"); }}><span className="flex items-center gap-2">{viewMode === "list" ? <LayoutGrid className="size-4"/> : <LayoutList className="size-4"/>}{viewMode === "list" ? "Kanban" : "Liste"}</span></Button>
      </div>
      {(activeFilterCount > 0 || customerFilter || minimumAmount) && <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{activeFilterCount} filtre aktif</span><Button type="button" variant="link" size="sm" className="h-7 px-1" onClick={() => { setSearchQuery(""); setDebouncedQuery(""); setFilter("Tümü"); setCustomerFilter(""); setMinimumAmount(""); setQuickRange(""); setDate(""); }}>Filtreleri temizle</Button></div>}
      {viewMode === "list" && <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="İş durumu filtresi">
        {["Tümü", ...STATUSES].map((status) => <Button key={status} type="button" size="sm" variant={filter === status ? "default" : "outline"} className="shrink-0" aria-pressed={filter === status} onClick={() => setFilter(status)}>{status}<span className="ml-1 rounded-full bg-background/20 px-1.5 text-[10px]">{statusCounts[status] ?? 0}</span></Button>)}
      </div>}
      {date && capacity.length > 0 && <section className="space-y-2 rounded-2xl border bg-card p-3" aria-label="Ekip kapasitesi"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Ekip kapasitesi · {date}</h2><span className="text-xs text-muted-foreground">Açık iş sayısı</span></div><div className="flex flex-wrap gap-2">{capacity.map(({ member, count }) => <span key={member.id} className={`rounded-full border px-3 py-1 text-xs ${count >= 4 ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200" : "bg-secondary"}`}>{member.username} · {count} iş{count >= 4 ? " · yoğun" : ""}</span>)}</div></section>}
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
      ) : displayRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center"><Search className="mx-auto size-6 text-muted-foreground"/><p className="mt-2 text-sm font-medium">{normalizedQuery ? "Aramayla eşleşen iş bulunamadı." : filter !== "Tümü" ? `${filter} durumunda iş yok.` : "Bu tarihte iş yok."}</p>{(normalizedQuery || filter !== "Tümü") && <Button className="mt-3" size="sm" variant="secondary" onClick={() => { setSearchQuery(""); setFilter("Tümü"); }}>Filtreleri temizle</Button>}</div>
      ) : viewMode === "kanban" ? (
        <div className="space-y-3">
          <div className="overflow-x-auto pb-2"><div className="grid min-w-[810px] grid-cols-3 gap-3">
            {["Bekliyor", "Devam Ediyor", "Tamamlandı"].map((column) => {
              const columnRows = queryRows.filter((job) => String(job.payload.status ?? "Bekliyor") === column);
              return <section key={column} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!me.data?.isUsta) return; const id = event.dataTransfer.getData("text/plain"); const job = queryRows.find((row) => row.id === id); if (!job || job.payload.status === column || job.payload.billed) return; if (column === "Tamamlandı") { void complete(job, elapsedSeconds(job.payload, now)); return; } const prerequisite = queryRows.find((row) => row.id === String(job.payload.depends_on_job_id ?? "")); if (column === "Devam Ediyor" && prerequisite && prerequisite.payload.status !== "Tamamlandı") { toast.error(`Önce “${String(prerequisite.payload.title)}” işini tamamlayın.`); return; } void change(job, { ...job.payload, status: column }); }} className="min-h-64 rounded-2xl border bg-secondary/40 p-3">
                <header className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{column}</h2><span className="rounded-full bg-background px-2 py-0.5 text-xs">{columnRows.length}</span></header>
                <div className="max-h-[65vh] space-y-2 overflow-y-auto">{columnRows.map((job) => { const customer = customers.data?.find((row) => row.id === job.payload.customer_id); const addr = String(job.payload.address ?? customer?.address ?? ""); const seconds = elapsedSeconds(job.payload, now); const amount = Number(job.payload.price ?? 0) || hourlyCharge(seconds, Number(job.payload.hourly_rate ?? 0)); return <article key={job.id} draggable={Boolean(me.data?.isUsta && !job.payload.billed)} onDragStart={(event) => event.dataTransfer.setData("text/plain", job.id)} className={`space-y-2 rounded-xl border bg-card p-3 shadow-sm ${job.payload.started_at ? "border-l-4 border-l-primary" : ""} ${column === "Tamamlandı" ? "opacity-75" : ""}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{customer?.name || String(job.payload.title ?? "İş")}</h3><p className="line-clamp-2 text-xs text-muted-foreground">{String(job.payload.title ?? "")}</p></div><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${column === "Tamamlandı" ? "bg-emerald-500/10 text-emerald-700" : column === "Devam Ediyor" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700"}`}>{column}</span></div>{addr && <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground"><MapPin className="size-3 shrink-0"/>{addr}</p>}<div className="flex items-center justify-between text-xs"><span className="num text-muted-foreground">{Math.floor(seconds / 3600)}:{String(Math.floor(seconds / 60) % 60).padStart(2, "0")}</span><span className="num font-semibold">{formatTL(amount)}</span></div><div className="flex gap-1"><Button size="sm" variant="ghost" className="h-8 flex-1" onClick={() => { setViewMode("list"); setExpanded(job.id); }}>Aç</Button>{me.data?.isUsta && <select aria-label={`${String(job.payload.title)} durumunu seç`} className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-1 text-xs" value={column} disabled={Boolean(job.payload.billed)} onChange={(event) => { if (event.target.value === "Tamamlandı") void complete(job, seconds); else void change(job, { ...job.payload, status: event.target.value }); }}><option>Bekliyor</option><option>Devam Ediyor</option><option>Tamamlandı</option></select>}</div></article>; })}</div>
              </section>;
            })}
          </div></div>
          {queryRows.some((job) => !["Bekliyor", "Devam Ediyor", "Tamamlandı"].includes(String(job.payload.status))) && <section className="rounded-2xl border bg-card p-3"><h2 className="mb-2 text-sm font-semibold">Teklifler ve ertelenen işler</h2><div className="flex flex-wrap gap-2">{queryRows.filter((job) => !["Bekliyor", "Devam Ediyor", "Tamamlandı"].includes(String(job.payload.status))).map((job) => <Button key={job.id} variant="outline" size="sm" onClick={() => { setViewMode("list"); setExpanded(job.id); }}>{String(job.payload.title ?? "İş")} · {String(job.payload.status)}</Button>)}</div></section>}
          <p className="text-center text-[11px] text-muted-foreground">Kartı başka kolona sürükleyin; klavye ve mobil kullanımında kart içindeki durum menüsünü kullanın.</p>
        </div>
      ) : (
        rows.map((j, index) => {
          const p = j.payload;
          const seconds = elapsedSeconds(p, now);
          const score = jobPriorityScore(p);
          const customer = customers.data?.find((c) => c.id === p.customer_id);
          const address = String(p.address || customer?.address || "");
          const prerequisite = (jobs.data ?? []).find((candidate) => candidate.id === String(p.depends_on_job_id ?? ""));
          const plannedSeconds = Math.max(0, Number(p.planned_hours ?? 0)) * 3600;
          const promiseDate = String(p.promised_date ?? "");
          const promiseDaysLeft = promiseDate ? Math.ceil((Date.parse(`${promiseDate}T12:00:00`) - Date.parse(`${todayISO()}T12:00:00`)) / 86400000) : null;
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
              <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2.5 py-1 font-semibold ${score >= 50 ? "bg-destructive/10 text-destructive" : score >= 25 ? "bg-amber-500/10 text-amber-800 dark:text-amber-200" : "bg-secondary text-muted-foreground"}`}>Öncelik {score}</span>{Number(p.planned_hours) > 0 && <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">Tahmin {Number(p.planned_hours)} sa · gerçekleşen {(seconds / 3600).toFixed(1)} sa{seconds > plannedSeconds ? ` · +${((seconds - plannedSeconds) / 3600).toFixed(1)} sa sapma` : ""}</span>}</div>
              {promiseDaysLeft !== null && p.status !== "Tamamlandı" && promiseDaysLeft <= 2 && <p role="status" className={`rounded-lg border p-2 text-xs ${promiseDaysLeft < 0 ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>{promiseDaysLeft < 0 ? `Teslim taahhüdü ${Math.abs(promiseDaysLeft)} gün gecikti.` : promiseDaysLeft === 0 ? "Müşteriye verilen teslim tarihi bugün." : "Müşteriye verilen teslim tarihine 1 gün kaldı."}{p.delay_reason ? ` Neden: ${String(p.delay_reason)}` : ""}</p>}
              {prerequisite && prerequisite.payload.status !== "Tamamlandı" && <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">Bağımlı iş bekliyor: önce “{String(prerequisite.payload.title)}” tamamlanmalı.</p>}
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
                      disabled={save.isPending || Boolean(p.billed) || p.status === "Tamamlandı" || p.status === "Teklif"}
                      onClick={() => {
                        if (!p.started_at && prerequisite && prerequisite.payload.status !== "Tamamlandı") { toast.error(`Önce “${String(prerequisite.payload.title)}” işini tamamlayın.`); return; }
                        void change(j, {
                          ...p,
                          seconds,
                          started_at: p.started_at ? null : new Date().toISOString(),
                          status: p.started_at ? "Bekliyor" : "Devam Ediyor",
                        })
                      }}
                    >
                      {p.started_at ? <Pause /> : <Play />}
                      {p.started_at ? "Duraklat" : "Başlat"}
                    </Button>
                    {p.status !== "Tamamlandı" && p.status !== "Teklif" && (
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
                      disabled={billing || Boolean(p.billed) || p.status === "Teklif" || !navigator.onLine}
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
                  {checklistFor(p).length > 0 && <section className="space-y-2 rounded-xl border bg-background p-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck className="size-4 text-primary"/>İş kontrol listesi</h3>{checklistFor(p).map((item, itemIndex) => <label key={`${j.id}-${itemIndex}`} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={item.done} disabled={!me.data?.isUsta || Boolean(p.billed)} onChange={(event) => { const updated = checklistFor(p).map((task, index) => index === itemIndex ? { ...task, done: event.target.checked } : task); void change(j, { ...p, checklist_json: JSON.stringify(updated) }); }}/><span className={item.done ? "text-muted-foreground line-through" : ""}>{item.label}</span></label>)}{p.checklist_required === true && checklistFor(p).some((item) => !item.done) && <p className="text-xs text-amber-700 dark:text-amber-300">Bütün adımlar işaretlenmeden iş kapatılamaz.</p>}</section>}
                  {me.data?.isUsta && (
                    <>
                      <select
                        aria-label="İş durumunu değiştir"
                        className="w-full rounded-md border bg-secondary p-2"
                        disabled={Boolean(p.billed)}
                        value={String(p.status)}
                        onChange={(e) => {
                          const nextStatus = e.target.value;
                          if (nextStatus === "Tamamlandı") { void complete(j, seconds); return; }
                          if (nextStatus === "Devam Ediyor" && prerequisite && prerequisite.payload.status !== "Tamamlandı") { toast.error(`Önce “${String(prerequisite.payload.title)}” işini tamamlayın.`); return; }
                          if (nextStatus === "Ertelendi") {
                            const reason = window.prompt("Erteleme nedenini yazın:", String(p.delay_reason ?? ""));
                            if (!reason?.trim()) { toast.error("Erteleme nedeni zorunludur."); return; }
                            void change(j, { ...p, status: nextStatus, delay_reason: reason.trim().slice(0, 500) });
                            return;
                          }
                          void change(j, { ...p, status: nextStatus });
                        }}
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
                  {me.data?.isUsta && p.status === "Teklif" && <Button size="sm" onClick={() => void change(j, { ...p, status: "Bekliyor", quote_approved_at: new Date().toISOString() })}><Check className="size-4"/>Teklifi onayla · işe dönüştür</Button>}
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
          const previousChecklist = editing ? checklistFor(editing.payload) : [];
          const checklist = String(form.checklist_draft ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 50).map((label) => ({ label: label.slice(0, 160), done: previousChecklist.find((item) => item.label === label)?.done ?? false }));
          const { owner_id, checklist_draft: _checklistDraft, ...payload } = form;
          save.mutate(
            { id: editing?.id, owner_id: String(owner_id ?? me.data?.id), payload: { ...payload, estimated_profit_margin, checklist_json: JSON.stringify(checklist), checklist_required: checklist.length > 0 } },
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
          <div className="space-y-2 rounded-xl border bg-background p-3"><Label htmlFor="job-checklist-draft">İş kontrol listesi (adım başına bir satır)</Label><Textarea id="job-checklist-draft" rows={3} maxLength={2000} value={String(form.checklist_draft ?? "")} onChange={(event) => setForm({ ...form, checklist_draft: event.target.value })} placeholder={"Alanı güvenli hale getir\nMontajı kontrol et\nMüşteriyle teslimi doğrula"}/><p className="text-xs text-muted-foreground">Liste eklenirse iş, bütün adımlar işaretlenmeden kapatılamaz.</p></div>
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
