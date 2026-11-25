import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Play, Pause, Check, Copy, ChevronDown, Clock, Download, Search, X, CalendarCheck, Activity, Phone, MessageCircle, Share2, FileText, ClipboardCheck, Mail, LayoutGrid, LayoutList, MapPin, Star, Archive, ArchiveRestore, Bookmark, Tags } from "lucide-react";
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
import { openWhatsApp } from "@/lib/templates";
import { SwipeRow } from "@/components/app/SwipeRow";
import { Skeleton } from "@/components/ui/skeleton";
import { scanJobRequestEmails, type GmailJobRequest } from "@/lib/gmail-bank";
import { buildSafeCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/isler")({
  head: () => pageHead("İşler", "İş planı, çalışma süreleri ve saha kayıtları."),
  component: Jobs,
});

const STATUSES = ["Teklif", "Bekliyor", "Devam Ediyor", "Tamamlandı", "Ertelendi", "İptal"];
type ChecklistItem = { label: string; done: boolean };
type SavedJobView = { id: string; name: string; search: string; status: string; customer: string; minimum: string; date: string; range: "" | "today" | "week" | "month" };
function checklistFor(payload: Payload): ChecklistItem[] {
  try {
    const parsed: unknown = JSON.parse(String(payload.checklist_json ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ChecklistItem => typeof item === "object" && item !== null && typeof item.label === "string" && typeof item.done === "boolean");
  } catch { return []; }
}
function jobStatusClass(status: unknown) {
  switch (String(status ?? "")) {
    case "Tamamlandı": return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "Devam Ediyor": return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "Teklif": return "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300";
    case "Ertelendi": return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200";
    case "İptal": return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    default: return "border-border bg-secondary text-muted-foreground";
  }
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
  const settings = useRecords("settings");
  const saveSettings = useSaveRecord("settings");
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
  const [savedViews, setSavedViews] = useState<SavedJobView[]>([]);
  const [savedViewName, setSavedViewName] = useState("");
  const [selectedViewId, setSelectedViewId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [recentJobIds, setRecentJobIds] = useState<string[]>([]);

  const workspaceSettings = settings.data?.find((row) => row.owner_id === me.data?.id && row.payload.key === "job-workspace-v1");
  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(String(workspaceSettings?.payload.saved_views_json ?? "[]"));
      setSavedViews(Array.isArray(parsed) ? parsed.filter((item): item is SavedJobView => typeof item === "object" && item !== null && typeof (item as SavedJobView).id === "string" && typeof (item as SavedJobView).name === "string") : []);
    } catch { setSavedViews([]); }
  }, [workspaceSettings?.id, workspaceSettings?.payload.saved_views_json]);

  useEffect(() => {
    if (!me.data?.id) return;
    try {
      const key = `saha-recent-jobs:${me.data.id}`;
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
      setRecentJobIds(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 8) : []);
    } catch { setRecentJobIds([]); }
  }, [me.data?.id]);

  function markJobViewed(id: string) {
    if (!me.data?.id) return;
    const next = [id, ...recentJobIds.filter((value) => value !== id)].slice(0, 8);
    setRecentJobIds(next);
    try { localStorage.setItem(`saha-recent-jobs:${me.data.id}`, JSON.stringify(next)); } catch { /* optional device preference */ }
  }

  async function persistSavedViews(next: SavedJobView[]) {
    if (!me.data?.id) return;
    await saveSettings.mutateAsync({ id: workspaceSettings?.id, owner_id: me.data.id, payload: { ...(workspaceSettings?.payload ?? {}), key: "job-workspace-v1", saved_views_json: JSON.stringify(next) } });
    setSavedViews(next);
  }

  function saveCurrentView() {
    const name = savedViewName.trim() || window.prompt("Bu filtre görünümüne bir ad verin:")?.trim();
    if (!name) return;
    if (savedViews.some((view) => view.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"))) return void toast.error("Bu isimde kayıtlı bir görünüm zaten var.");
    const next: SavedJobView = { id: crypto.randomUUID(), name: name.slice(0, 60), search: searchQuery, status: filter, customer: customerFilter, minimum: minimumAmount, date, range: quickRange };
    void persistSavedViews([...savedViews, next]).then(() => { setSavedViewName(""); toast.success("Filtre görünümü kaydedildi."); }).catch((error) => toast.error(error instanceof Error ? error.message : "Görünüm kaydedilemedi."));
  }

  function downloadFilteredJobsCsv() {
    const customerById = new Map((customers.data ?? []).map((customer) => [customer.id, customer]));
    const content = buildSafeCsv([
      ["İş", "Müşteri", "Telefon", "Tarih", "Saat", "Durum", "Öncelik", "Tutar (₺)", "Adres", "Not", "Etiket"],
      ...rows.map((job) => {
        const customer = customerById.get(String(job.payload.customer_id ?? ""));
        const amount = Number(job.payload.price ?? 0) || hourlyCharge(elapsedSeconds(job.payload, now), Number(job.payload.hourly_rate ?? 0));
        return [String(job.payload.title ?? ""), customer?.name ?? "", customer?.phone ?? "", String(job.payload.date ?? ""), String(job.payload.time ?? ""), String(job.payload.status ?? ""), String(job.payload.urgency ?? "normal"), amount.toFixed(2), String(job.payload.address ?? ""), String(job.payload.notes ?? ""), String(job.payload.label_tags ?? "")];
      }),
    ]);
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `saha-isler-${todayISO()}.csv`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`${rows.length} filtrelenmiş iş CSV olarak indirildi.`);
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(searchQuery), 300); return () => window.clearTimeout(timer); }, [searchQuery]);

  const members = useMembers();

  const edit = useCallback((j?: WorkRecord, p?: Payload) => {
    setEditing(j);
    let lastCustomer = "";
    try { lastCustomer = localStorage.getItem(`saha-last-customer:${me.data?.id ?? ""}`) ?? ""; } catch { /* optional convenience preference */ }
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
            customer_id: lastCustomer || undefined,
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
      const url = new URL(window.location.href);
      if (url.searchParams.get("view") === "today") {
        url.searchParams.delete("view");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        setQuickRange("today");
      }
      if (url.searchParams.get("action") === "new") {
        url.searchParams.delete("action");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        edit();
        return;
      }
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

  async function change(j: WorkRecord, p: Payload, nextOwnerId = j.owner_id) {
    let edits: Array<{ at: string; actor: string; fields: string[] }> = [];
    try {
      const parsed: unknown = JSON.parse(String(j.payload.edit_history_json ?? "[]"));
      if (Array.isArray(parsed)) edits = parsed.filter((entry): entry is { at: string; actor: string; fields: string[] } => typeof entry === "object" && entry !== null && typeof (entry as { at?: unknown }).at === "string" && typeof (entry as { actor?: unknown }).actor === "string" && Array.isArray((entry as { fields?: unknown }).fields));
    } catch { /* rebuild malformed legacy audit metadata */ }
    const changedFields = [...new Set([...Object.keys(j.payload), ...Object.keys(p)])].filter((key) => key !== "edit_history_json" && JSON.stringify(j.payload[key]) !== JSON.stringify(p[key]));
    if (changedFields.length) p = { ...p, edit_history_json: JSON.stringify([...edits, { at: new Date().toISOString(), actor: me.data?.id ?? "current-user", fields: changedFields.slice(0, 30) }].slice(-30)) };
    const previousStatus = String(j.payload.status ?? "Bekliyor");
    const nextStatus = String(p.status ?? previousStatus);
    if (previousStatus !== nextStatus) {
      let history: Array<{ from: string; to: string; at: string }> = [];
      try {
        const parsed: unknown = JSON.parse(String(p.status_history_json ?? "[]"));
        if (Array.isArray(parsed)) history = parsed.filter((entry): entry is { from: string; to: string; at: string } => typeof entry === "object" && entry !== null && typeof (entry as { from?: unknown }).from === "string" && typeof (entry as { to?: unknown }).to === "string" && typeof (entry as { at?: unknown }).at === "string");
      } catch { /* recover a malformed old history as a fresh log */ }
      p = { ...p, status_history_json: JSON.stringify([...history, { from: previousStatus, to: nextStatus, at: new Date().toISOString() }].slice(-30)) };
    }
    await save.mutateAsync({ id: j.id, owner_id: nextOwnerId, payload: p });
  }

  async function toggleFollow(job: WorkRecord) {
    await change(job, { ...job.payload, followed: job.payload.followed !== true });
    toast.success(job.payload.followed === true ? "Takip işareti kaldırıldı." : "İş takip listesine eklendi.");
  }

  async function archiveJob(job: WorkRecord) {
    const reason = window.prompt("Arşiv nedeni (isteğe bağlı):", String(job.payload.archive_reason ?? ""));
    if (reason === null) return;
    await change(job, { ...job.payload, archived: true, archive_reason: reason.trim().slice(0, 300), archived_at: new Date().toISOString() });
    toast.success("İş arşivlendi.");
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
      doc.setFont("DejaVu", "bold"); doc.setFontSize(19); doc.setTextColor(255, 255, 255); doc.text(isQuote ? "YEVMİYE VE FİNANS · FİYAT TEKLİFİ" : "YEVMİYE VE FİNANS · İŞ RAPORU", margin, y);
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
      const filename = `${isQuote ? "yevmiye-finans-fiyat-teklifi" : "yevmiye-finans-is-raporu"}-${String(job.payload.date ?? todayISO())}.pdf`;
      const blob = doc.output("blob");
      if (share && typeof File !== "undefined") {
        const file = new File([blob], filename, { type: "application/pdf" });
        if (navigator.canShare?.({ files: [file] }) && navigator.share) {
          await navigator.share({ title: `İş raporu · ${String(job.payload.title ?? "İş kaydı")}`, files: [file] });
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
  const visibleDateRows = dateRows.filter((job) => (job.payload.archived === true) === showArchived);
  const statusCounts = Object.fromEntries(["Tümü", ...STATUSES].map((status) => [
    status,
    status === "Tümü" ? visibleDateRows.length : visibleDateRows.filter((job) => String(job.payload.status ?? "Bekliyor") === status).length,
  ])) as Record<string, number>;
  const normalizedQuery = debouncedQuery.trim().toLocaleLowerCase("tr-TR");
  const queryRows = visibleDateRows.filter((job) => {
    const customer = customers.data?.find((item) => item.id === job.payload.customer_id);
    const amount = Number(job.payload.price ?? 0) || hourlyCharge(elapsedSeconds(job.payload, now), Number(job.payload.hourly_rate ?? 0));
    if (customerFilter && job.payload.customer_id !== customerFilter) return false;
    if (minimumAmount && amount < Number(minimumAmount)) return false;
    if (!normalizedQuery) return true;
    const machine = equipment.data?.find((item) => item.id === job.payload.equipment_id);
    const assigned = members.find((item) => item.id === job.owner_id);
    const searchable = [job.payload.title, customer?.name, customer?.phone, job.payload.address, customer?.address, job.payload.notes, job.payload.label_tags, machine?.payload.name, assigned?.username]
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
      <section className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <Bookmark className="size-4 text-primary" aria-hidden="true" />
        <select aria-label="Kaydedilmiş iş görünümü" className="h-9 min-w-40 flex-1 rounded-lg border bg-background px-2 text-sm" value={selectedViewId} onChange={(event) => {
          setSelectedViewId(event.target.value);
          const selected = savedViews.find((view) => view.id === event.target.value);
          if (!selected) return;
          setSearchQuery(selected.search); setFilter(selected.status); setCustomerFilter(selected.customer); setMinimumAmount(selected.minimum); setDate(selected.date); setQuickRange(selected.range);
        }}><option value="">Kayıtlı filtre seç…</option>{savedViews.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</select>
        <Input aria-label="Filtre görünümü adı" className="h-9 w-40" maxLength={60} value={savedViewName} onChange={(event) => setSavedViewName(event.target.value)} placeholder="Görünüm adı" />
        <Button type="button" size="sm" variant="outline" onClick={saveCurrentView} disabled={saveSettings.isPending}>Görünümü kaydet</Button>
        {savedViews.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => { if (!selectedViewId) return void toast("Silmek için önce kayıtlı görünümü seçin."); void persistSavedViews(savedViews.filter((item) => item.id !== selectedViewId)).then(() => setSelectedViewId("")).catch(() => toast.error("Görünüm silinemedi.")); }}>Seçileni sil</Button>}
        <Button type="button" size="sm" variant={showArchived ? "secondary" : "outline"} onClick={() => setShowArchived((value) => !value)}><Archive className="size-4"/>{showArchived ? "Arşiv" : "Aktif işler"}</Button>
        <Button type="button" size="sm" variant="outline" onClick={downloadFilteredJobsCsv} disabled={rows.length === 0}><Download className="size-4"/>CSV ({rows.length})</Button>
      </section>
      {recentJobIds.length > 0 && <section className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Son açılanlar:</span>{recentJobIds.map((id) => { const job = (jobs.data ?? []).find((item) => item.id === id); return job ? <Button key={id} type="button" variant="ghost" size="sm" className="h-7 max-w-48 truncate" onClick={() => { setShowArchived(job.payload.archived === true); setDate(""); setQuickRange(""); setFilter("Tümü"); setSearchQuery(""); setCustomerFilter(""); setMinimumAmount(""); setExpanded(id); }}>{String(job.payload.title ?? "İş")}</Button> : null; })}</section>}
      {rows.some((job) => job.payload.followed === true) && <section className="flex flex-wrap items-center gap-2 text-xs"><Star className="size-4 fill-amber-400 text-amber-500"/><span className="text-muted-foreground">Takipte:</span>{rows.filter((job) => job.payload.followed === true).map((job) => <Button key={job.id} type="button" variant="ghost" size="sm" className="h-7" onClick={() => setExpanded(job.id)}>{String(job.payload.title ?? "İş")}</Button>)}</section>}
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
          const jobRevenue = Number(p.price ?? 0) || hourlyCharge(seconds, Number(p.hourly_rate ?? 0));
          const netJobRevenue = Number(p.vat_rate ?? 0) > 0 ? jobRevenue / (1 + Number(p.vat_rate) / 100) : jobRevenue;
          const directExpense = (expenses.data ?? []).filter((expense) => expense.job_record_id === j.id).reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
          const jobHours = seconds / 3600;
          const assignedPayroll = (payrollRows.data ?? []).filter((entry) => entry.owner_id === j.owner_id);
          const assignedHours = assignedPayroll.reduce((sum, entry) => sum + Number(entry.payload.days ?? 0) * Number(entry.payload.standard_hours ?? 8) + Number(entry.payload.overtime_hours ?? 0), 0);
          const hourlyLaborCost = assignedHours > 0 ? assignedPayroll.reduce((sum, entry) => sum + payrollEntryAmount(entry.payload), 0) / assignedHours : 0;
          const laborCost = Number(p.estimated_labor_cost ?? 0) || hourlyLaborCost * jobHours;
          const overheadShare = (expenses.data ?? []).filter((expense) => !expense.job_record_id).reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0) / Math.max(1, (jobs.data ?? []).length);
          const materialCost = Number(p.material_cost ?? 0);
          const totalJobCost = materialCost + directExpense + laborCost + overheadShare;
          const jobProfit = netJobRevenue - totalJobCost;
          const jobMargin = netJobRevenue > 0 ? jobProfit / netJobRevenue * 100 : null;
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
                  onClick={() => { markJobViewed(j.id); setExpanded(expanded === j.id ? undefined : j.id); }}
                >
                  <ChevronDown />
                </Button>
              </div>
              {Boolean(p.equipment_id) && <MachineInfo equipment={equipment.data ?? []} id={String(p.equipment_id)} />}
              <div className="flex items-center justify-between">
                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${jobStatusClass(p.status)}`}>
                  {p.status}
                </span>
                <span className="num">
                  {Math.floor(seconds / 3600)}:
                  {String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:
                  {String(Math.floor(seconds) % 60).padStart(2, "0")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2.5 py-1 font-semibold ${score >= 50 ? "bg-destructive/10 text-destructive" : score >= 25 ? "bg-amber-500/10 text-amber-800 dark:text-amber-200" : "bg-secondary text-muted-foreground"}`}>Öncelik {score}</span>{Number(p.planned_hours) > 0 && <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">Tahmin {Number(p.planned_hours)} sa · gerçekleşen {(seconds / 3600).toFixed(1)} sa{seconds > plannedSeconds ? ` · +${((seconds - plannedSeconds) / 3600).toFixed(1)} sa sapma` : ""}</span>}</div>
              {String(p.label_tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => <span key={tag} style={{ borderColor: String(p.label_color ?? "").match(/^#[\da-fA-F]{6}$/) ? String(p.label_color) : undefined, color: String(p.label_color ?? "").match(/^#[\da-fA-F]{6}$/) ? String(p.label_color) : undefined }} className="mr-1 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] text-primary"><Tags className="size-3"/>{tag}</span>)}
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
                  {customer?.phone && <div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><a href={`tel:${customer.phone}`} aria-label={`${customer.name} müşterisini ara`}><Phone className="size-4"/>Ara</a></Button><Button variant="outline" size="sm" onClick={() => openWhatsApp(customer.phone!, `Merhaba ${customer.name}, ${String(p.title ?? "işiniz")} için iletişime geçiyorum.`)}><MessageCircle className="size-4"/>WhatsApp</Button></div>}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void toggleFollow(j)}><Star className={`size-4 ${p.followed === true ? "fill-amber-400 text-amber-500" : ""}`}/>{p.followed === true ? "Takipte" : "Takibe al"}</Button>
                    {p.archived === true ? <Button size="sm" variant="outline" onClick={() => void change(j, { ...p, archived: false, archived_at: null })}><ArchiveRestore className="size-4"/>Arşivden çıkar</Button> : <Button size="sm" variant="outline" onClick={() => void archiveJob(j)}><Archive className="size-4"/>Arşivle</Button>}
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
                  {p.archive_reason && <p className="rounded-lg bg-secondary p-2 text-xs">Arşiv nedeni: {String(p.archive_reason)}</p>}
                  {p.cancel_reason && <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-xs">İptal nedeni: {String(p.cancel_reason)}</p>}
                  {(() => { try { const history: unknown = JSON.parse(String(p.status_history_json ?? "[]")); return Array.isArray(history) && history.length > 0 ? <section className="rounded-xl border bg-background p-3"><h3 className="mb-2 text-sm font-semibold">Durum geçmişi</h3><ol className="space-y-1 text-xs text-muted-foreground">{history.slice(-8).reverse().map((entry, index) => { const item = entry as { from?: string; to?: string; at?: string }; return <li key={`${item.at ?? "history"}-${index}`}>{item.from} → {item.to} · {item.at ? new Date(item.at).toLocaleString("tr-TR") : ""}</li>; })}</ol></section> : null; } catch { return null; } })()}
                  {(() => { try { const history: unknown = JSON.parse(String(p.edit_history_json ?? "[]")); return Array.isArray(history) && history.length > 0 ? <details className="rounded-xl border bg-background p-3"><summary className="cursor-pointer text-sm font-semibold">Düzenleme geçmişi ({history.length})</summary><ol className="mt-2 space-y-2 text-xs text-muted-foreground">{history.slice(-8).reverse().map((entry, index) => { const item = entry as { at?: string; actor?: string; fields?: string[] }; return <li key={`${item.at ?? "edit"}-${index}`}>{item.at ? new Date(item.at).toLocaleString("tr-TR") : "Tarih yok"} · {item.fields?.join(", ")}{item.actor ? ` · kullanıcı ${item.actor.slice(0, 8)}` : ""}</li>; })}</ol></details> : null; } catch { return null; } })()}
                  <section className="space-y-3 rounded-xl border bg-background p-3"><div><h3 className="text-sm font-semibold">İş kârlılık analizi</h3><p className="text-[11px] text-muted-foreground">KDV hariç gelir − kayıtlı malzeme − bu işe bağlı gider − atanmış çalışanın ortalama kayıtlı saat maliyeti − ortalama gider payı.</p></div><div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">{[["Gelir",netJobRevenue], ["Malzeme",materialCost], ["İşe bağlı gider",directExpense], ["İşçilik",laborCost], ["Gider payı",overheadShare], ["Net katkı",jobProfit]].map(([label,value])=><div key={String(label)} className="rounded-lg bg-secondary/50 p-2"><p className="text-muted-foreground">{label}</p><p className={`num mt-1 font-semibold ${String(label)==="Net katkı" ? Number(value)<0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-300" : ""}`}>{formatTL(Number(value))}</p></div>)}</div><div className="flex items-center justify-between gap-2">{jobMargin == null ? <p className="text-xs text-muted-foreground">Kârlılık için iş fiyatı girilmelidir.</p> : <p className={`text-sm font-bold ${jobMargin<20?"text-destructive":"text-emerald-700 dark:text-emerald-300"}`}>Kâr marjı %{jobMargin.toFixed(1)}{jobMargin<20?" · Bu iş zarar riski taşıyor":""}</p>}</div><div className="h-40"><ResponsiveContainer width="100%" height="100%"><BarChart data={[{name:"Tutar", Gelir:netJobRevenue, Maliyet:totalJobCost, Net:Math.max(0,jobProfit)}]}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis width={45} tickFormatter={(value:number)=>value>=1000?`${Math.round(value/1000)}b`:String(value)}/><Tooltip formatter={(value:number)=>formatTL(value)}/><Bar dataKey="Gelir" fill="#10b981" radius={[5,5,0,0]}/><Bar dataKey="Maliyet" fill="#f43f5e" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>{!hourlyLaborCost && !Number(p.estimated_labor_cost ?? 0) && <p className="text-[10px] text-amber-700 dark:text-amber-300">Bu çalışan için yevmiye maliyeti kaydı bulunamadı; işçilik maliyeti sıfır tahmin edildi. Eksik veride kâr olduğundan yüksek görünebilir.</p>}</section>
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
          if (nextStatus === "İptal") {
            const choices = ["Müşteri vazgeçti", "Uygun tarih bulunamadı", "Malzeme / ekipman yok", "Fiyat konusunda anlaşma sağlanamadı", "Diğer"];
            const reason = window.prompt(`İptal nedeni seçin veya yazın:\n${choices.map((item, index) => `${index + 1}. ${item}`).join("\n")}`, String(p.cancel_reason ?? ""));
            if (!reason?.trim()) { toast.error("İptal nedeni kaydedilmedi; durum değiştirilmedi."); return; }
            const selected = /^\d+$/.test(reason.trim()) ? choices[Number(reason.trim()) - 1] : reason.trim();
            if (!selected) { toast.error("Listeden geçerli bir neden seçin veya açıklama yazın."); return; }
            void change(j, { ...p, status: nextStatus, cancel_reason: selected.slice(0, 300) });
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
          if (!editing) {
            const normalizedTitle = String(form.title).trim().toLocaleLowerCase("tr-TR");
            const possibleDuplicate = (jobs.data ?? []).find((job) => String(job.payload.title ?? "").trim().toLocaleLowerCase("tr-TR") === normalizedTitle && String(job.payload.customer_id ?? "") === String(form.customer_id ?? "") && String(job.payload.date ?? "") === String(form.date ?? "") && job.payload.archived !== true);
            if (possibleDuplicate && !window.confirm(`Aynı müşteri ve tarihte “${String(possibleDuplicate.payload.title)}” adlı bir iş zaten var. Yine de yeni kayıt oluşturulsun mu?`)) return;
          }
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
          const finalPayload = { ...payload, estimated_profit_margin, checklist_json: JSON.stringify(checklist), checklist_required: checklist.length > 0 };
          if (editing) {
            void change(editing, finalPayload, String(owner_id ?? editing.owner_id)).then(() => setOpen(false)).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "İş kaydedilemedi."));
          } else {
            save.mutate({ owner_id: String(owner_id ?? me.data?.id), payload: finalPayload }, { onSuccess: () => setOpen(false) });
          }
        }}
      >
        <JobFormBody form={form} onChange={(next) => { setForm(next); if (me.data?.id && typeof next.customer_id === "string" && next.customer_id) { try { localStorage.setItem(`saha-last-customer:${me.data.id}`, next.customer_id); } catch { /* optional convenience preference */ } } }} customers={customers.data ?? []} members={members} equipment={equipment.data ?? []} jobs={jobs.data ?? []} selfId={editing?.id}>
          <div className="space-y-2 rounded-xl border bg-background p-3"><Label htmlFor="job-label-tags">İş etiketleri</Label><div className="flex gap-2"><Input id="job-label-tags" maxLength={240} value={String(form.label_tags ?? "")} onChange={(event) => setForm({ ...form, label_tags: event.target.value })} placeholder="Örn. acil, bakım, garanti (virgülle ayırın)"/><input aria-label="İş etiket rengi" type="color" className="h-10 w-12 cursor-pointer rounded-md border bg-background p-1" value={/^#[\da-fA-F]{6}$/.test(String(form.label_color ?? "")) ? String(form.label_color) : "#16a085"} onChange={(event) => setForm({ ...form, label_color: event.target.value })}/></div><p className="text-xs text-muted-foreground">Etiketler aramada da eşleşir; rengi iş kartlarında görünür.</p></div>
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
