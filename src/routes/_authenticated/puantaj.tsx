import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, Clock3, Download, MapPin, Play, Square, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/use-me";
import { useMembers } from "@/lib/job-fields";
import { pageHead, useRecords, type WorkRecord } from "@/lib/work";
import { formatDate, todayISO } from "@/lib/finance";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/puantaj")({
  head: () => pageHead("Puantaj", "Vardiya giriş/çıkışları, çalışma süresi ve konum kaydı."),
  component: Attendance,
});

const monthNow = () => todayISO().slice(0, 7);
const shiftDuration = (row: WorkRecord, now = Date.now()) => {
  const start = Date.parse(String(row.payload.clock_in_at ?? ""));
  const end = row.payload.clock_out_at ? Date.parse(String(row.payload.clock_out_at)) : now;
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
};
const elapsedLabel = (ms: number) => {
  const minutes = Math.floor(ms / 60_000);
  return `${Math.floor(minutes / 60)} sa ${String(minutes % 60).padStart(2, "0")} dk`;
};

function Attendance() {
  const me = useMe();
  const members = useMembers();
  const attendance = useRecords("attendance");
  const [month, setMonth] = useState(monthNow());
  const [selectedOwner, setSelectedOwner] = useState("");
  const [includeLocation, setIncludeLocation] = useState(true);
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const ownRows = attendance.data ?? [];
  const activeShift = ownRows.find((row) => row.owner_id === me.data?.id && !row.payload.clock_out_at);
  const ownerId = selectedOwner || me.data?.id || "";
  const rows = ownRows.filter((row) => row.owner_id === ownerId && String(row.payload.date ?? "").startsWith(month));
  const totalWorked = useMemo(() => rows.reduce((total, row) => total + shiftDuration(row, now), 0), [rows, now]);
  const monthTitle = new Date(`${month}-01T12:00:00`).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

  async function getCoordinates(): Promise<{ lat: number; lng: number } | undefined> {
    if (!includeLocation || !navigator.geolocation) return undefined;
    return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: Number(position.coords.latitude.toFixed(6)), lng: Number(position.coords.longitude.toFixed(6)) }),
      () => { toast.info("Konum alınamadı; puantaj konum olmadan kaydedilecek."); resolve(undefined); },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30_000 },
    ));
  }

  async function toggleShift() {
    if (!me.data?.id || busy) return;
    if (!navigator.onLine) return void toast.error("Puantaj kaydı için internet bağlantısı gerekir.");
    setBusy(true);
    try {
      const coordinates = await getCoordinates();
      const { data, error } = await supabase.rpc("toggle_attendance", { _lat: coordinates?.lat ?? null, _lng: coordinates?.lng ?? null });
      if (error) throw error;
      await attendance.refetch();
      const operation = typeof data === "object" && data !== null && "operation" in data ? String(data.operation) : "";
      toast.success(operation === "clock_out" ? "Vardiya bitişi kaydedildi." : "Vardiya başlangıcı kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Puantaj kaydı yapılamadı.");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = [["Tarih", "Çalışan", "Giriş", "Çıkış", "Süre", "Giriş enlem", "Giriş boylam", "Çıkış enlem", "Çıkış boylam"], ...rows.map((row) => [
      String(row.payload.date ?? ""), members.find((member) => member.id === row.owner_id)?.username ?? "Çalışan",
      row.payload.clock_in_at ? new Date(String(row.payload.clock_in_at)).toLocaleTimeString("tr-TR") : "",
      row.payload.clock_out_at ? new Date(String(row.payload.clock_out_at)).toLocaleTimeString("tr-TR") : "Devam ediyor",
      elapsedLabel(shiftDuration(row, now)), row.payload.clock_in_lat ?? "", row.payload.clock_in_lng ?? "", row.payload.clock_out_lat ?? "", row.payload.clock_out_lng ?? "",
    ])].map((line) => line.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", lines], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `saha-puantaj-${month}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  const selectedName = members.find((member) => member.id === ownerId)?.username ?? me.data?.profile?.display_name ?? "Çalışan";
  return <div className="mx-auto max-w-4xl space-y-5 pb-8">
    <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white sm:p-7">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-sky-300"><Clock3 className="size-4"/>SAHA · VARDİYA TAKİBİ</p>
      <h1 className="mt-2 text-2xl font-bold">Puantaj ve çalışma saatleri</h1>
      <p className="mt-1 text-sm text-slate-300">Giriş/çıkış saatlerini ve vardiya süresini kayıt altına alın.</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button size="lg" className={activeShift ? "bg-rose-600 text-white hover:bg-rose-500" : "bg-sky-300 text-slate-950 hover:bg-sky-200"} disabled={busy || !navigator.onLine} onClick={() => void toggleShift()}>
          {activeShift ? <><Square className="size-4"/>Vardiyayı bitir</> : <><Play className="size-4"/>Vardiyaya başla</>}
        </Button>
        <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 text-sm"><input type="checkbox" checked={includeLocation} onChange={(event) => setIncludeLocation(event.target.checked)}/><MapPin className="size-4 text-sky-300"/>Konumu ekle</label>
        {activeShift && <span className="rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-200">Vardiya devam ediyor · {elapsedLabel(shiftDuration(activeShift, now))}</span>}
      </div>
      {!navigator.onLine && <p className="mt-3 text-xs text-amber-200">Çevrimdışıyken giriş/çıkış sunucuda güvenli kaydedilemez.</p>}
    </header>

    <section className="space-y-4 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2"><Label htmlFor="attendance-month">Dönem</Label><Input id="attendance-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)}/></div>
        {me.data?.isUsta && <div className="space-y-2"><Label htmlFor="attendance-worker"><Users className="mr-1 inline size-4"/>Çalışan</Label><select id="attendance-worker" className="h-11 min-w-48 rounded-xl border bg-background px-3 text-sm" value={ownerId} onChange={(event) => setSelectedOwner(event.target.value)}>{members.map((member) => <option key={member.id} value={member.id}>{member.username}</option>)}</select></div>}
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="size-4"/>CSV indir</Button>
      </div>
      <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border bg-background p-3"><p className="text-xs text-muted-foreground">{monthTitle} vardiyaları</p><p className="mt-1 text-xl font-bold">{rows.length}</p></div><div className="rounded-2xl border bg-background p-3"><p className="text-xs text-muted-foreground">Toplam süre · {selectedName}</p><p className="mt-1 text-xl font-bold">{elapsedLabel(totalWorked)}</p></div></div>
      {attendance.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Puantaj kayıtları yükleniyor…</p> : rows.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center"><CalendarDays className="mx-auto size-7 text-muted-foreground"/><p className="mt-2 text-sm font-medium">Bu ay için puantaj kaydı yok.</p><p className="mt-1 text-xs text-muted-foreground">Vardiya başlangıcında “Vardiyaya başla” düğmesine dokunun.</p></div> : <div className="space-y-2">{rows.map((row) => {
        const duration = shiftDuration(row, now);
        const hasInLocation = row.payload.clock_in_lat != null && row.payload.clock_in_lng != null;
        const hasOutLocation = row.payload.clock_out_lat != null && row.payload.clock_out_lng != null;
        return <article key={row.id} className="rounded-2xl border bg-background p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{formatDate(String(row.payload.date ?? ""))} · {elapsedLabel(duration)}</p><p className="mt-1 text-xs text-muted-foreground">Giriş {row.payload.clock_in_at ? new Date(String(row.payload.clock_in_at)).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—"} · Çıkış {row.payload.clock_out_at ? new Date(String(row.payload.clock_out_at)).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "Devam ediyor"}</p></div><div className="flex gap-2 text-[11px]">{hasInLocation && <span className="rounded-full bg-sky-500/10 px-2 py-1 text-sky-700 dark:text-sky-300">Giriş konumlu</span>}{hasOutLocation && <span className="rounded-full bg-sky-500/10 px-2 py-1 text-sky-700 dark:text-sky-300">Çıkış konumlu</span>}</div></div></article>;
      })}</div>}
    </section>
  </div>;
}
