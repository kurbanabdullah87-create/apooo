import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Download, FileText, LockKeyhole, Plus, Search, ShieldCheck, Sparkles, Trash2, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatTL, monthKey, todayISO } from "@/lib/finance";
import { pageHead } from "@/lib/work";
import { useAddBankMovement, useBankMovements, useBankOwnerId, useDeleteBankMovement, type BankDirection } from "@/lib/bank";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/banka")({
  head: () => pageHead("Banka hareketleri", "Kişisel hesap hareketleri ve aylık harcama özeti."),
  component: Bank,
});

function Bank() {
  const ownerId = useBankOwnerId();
  const records = useBankMovements(ownerId);
  const add = useAddBankMovement(ownerId);
  const remove = useDeleteBankMovement(ownerId);
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [adding, setAdding] = useState(false);
  const [direction, setDirection] = useState<BankDirection>("outgoing");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [counterparty, setCounterparty] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => (records.data ?? []).filter((r) => monthKey(r.date) === month), [records.data, month]);
  const displayedRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return query ? rows.filter((row) => `${row.counterparty} ${row.description}`.toLocaleLowerCase("tr-TR").includes(query)) : rows;
  }, [rows, search]);
  const incoming = rows.filter((r) => r.direction === "incoming").reduce((sum, r) => sum + r.amount, 0);
  const outgoing = rows.filter((r) => r.direction === "outgoing").reduce((sum, r) => sum + r.amount, 0);
  const outgoingRows = rows.filter((r) => r.direction === "outgoing");
  const incomingRows = rows.filter((r) => r.direction === "incoming");
  const topRecipient = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of outgoingRows) {
      const name = row.counterparty.trim() || "Belirtilmeyen alıcı";
      totals.set(name, (totals.get(name) ?? 0) + row.amount);
    }
    return [...totals].sort((a, b) => b[1] - a[1])[0];
  }, [outgoingRows]);
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

  async function downloadReport() {
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
      const fontToBase64 = async (path: string) => {
        const bytes = new Uint8Array(await (await fetch(path)).arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
      };
      doc.addFileToVFS("DejaVuSans.ttf", await fontToBase64("/fonts/DejaVuSans.ttf"));
      doc.addFileToVFS("DejaVuSans-Bold.ttf", await fontToBase64("/fonts/DejaVuSans-Bold.ttf"));
      doc.addFont("DejaVuSans.ttf", "Saha", "normal");
      doc.addFont("DejaVuSans-Bold.ttf", "Saha", "bold");
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 14;
      const contentWidth = pageWidth - margin * 2;
      const ink = [15, 23, 42] as const;
      const muted = [100, 116, 139] as const;
      const line = [226, 232, 240] as const;
      const drawFooter = (page: number) => {
        doc.setDrawColor(...line);
        doc.line(margin, 284, pageWidth - margin, 284);
        doc.setFont("Saha", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...muted);
        doc.text("SAHA  ·  Kişisel finans özeti  ·  Gizli", margin, 290);
        doc.text(`Sayfa ${page}`, pageWidth - margin, 290, { align: "right" });
      };
      const drawTableHeading = (y: number) => {
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin, y - 5, contentWidth, 10, 2, 2, "F");
        doc.setFont("Saha", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...muted);
        doc.text("TARİH / TÜR", margin + 3, y + 1);
        doc.text("İŞLEM DETAYI", margin + 39, y + 1);
        doc.text("TUTAR", pageWidth - margin - 3, y + 1, { align: "right" });
      };

      // Editorial cover and monthly summary.
      doc.setFillColor(...ink);
      doc.roundedRect(0, 0, pageWidth, 68, 0, 0, "F");
      doc.setFillColor(16, 185, 129);
      doc.roundedRect(margin, 13, 13, 13, 4, 4, "F");
      doc.setFont("Saha", "bold");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text("S", margin + 6.5, 21.5, { align: "center" });
      doc.setFontSize(9);
      doc.text("SAHA  /  HESAP RAPORU", margin + 18, 18);
      doc.setFont("Saha", "normal");
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text("KİŞİSEL VE GİZLİ", pageWidth - margin, 18, { align: "right" });
      doc.setFont("Saha", "bold");
      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      doc.text("Aylık hesap özeti", margin, 43);
      doc.setFont("Saha", "normal");
      doc.setFontSize(10);
      doc.setTextColor(203, 213, 225);
      doc.text(monthLabel, margin, 53);
      doc.setDrawColor(51, 65, 85);
      doc.line(margin, 60, pageWidth - margin, 60);
      doc.setFontSize(7.5);
      doc.text("Hesap hareketlerine dayalı kişisel rapor", margin, 65);

      const cards = [
        { label: "GELEN PARA", value: incoming, fill: [236, 253, 245] as const, tone: [5, 150, 105] as const },
        { label: "ÇIKAN PARA", value: outgoing, fill: [255, 241, 242] as const, tone: [225, 29, 72] as const },
        { label: "AYLIK NET", value: incoming - outgoing, fill: [238, 242, 255] as const, tone: [79, 70, 229] as const },
      ];
      const cardGap = 4;
      const cardWidth = (contentWidth - cardGap * 2) / 3;
      cards.forEach((card, index) => {
        const x = margin + index * (cardWidth + cardGap);
        doc.setFillColor(...card.fill);
        doc.roundedRect(x, 78, cardWidth, 27, 3, 3, "F");
        doc.setFont("Saha", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...card.tone);
        doc.text(card.label, x + 4, 86);
        doc.setFontSize(10.5);
        doc.text(doc.splitTextToSize(formatTL(card.value), cardWidth - 8), x + 4, 97);
      });

      doc.setFont("Saha", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...ink);
      doc.text("Ayın görünümü", margin, 119);
      doc.setFont("Saha", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.text(`${rows.length} işlem  ·  ${incomingRows.length} giriş  ·  ${outgoingRows.length} çıkış`, margin, 126);
      const totalFlow = incoming + outgoing;
      const barY = 133;
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(margin, barY, contentWidth, 4, 2, 2, "F");
      if (totalFlow > 0) {
        const incomingWidth = contentWidth * (incoming / totalFlow);
        if (incoming > 0) {
          doc.setFillColor(16, 185, 129);
          doc.roundedRect(margin, barY, Math.max(3, incomingWidth), 4, 2, 2, "F");
        }
        if (outgoing > 0) {
          doc.setFillColor(244, 63, 94);
          doc.roundedRect(margin + incomingWidth, barY, Math.max(3, contentWidth - incomingWidth), 4, 2, 2, "F");
        }
      }
      doc.setFontSize(7.5);
      doc.setTextColor(...muted);
      doc.text(`Gelen ${formatTL(incoming)}`, margin, 143);
      doc.setTextColor(225, 29, 72);
      doc.text(`Çıkan ${formatTL(outgoing)}`, pageWidth - margin, 143, { align: "right" });

      const insightY = 151;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, insightY, contentWidth, 24, 3, 3, "F");
      doc.setFont("Saha", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...muted);
      doc.text("AYLIK İŞLEM SAYISI", margin + 4, insightY + 7);
      doc.setTextColor(...ink);
      doc.setFontSize(10);
      doc.text(String(rows.length), margin + 4, insightY + 16);
      doc.setDrawColor(...line);
      doc.line(margin + 43, insightY + 4, margin + 43, insightY + 20);
      doc.setFont("Saha", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...muted);
      doc.text("EN YÜKSEK GÖNDERİM TOPLAMI", margin + 49, insightY + 7);
      doc.setFont("Saha", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...ink);
      const recipientLabel = topRecipient ? `${topRecipient[0]} · ${formatTL(topRecipient[1])}` : "Bu ay çıkış kaydı yok";
      doc.text(doc.splitTextToSize(recipientLabel, contentWidth - 58), margin + 49, insightY + 15);

      // Transaction ledger. Repeat the header whenever a page break occurs.
      doc.setFont("Saha", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...ink);
      doc.text("İşlem dökümü", margin, 190);
      doc.setFont("Saha", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...muted);
      doc.text("Her hareket tutarı, tarafı ve açıklamasıyla listelenir.", margin, 196);
      let y = 207;
      drawTableHeading(y);
      y += 10;
      const orderedRows = [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
      if (!orderedRows.length) {
        doc.setFont("Saha", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...muted);
        doc.text("Seçilen ayda kayıtlı hesap hareketi bulunmuyor.", margin + 2, y + 8);
      }
      for (const [index, row] of orderedRows.entries()) {
        const counterparty = row.counterparty.trim() || "Taraf belirtilmedi";
        const descriptionText = row.description.trim() || "Açıklama eklenmemiş";
        doc.setFont("Saha", "normal");
        doc.setFontSize(7.5);
        const nameLines = doc.splitTextToSize(counterparty, 91) as string[];
        const descriptionLines = doc.splitTextToSize(descriptionText, 91) as string[];
        const rowHeight = Math.max(17, 5 + nameLines.length * 4 + descriptionLines.length * 3.5);
        if (y + rowHeight > 276) {
          doc.addPage();
          y = 18;
          drawTableHeading(y);
          y += 10;
        }
        if (index % 2 === 0) {
          doc.setFillColor(250, 251, 253);
          doc.roundedRect(margin, y - 3, contentWidth, rowHeight, 2, 2, "F");
        }
        const isIncoming = row.direction === "incoming";
        doc.setFont("Saha", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...(isIncoming ? [5, 150, 105] as const : [225, 29, 72] as const));
        doc.text(formatDate(row.date), margin + 3, y + 3);
        doc.setFont("Saha", "normal");
        doc.setFontSize(7);
        doc.text(isIncoming ? "GELEN" : "GİDEN", margin + 3, y + 8);
        doc.setFont("Saha", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...ink);
        doc.text(nameLines, margin + 39, y + 3);
        doc.setFont("Saha", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...muted);
        doc.text(descriptionLines, margin + 39, y + 3 + nameLines.length * 4);
        doc.setFont("Saha", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...(isIncoming ? [5, 150, 105] as const : [225, 29, 72] as const));
        doc.text(`${isIncoming ? "+" : "−"}${formatTL(row.amount)}`, pageWidth - margin - 3, y + 4, { align: "right" });
        y += rowHeight;
      }
      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        drawFooter(page);
      }
      doc.save(`saha-hesap-ozeti-${month}.pdf`);
    } catch {
      toast.error("PDF raporu oluşturulamadı");
    }
  }

  if (ownerId === undefined) return <p className="py-12 text-center text-muted-foreground">Oturum kontrol ediliyor…</p>;
  if (!ownerId) return <p className="py-12 text-center text-muted-foreground">Hareketleri görmek için oturum açın.</p>;

  return <div className="space-y-5 pb-6">
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-lg">
      <div className="absolute -right-10 -top-10 size-40 rounded-full bg-indigo-400/10 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">Finans özeti</p><h1 className="mt-1 text-2xl font-bold">Hesap hareketleri</h1><p className="mt-1 text-sm text-slate-300">Seçili ayın kişisel gelir ve giderleri</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/10 p-3"><WalletCards className="size-5" /></div>
      </div>
      <div className="relative mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3"><div className="flex items-center gap-2 text-xs text-emerald-200"><ArrowDownLeft className="size-4"/>Gelen</div><p className="num mt-2 text-lg font-semibold">{formatTL(incoming)}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3"><div className="flex items-center gap-2 text-xs text-rose-200"><ArrowUpRight className="size-4"/>Çıkan</div><p className="num mt-2 text-lg font-semibold">{formatTL(outgoing)}</p></div>
      </div>
      <div className="relative mt-3 flex items-center justify-between rounded-2xl bg-white/[0.08] px-4 py-3"><span className="text-sm text-slate-300">Aylık net</span><span className="num text-lg font-bold">{formatTL(incoming - outgoing)}</span></div>
    </section>

    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-amber-500/10 p-2 text-amber-600 dark:text-amber-300"><ShieldCheck className="size-5"/></div><div className="min-w-0"><p className="font-semibold">Otomatik banka aktarımı etkin değil</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Şimdilik hareketleri elle kaydedebilirsin. Otomatik aktarım, desteklenen bankalar ve hesap sahibinin onayıyla çalışan yetkili açık bankacılık bağlantısı gerektirir. Hesap numarası tek başına hareketleri almaya yetmez.</p></div></div>
      <p className="mt-3 border-t border-amber-500/15 pt-3 text-xs text-muted-foreground">Banka şifreni, SMS kodunu veya internet bankacılığı bilgilerini bu ekrana girme.</p>
    </section>

    <section className="relative overflow-hidden rounded-3xl border bg-card shadow-sm">
      <div className="absolute -right-16 -top-16 size-48 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary"><FileText className="size-5"/></div>
            <div><div className="flex items-center gap-2"><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Aylık rapor</p><Sparkles className="size-3.5 text-amber-500"/></div><h2 className="mt-1 text-xl font-bold">PDF raporun hazır</h2><p className="mt-1 text-sm text-muted-foreground">Özet, aylık akış ve tüm hareketlerin tek dosyada.</p></div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border bg-background/70 px-3 py-2"><CalendarDays className="size-4 text-muted-foreground"/><Input aria-label="Rapor ayı" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-7 w-[142px] border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"/></div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-2xl bg-emerald-500/[0.07] p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Gelen</p><p className="num mt-1 truncate text-sm font-bold sm:text-base">{formatTL(incoming)}</p></div>
          <div className="rounded-2xl bg-rose-500/[0.07] p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">Çıkan</p><p className="num mt-1 truncate text-sm font-bold sm:text-base">{formatTL(outgoing)}</p></div>
          <div className="rounded-2xl bg-indigo-500/[0.07] p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">İşlem</p><p className="num mt-1 text-sm font-bold sm:text-base">{rows.length} kayıt</p></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-3.5"/>PDF bu cihazda hazırlanır; yalnızca seçili ayın hareketlerini içerir.</p>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => void downloadReport()} disabled={records.isLoading}><Download/>PDF raporunu indir</Button><Button onClick={() => setAdding((value) => !value)}><Plus/>Hareket ekle</Button></div>
        </div>
      </div>
    </section>
    {adding && <form className="space-y-3 rounded-2xl border bg-card p-4" onSubmit={(event) => {
      event.preventDefault();
      const value = Number(amount.replace(",", "."));
      if (!(value > 0) || !Number.isFinite(value) || value > 99_999_999.99) return toast.error("Geçerli bir tutar girin");
      if (!date || Number.isNaN(Date.parse(date + "T00:00:00"))) return toast.error("Geçerli bir tarih seçin");
      add.mutate({ direction, amount: value, date, counterparty: counterparty.trim().slice(0, 120), description: description.trim().slice(0, 500) }, { onSuccess: () => { setAdding(false); setAmount(""); setCounterparty(""); setDescription(""); } });
    }}>
      <div className="flex items-center justify-between"><div><h2 className="font-semibold">Yeni hareket</h2><p className="text-xs text-muted-foreground">Kayıt yalnızca bu hesaba görünür.</p></div><Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Kapat</Button></div>
      <div className="grid grid-cols-2 gap-2"><Button type="button" variant={direction === "incoming" ? "default" : "secondary"} onClick={() => setDirection("incoming")}><ArrowDownLeft/>Gelen para</Button><Button type="button" variant={direction === "outgoing" ? "default" : "secondary"} onClick={() => setDirection("outgoing")}><ArrowUpRight/>Çıkan para</Button></div>
      <div className="space-y-2"><Label htmlFor="bank-amount">Tutar (TL)</Label><Input id="bank-amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="bank-date">İşlem tarihi</Label><Input id="bank-date" required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="bank-counterparty">{direction === "incoming" ? "Kimden geldi?" : "Kime gönderildi?"}</Label><Input id="bank-counterparty" maxLength={120} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="bank-description">Açıklama</Label><Input id="bank-description" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <Button type="submit" disabled={add.isPending}>Kaydet</Button>
    </form>}
    {records.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Hareketler yüklenemedi. Bağlantını kontrol edip yeniden dene.</p>}
    <div className="space-y-3"><div className="flex items-center justify-between px-1"><div><h2 className="font-semibold">İşlemler</h2><p className="text-xs text-muted-foreground">{rows.length} kayıt · {month}</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{displayedRows.length} gösteriliyor</span></div>
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input aria-label="Hareketlerde ara" placeholder="Kişi veya açıklamada ara" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-xl pl-9"/></div>
    {displayedRows.map((row) => <article key={row.id} className="flex items-start justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex min-w-0 gap-3"><div className={"mt-0.5 rounded-xl p-2 " + (row.direction === "incoming" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600")}>{row.direction === "incoming" ? <ArrowDownLeft className="size-4"/> : <ArrowUpRight className="size-4"/>}</div><div className="min-w-0"><p className="truncate font-medium">{row.counterparty || (row.direction === "incoming" ? "Gelen para" : "Çıkan para")}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(row.date)} · {row.direction === "incoming" ? "Kimden" : "Kime"}</p>{row.description && <p className="mt-2 break-words text-sm text-muted-foreground">{row.description}</p>}</div></div>
      <div className="flex shrink-0 items-start gap-1"><span className={"num pt-1 text-right text-sm font-semibold " + (row.direction === "incoming" ? "text-emerald-600" : "text-rose-600")}>{row.direction === "incoming" ? "+" : "−"}{formatTL(row.amount)}</span><Button variant="ghost" size="icon" aria-label="Hareketi kalıcı sil" title="Kalıcı sil" disabled={remove.isPending} onClick={() => remove.mutate(row.id)}><Trash2 className="size-4"/></Button></div>
    </article>)}
    {!displayedRows.length && !records.isLoading && !records.error && (rows.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aramanla eşleşen hareket yok.</p> : <div className="rounded-2xl border border-dashed bg-card/60 px-5 py-10 text-center"><div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><WalletCards className="size-6"/></div><p className="mt-3 font-semibold">Bu ay için hareket yok</p><p className="mt-1 text-sm text-muted-foreground">İlk gelen veya çıkan para kaydını ekleyebilirsin.</p><Button className="mt-4" variant="secondary" onClick={() => setAdding(true)}><Plus/>Hareket ekle</Button></div>)}
    </div>
  </div>;
}

function Summary({ label, amount, tone }: { label: string; amount: number; tone: string }) {
  return <div className="min-w-0 rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={"num mt-1 truncate text-sm font-semibold " + tone}>{formatTL(amount)}</p></div>;
}
