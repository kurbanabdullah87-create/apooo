import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Download, FileDown, FileText, LockKeyhole, Plus, Search, ShieldCheck, Sparkles, Trash2, WalletCards, KeyRound, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatTL, monthKey, todayISO } from "@/lib/finance";
import { pageHead } from "@/lib/work";
import { deleteLegacyBankDocuments, migrateLegacyBankData, useAddBankMovement, useBankAccounts, useBankMovements, useBankOwnerId, useBankVault, useDeleteBankMovement, type BankDirection } from "@/lib/bank";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { parseBankSms } from "@/lib/bank-sms";

export const Route = createFileRoute("/_authenticated/banka")({
  head: () => pageHead("Banka hareketleri", "Kişisel hesap hareketleri ve aylık harcama özeti."),
  component: Bank,
});

function Bank() {
  const ownerId = useBankOwnerId();
  const vault = useBankVault(ownerId);
  const queryClient = useQueryClient();
  const accounts = useBankAccounts(ownerId, vault.unlocked);
  const [requestedAccountId, setRequestedAccountId] = useState("");
  const activeAccount = accounts.data?.find((account) => account.id === requestedAccountId) ?? accounts.data?.[0] ?? null;
  const records = useBankMovements(ownerId, activeAccount?.id, vault.unlocked);
  const add = useAddBankMovement(ownerId, activeAccount?.id);
  const remove = useDeleteBankMovement(ownerId);
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [adding, setAdding] = useState(false);
  const [direction, setDirection] = useState<BankDirection>("outgoing");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [counterparty, setCounterparty] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [vaultPassphrase, setVaultPassphrase] = useState("");
  const [vaultConfirm, setVaultConfirm] = useState("");
  const [vaultBusy, setVaultBusy] = useState(false);
  const [smsImportOpen, setSmsImportOpen] = useState(false);
  const [smsText, setSmsText] = useState("");

  useEffect(() => {
    if (!vault.unlocked) {
      queryClient.removeQueries({ queryKey: ["bank-accounts"] });
      queryClient.removeQueries({ queryKey: ["bank-movements"] });
    }
  }, [vault.unlocked, ownerId, queryClient]);

  const rows = useMemo(() => (records.data ?? []).filter((r) => month === "all" || monthKey(r.date) === month), [records.data, month]);
  const displayedRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return query ? rows.filter((row) => `${row.counterparty} ${row.description}`.toLocaleLowerCase("tr-TR").includes(query)) : rows;
  }, [rows, search]);
  const incoming = rows.filter((r) => r.direction === "incoming").reduce((sum, r) => sum + r.amount, 0);
  const outgoing = rows.filter((r) => r.direction === "outgoing").reduce((sum, r) => sum + r.amount, 0);
  const outgoingRows = rows.filter((r) => r.direction === "outgoing");
  const incomingRows = rows.filter((r) => r.direction === "incoming");
  const topRecipients = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of outgoingRows) {
      const name = row.counterparty.trim() || "Belirtilmeyen alıcı";
      totals.set(name, (totals.get(name) ?? 0) + row.amount);
    }
    return [...totals].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [outgoingRows]);
  const largestExpense = outgoingRows.reduce((largest, row) => Math.max(largest, row.amount), 0);
  const averageExpense = outgoingRows.length ? outgoing / outgoingRows.length : 0;
  const monthLabel = month === "all" ? "Tüm zamanlar" : new Date(`${month}-01T00:00:00`).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

  async function downloadReport() {
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
      const generatedAt = new Date().toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
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
      doc.setProperties({
        title: `SAHA hesap özeti — ${monthLabel}`,
        subject: "Hesap hareketleri ve aylık finans özeti",
        author: "SAHA",
        creator: "SAHA",
        keywords: "hesap hareketi, aylık özet, SAHA",
      });
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 14;
      const contentWidth = pageWidth - margin * 2;
      const ink = [15, 23, 42] as const;
      const muted = [100, 116, 139] as const;
      const line = [226, 232, 240] as const;
      const drawFooter = (page: number, totalPages: number) => {
        doc.setDrawColor(...line);
        doc.line(margin, 284, pageWidth - margin, 284);
        doc.setFont("Saha", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...muted);
        doc.text("SAHA  ·  Bu cihazdaki şifreli kasadan oluşturuldu", margin, 290);
        doc.text(`Oluşturulma: ${generatedAt}`, pageWidth / 2, 290, { align: "center" });
        doc.text(`${page} / ${totalPages}`, pageWidth - margin, 290, { align: "right" });
      };
      const drawTableHeading = (y: number) => {
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin, y - 5, contentWidth, 10, 2, 2, "F");
        doc.setFont("Saha", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(...muted);
        doc.text("TARİH", margin + 3, y + 1);
        doc.text("İŞLEM / AÇIKLAMA", margin + 27, y + 1);
        doc.text("REFERANS / DURUM", margin + 90, y + 1);
        doc.text("TUTAR", margin + 146, y + 1, { align: "right" });
        doc.text("BAKİYE", pageWidth - margin - 3, y + 1, { align: "right" });
      };

      // Editorial cover and monthly summary.
      doc.setFillColor(...ink);
      doc.rect(0, 0, pageWidth, 70, "F");
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 64, pageWidth, 6, "F");
      doc.setFillColor(16, 185, 129);
      doc.rect(0, 68, pageWidth, 2, "F");
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
      doc.text("HESAP SAHİBİNE ÖZEL", pageWidth - margin, 18, { align: "right" });
      doc.setFont("Saha", "bold");
      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      doc.text(month === "all" ? "Hesap hareketleri özeti" : "Aylık hesap özeti", margin, 43);
      doc.setFont("Saha", "normal");
      doc.setFontSize(10);
      doc.setTextColor(203, 213, 225);
      doc.text(monthLabel, margin, 53);
      doc.setDrawColor(51, 65, 85);
      doc.line(margin, 60, pageWidth - margin, 60);
      doc.setFontSize(7.5);
      doc.text(`Hesap: ${activeAccount ? `${activeAccount.bank_name} · ${activeAccount.account_name}` : "Manuel kayıt hesabı"} · ${activeAccount?.account_kind === "business" ? "İşletme" : "Kişisel"}`, margin, 65);
      doc.setFont("Saha", "normal");
      doc.setFontSize(7);
      doc.setTextColor(203, 213, 225);
      doc.text("Hareket ayrıntıları seçili ay ve bu cihazdaki seçili hesaba göre hazırlanmıştır.", margin, 76);
      doc.setFontSize(6.5);
      doc.text("Bilgilendirme: Bu rapor uygulamadaki kayıtları gösterir; bankanın resmi ekstresi veya dekontu değildir.", margin, 79);

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
        doc.roundedRect(x, 81, cardWidth, 27, 3, 3, "F");
        doc.setFont("Saha", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...card.tone);
        doc.text(card.label, x + 4, 89);
        doc.setFontSize(10.5);
        doc.text(doc.splitTextToSize(formatTL(card.value), cardWidth - 8), x + 4, 100);
      });

      doc.setFont("Saha", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...ink);
      doc.text(month === "all" ? "Genel görünüm" : "Ayın görünümü", margin, 119);
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
      doc.roundedRect(margin, insightY, contentWidth, 27, 3, 3, "F");
      const knownRecipients = outgoingRows.filter((row) => row.counterparty.trim()).length;
      const metrics = [
        { label: "HAREKET", value: String(rows.length), color: ink },
        { label: "ORTALAMA ÇIKIŞ", value: formatTL(averageExpense), color: ink },
        { label: "EN YÜKSEK ÇIKIŞ", value: formatTL(largestExpense), color: [225, 29, 72] as const },
        { label: "ALICISI BİLİNEN", value: `${knownRecipients} / ${outgoingRows.length}`, color: [5, 150, 105] as const },
      ];
      const metricWidth = contentWidth / metrics.length;
      metrics.forEach((metric, index) => {
        const x = margin + index * metricWidth;
        if (index) {
          doc.setDrawColor(...line);
          doc.line(x, insightY + 4, x, insightY + 23);
        }
        doc.setFont("Saha", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(...muted);
        doc.text(metric.label, x + 4, insightY + 7);
        doc.setFontSize(9);
        doc.setTextColor(...metric.color);
        doc.text(doc.splitTextToSize(metric.value, metricWidth - 8), x + 4, insightY + 17);
      });

      const recipientY = 184;
      doc.setFont("Saha", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...ink);
      doc.text("Alıcı bazında harcama", margin, recipientY);
      doc.setFont("Saha", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...muted);
      doc.text("En yüksek beş alıcı; alıcı adı hareket kaydında varsa gösterilir.", margin, recipientY + 5);
      if (topRecipients.length) {
        topRecipients.forEach(([name, total], index) => {
          const lineY = recipientY + 13 + index * 7;
          const barMax = 81;
          const barWidth = outgoing ? barMax * (total / outgoing) : 0;
          doc.setFont("Saha", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(...ink);
          const recipientLines = doc.splitTextToSize(name, 55) as string[];
          const recipientLabel = recipientLines.length > 1 ? `${recipientLines[0].slice(0, -1)}…` : recipientLines[0];
          doc.text(recipientLabel, margin, lineY);
          doc.setFillColor(226, 232, 240);
          doc.roundedRect(margin + 58, lineY - 3.5, barMax, 3, 1.5, 1.5, "F");
          if (barWidth > 0) {
            doc.setFillColor(99, 102, 241);
            doc.roundedRect(margin + 58, lineY - 3.5, Math.max(2, barWidth), 3, 1.5, 1.5, "F");
          }
          doc.setFont("Saha", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(...ink);
          doc.text(formatTL(total), pageWidth - margin, lineY, { align: "right" });
        });
      } else {
        doc.setFont("Saha", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text("Bu ay için çıkış kaydı bulunmuyor.", margin, recipientY + 15);
      }

      // Keep the detailed ledger on its own page after the visual summary.
      doc.addPage();
      doc.setFont("Saha", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...ink);
      doc.text("İşlem dökümü", margin, 19);
      doc.setFont("Saha", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...muted);
      doc.text("Tarih, yön, taraf, işlem türü, açıklama, referans, tutar, bakiye ve kayıt kaynağı.", margin, 25);
      doc.setFont("Saha", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...muted);
      doc.text(`${rows.length} hareket  ·  Gelen ${formatTL(incoming)}  ·  Giden ${formatTL(outgoing)}`, pageWidth - margin, 25, { align: "right" });
      let y = 36;
      drawTableHeading(y);
      y += 10;
      const orderedRows = [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
      if (!orderedRows.length) {
        doc.setFont("Saha", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...muted);
        doc.text(month === "all" ? "Kayıtlı hesap hareketi bulunmuyor." : "Seçilen ayda kayıtlı hesap hareketi bulunmuyor.", margin + 2, y + 8);
      }
      for (const [index, row] of orderedRows.entries()) {
        const counterparty = row.counterparty.trim() || (row.source === "open_banking" ? "Karşı taraf banka verisinde yok" : "Taraf belirtilmedi");
        const descriptionText = row.description.trim() || "Açıklama eklenmemiş";
        doc.setFont("Saha", "normal");
        doc.setFontSize(7.5);
        const nameLines = doc.splitTextToSize(counterparty, 59) as string[];
        const descriptionLines = doc.splitTextToSize(descriptionText, 59) as string[];
        const referenceText = row.reference?.trim() || "Referans yok";
        const statusText = row.status?.trim() || "Durum belirtilmedi";
        const sourceText = row.source === "open_banking" ? "Banka bağlantısı" : "Elle kayıt";
        const typeText = row.type?.trim() || "Diğer";
        const referenceLines = doc.splitTextToSize(`${typeText} · ${statusText}\n${referenceText}\n${sourceText}`, 31) as string[];
        const rowHeight = Math.max(20, 5 + nameLines.length * 4 + descriptionLines.length * 3.5, referenceLines.length * 3.5 + 7);
        if (y + rowHeight > pageHeight - 21) {
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
        doc.setTextColor(...(isIncoming ? [5, 150, 105] as const : [225, 29, 72] as const));
        doc.text(isIncoming ? "GELEN" : "GİDEN", margin + 3, y + 8);
        doc.setFont("Saha", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...ink);
        doc.text(nameLines, margin + 27, y + 3);
        doc.setFont("Saha", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...muted);
        doc.text(descriptionLines, margin + 27, y + 3 + nameLines.length * 4);
        doc.setFont("Saha", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...muted);
        doc.text(referenceLines, margin + 90, y + 4);
        doc.setFont("Saha", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...(isIncoming ? [5, 150, 105] as const : [225, 29, 72] as const));
        doc.text(`${isIncoming ? "+" : "−"}${formatTL(row.amount)}`, margin + 146, y + 4, { align: "right" });
        doc.setFont("Saha", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...ink);
        doc.text(typeof row.balance_after === "number" && Number.isFinite(row.balance_after) ? formatTL(row.balance_after) : "—", pageWidth - margin - 3, y + 4, { align: "right" });
        y += rowHeight;
      }
      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        drawFooter(page, pages);
      }
      doc.save(`saha-hesap-ozeti-${month === "all" ? "tum-zamanlar" : month}.pdf`);
      toast.success("PDF bu cihazda oluşturuldu ve indirildi; sunucuya kaydedilmedi.");
    } catch {
      toast.error("PDF raporu oluşturulamadı");
    }
  }

  async function downloadSahaReceipt(row: (typeof rows)[number]) {
    if (!ownerId || !activeAccount) return toast.error("Belge oluşturmak için hesap seçilmeli");
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a5", compress: true });
      const fontToBase64 = async (path: string) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error("PDF yazı tipi yüklenemedi.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
      };
      doc.addFileToVFS("DejaVuSans.ttf", await fontToBase64("/fonts/DejaVuSans.ttf"));
      doc.addFileToVFS("DejaVuSans-Bold.ttf", await fontToBase64("/fonts/DejaVuSans-Bold.ttf"));
      doc.addFont("DejaVuSans.ttf", "Saha", "normal");
      doc.addFont("DejaVuSans-Bold.ttf", "Saha", "bold");
      doc.setProperties({ title: `SAHA hareket özeti — ${row.date}`, author: "SAHA", creator: "SAHA" });
      const pageWidth = 148;
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      const ink = [15, 23, 42] as const;
      const muted = [100, 116, 139] as const;
      const line = [226, 232, 240] as const;
      const positive = row.direction === "incoming";
      const accent = positive ? [5, 150, 105] as const : [225, 29, 72] as const;

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 55, "F");
      doc.setFillColor(...accent);
      doc.rect(0, 52, pageWidth, 3, "F");
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, 12, 11, 11, 3, 3, "F");
      doc.setFont("Saha", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("S", margin + 5.5, 19.4, { align: "center" });
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text("SAHA  /  HESAP HAREKETLERİ", margin + 16, 19);
      doc.setFontSize(17);
      doc.setTextColor(255, 255, 255);
      doc.text("Hareket özeti", margin, 37);
      doc.setFont("Saha", "normal");
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text(formatDate(row.date), pageWidth - margin, 37, { align: "right" });

      doc.setFillColor(...(positive ? [236, 253, 245] as const : [255, 241, 242] as const));
      doc.roundedRect(margin, 64, contentWidth, 34, 4, 4, "F");
      doc.setFont("Saha", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...accent);
      doc.text(positive ? "GELEN PARA" : "GİDEN PARA", margin + 5, 73);
      doc.setFontSize(18);
      doc.text(`${positive ? "+" : "−"}${formatTL(row.amount)}`, margin + 5, 88);
      let y = 109;
      const drawField = (label: string, value: string, height?: number) => {
        const safeValue = value.trim() || "Bilgi sağlanmadı";
        const valueLines = doc.splitTextToSize(safeValue, contentWidth - 10) as string[];
        const fieldHeight = Math.max(height ?? 0, 8 + valueLines.length * 4.2);
        if (y + fieldHeight > 184) {
          doc.addPage();
          doc.setFillColor(15, 23, 42);
          doc.rect(0, 0, pageWidth, 18, "F");
          doc.setFont("Saha", "bold");
          doc.setFontSize(8);
          doc.setTextColor(255, 255, 255);
          doc.text("SAHA  /  HAREKET ÖZETİ · DEVAM", margin, 12);
          y = 25;
        }
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin, y, contentWidth, fieldHeight, 2.5, 2.5, "F");
        doc.setFont("Saha", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(...muted);
        doc.text(label.toLocaleUpperCase("tr-TR"), margin + 5, y + 4);
        doc.setFont("Saha", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...ink);
        doc.text(valueLines, margin + 5, y + 9);
        y += fieldHeight + 2;
      };
      drawField("Hesap", `${activeAccount.bank_name} · ${activeAccount.account_name}`);
      drawField(positive ? "Gönderen" : "Alıcı", row.counterparty || (row.source === "open_banking" ? "Banka verisinde taraf bilgisi bulunmuyor" : "Taraf belirtilmedi"));
      drawField("İşlem açıklaması", row.description || "Açıklama eklenmemiş");
      drawField("İşlem türü · Durum", `${row.type || "Diğer"}  ·  ${row.status || "Belirtilmedi"}`);
      drawField("Banka referansı", row.reference || "Referans sağlanmadı");
      drawField("Kayıt kaynağı", row.source === "open_banking" ? "Banka bağlantısından eşitlendi" : "Kullanıcı tarafından elle girildi");

      doc.setDrawColor(...line);
      doc.line(margin, 190, pageWidth - margin, 190);
      doc.setFont("Saha", "bold");
      doc.setFontSize(7);
      doc.setTextColor(185, 28, 28);
      doc.text("SAHA KAYDI  ·  RESMİ BANKA DEKONTU DEĞİLDİR", margin, 197);
      doc.setFont("Saha", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...muted);
      doc.text("Bu belge, bu cihazdaki şifreli kasada bulunan hareket bilgilerini özetler.", margin, 202);
      const filename = `saha-hareket-${row.date}-${row.id.slice(0, 8)}.pdf`;
      doc.save(filename);
      toast.success("SAHA hareket belgesi bu cihazda oluşturuldu; sunucuya kaydedilmedi.");
    } catch {
      toast.error("Hareket belgesi oluşturulamadı veya saklanamadı");
    }
  }

  async function submitVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVaultBusy(true);
    try {
      if (!vault.exists) {
        if (vaultPassphrase !== vaultConfirm) throw new Error("Kasa parolaları eşleşmiyor.");
        await vault.create(vaultPassphrase);
        toast.success("Bu cihazda şifreli kişisel kasa oluşturuldu.");
      } else {
        await vault.unlock(vaultPassphrase);
        toast.success("Şifreli kişisel kasa açıldı.");
      }
      setVaultPassphrase("");
      setVaultConfirm("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kasa açılamadı.");
    } finally { setVaultBusy(false); }
  }

  async function migrateLegacy() {
    if (!ownerId || !window.confirm("Eski banka hesapları ve hareketleri önce bu cihazdaki şifreli kasaya kopyalanıp doğrulanacak, sonra Supabase’deki açık metin kayıtları silinecek. İşlem geri alınamaz. Devam edilsin mi?")) return;
    setVaultBusy(true);
    try {
      const result = await migrateLegacyBankData(ownerId);
      await queryClient.invalidateQueries({ queryKey: ["bank-accounts", ownerId] });
      await queryClient.invalidateQueries({ queryKey: ["bank-movements", ownerId] });
      toast.success(`${result.accountCount} hesap ve ${result.movementCount} hareket şifrelenip bu cihaza taşındı; Supabase kopyaları silindi.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Taşıma tamamlanamadı.");
    } finally { setVaultBusy(false); }
  }

  async function removeCloudPdfs() {
    if (!ownerId || !window.confirm("Supabase özel depolamasındaki eski banka PDF’leri kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?")) return;
    setVaultBusy(true);
    try {
      const removed = await deleteLegacyBankDocuments(ownerId);
      toast.success(`${removed} eski PDF bulut depolamasından silindi.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Eski PDF’ler temizlenemedi.");
    } finally { setVaultBusy(false); }
  }

  function importSmsLocally() {
    const parsed = parseBankSms(smsText);
    if (!parsed) {
      toast.error("Bu SMS’ten tutar ve yön güvenilir biçimde çıkarılamadı. Bilgileri elle gir.");
      return;
    }
    setDirection(parsed.direction);
    setAmount(String(parsed.amount));
    setDate(parsed.date ?? todayISO());
    setCounterparty("");
    setDescription("");
    setAdding(true);
    setSmsText("");
    setSmsImportOpen(false);
    toast.success("Tutar ve yön cihazında ayrıştırıldı. Kaydetmeden önce tarihi ve karşı tarafı doğrula.");
  }

  if (ownerId === undefined) return <p className="py-12 text-center text-muted-foreground">Oturum kontrol ediliyor…</p>;
  if (!ownerId) return <p className="py-12 text-center text-muted-foreground">Hareketleri görmek için oturum açın.</p>;
  if (vault.exists === null) return <p className="py-12 text-center text-muted-foreground">Bu cihazdaki şifreli kasa kontrol ediliyor…</p>;
  if (!vault.unlocked) return <div className="mx-auto max-w-xl space-y-5 py-8">
    <section className="overflow-hidden rounded-3xl border bg-card shadow-xl">
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white sm:p-8">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10"><KeyRound className="size-7 text-emerald-300"/></div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Bu cihazda şifreli kasa</p>
        <h1 className="mt-2 text-2xl font-bold">Banka verilerinin anahtarı sende</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">Hesap adları ve hareketler AES‑GCM ile tarayıcında şifrelenir. Kasa parolası ve açık kayıtlar Supabase’e gönderilmez.</p>
      </div>
      <form className="space-y-4 p-6 sm:p-8" onSubmit={(event) => void submitVault(event)}>
        <div className="space-y-2"><Label htmlFor="bank-vault-pass">{vault.exists ? "Kasa parolası" : "Yeni kasa parolası"}</Label><Input id="bank-vault-pass" type="password" autoComplete={vault.exists ? "current-password" : "new-password"} minLength={vault.exists ? undefined : 14} required value={vaultPassphrase} onChange={(event) => setVaultPassphrase(event.target.value)} placeholder={vault.exists ? "Parolanı gir" : "En az 14 karakter"}/></div>
        {!vault.exists && <><div className="space-y-2"><Label htmlFor="bank-vault-confirm">Parolayı tekrar gir</Label><Input id="bank-vault-confirm" type="password" autoComplete="new-password" minLength={14} required value={vaultConfirm} onChange={(event) => setVaultConfirm(event.target.value)} placeholder="Aynı parolayı tekrar yaz"/></div><p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-muted-foreground">Parolayı unutursan kasayı kurtarmak mümkün olmaz. Güvenli bir parola yöneticisinde sakla. Bu kasa bu tarayıcıya ve cihaza özeldir; cihazlar arası senkronize edilmez.</p></>}
        <Button className="w-full" type="submit" disabled={vaultBusy}><LockKeyhole/>{vault.exists ? "Kasayı aç" : "Şifreli kasayı oluştur"}</Button>
      </form>
    </section>
    {vault.exists && <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4"><p className="font-semibold">Eski sürümdeki bulut kayıtları</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Önceki banka hareketleri ve PDF’ler Supabase’de açık metin olarak duruyor olabilir. Kasayı açtıktan sonra eski hareketleri şifreli olarak cihaza taşıyıp bulut kopyalarını silme işlemini başlatabilirsin.</p></section>}
  </div>;

  return <div className="space-y-5 pb-6">
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-lg sm:p-6">
      <div className="absolute -right-10 -top-10 size-40 rounded-full bg-indigo-400/10 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">Hesap finansı</p><h1 className="mt-1 text-2xl font-bold">Hesap hareketleri</h1><p className="mt-1 text-sm text-slate-300">Yalnızca hesap sahibinin seçili hesabı</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/10 p-3"><WalletCards className="size-5" /></div>
      </div>
      {accounts.data && accounts.data.length > 0 && <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
        <div className="flex items-center gap-2 text-xs text-slate-300"><span className="size-2 rounded-full bg-emerald-400"/><span>Raporlanan hesap</span></div>
        {accounts.data.length > 1 ? <select aria-label="Raporlanacak banka hesabı" value={activeAccount?.id ?? ""} onChange={(event) => setRequestedAccountId(event.target.value)} className="max-w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-300">
          {accounts.data.map((account) => <option key={account.id} value={account.id}>{account.bank_name} · {account.account_name} · {account.account_kind === "business" ? "İşletme" : "Kişisel"}</option>)}
        </select> : <span className="text-sm font-medium">{activeAccount?.bank_name} · {activeAccount?.account_name}</span>}
      </div>}
      <div className="relative mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3"><div className="flex items-center gap-2 text-xs text-emerald-200"><ArrowDownLeft className="size-4"/>Gelen</div><p className="num mt-2 text-lg font-semibold">{formatTL(incoming)}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3"><div className="flex items-center gap-2 text-xs text-rose-200"><ArrowUpRight className="size-4"/>Çıkan</div><p className="num mt-2 text-lg font-semibold">{formatTL(outgoing)}</p></div>
      </div>
      <div className="relative mt-3 flex items-center justify-between rounded-2xl bg-white/[0.08] px-4 py-3"><span className="text-sm text-slate-300">{month === "all" ? "Tüm zamanlar net" : "Aylık net"}</span><span className="num text-lg font-bold">{formatTL(incoming - outgoing)}</span></div>
    </section>

    {accounts.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Şifreli kasa açılamadı. Kapatıp parolanla yeniden aç.</p>}
    <section className="flex flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="flex items-center gap-2 font-semibold"><LockKeyhole className="size-4 text-emerald-600"/>Bu cihazdaki kasa açık</p><p className="mt-1 text-xs text-muted-foreground">Kayıtlar Supabase’e gitmez. İşin bitince kasayı kilitle.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={vaultBusy} onClick={() => void migrateLegacy()}><ShieldCheck className="size-4"/>Eski bulut hareketlerini taşı ve sil</Button><Button variant="outline" size="sm" disabled={vaultBusy} onClick={() => void removeCloudPdfs()}><FileText className="size-4"/>Eski bulut PDF’lerini sil</Button><Button variant="secondary" size="sm" onClick={() => { vault.lock(); queryClient.removeQueries({ queryKey: ["bank-accounts", ownerId] }); queryClient.removeQueries({ queryKey: ["bank-movements", ownerId] }); }}><LockKeyhole className="size-4"/>Kasayı kilitle</Button></div>
    </section>
    <section className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-400 via-primary to-indigo-500"/>
      <div className="flex items-start gap-3 pl-1"><div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-700 dark:text-emerald-300"><ShieldCheck className="size-5"/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Hesap sahibi özelinde · salt okunur</p><span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">Canlı sağlayıcı ayarı bekleniyor</span></div><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Hesap bağlantısı yalnızca hesap sahibine ait olacak. Canlı bağlantı için BKM/TCMB yetkili hesap bilgisi sağlayıcısının API erişimi ve üretim anahtarları gerekir. Saha banka şifresi veya SMS kodu istemez; para transferi yetkisi kullanılmaz.</p></div></div>
      <div className="mt-4 grid gap-2 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-3"><p><span className="mr-2 font-bold text-primary">01</span>Bankanı seç</p><p><span className="mr-2 font-bold text-primary">02</span>Tek hesabı seç</p><p><span className="mr-2 font-bold text-primary">03</span>Bankanda salt-okunur izni onayla</p></div>
      <p className="mt-3 text-[11px] text-muted-foreground">Sağlayıcı seçimi ve üretim erişimi yapılandırılana kadar bu ekranda yalnızca elle girilmiş hareketler görünür. Desteklenmeyen banka veya eksik karşı taraf bilgisi doğrulanmış gibi gösterilmez.</p>
    </section>

    <section className="relative overflow-hidden rounded-3xl border bg-card shadow-sm">
      <div className="absolute -right-16 -top-16 size-48 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary"><FileText className="size-5"/></div>
            <div><div className="flex items-center gap-2"><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{month === "all" ? "Tüm zamanlar" : "Aylık rapor"}</p><Sparkles className="size-3.5 text-amber-500"/></div><h2 className="mt-1 text-xl font-bold">PDF raporun hazır</h2><p className="mt-1 text-sm text-muted-foreground">Özet, para akışı ve seçili dönemin tüm hareketleri tek dosyada.</p></div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border bg-background/70 px-2 py-1.5"><CalendarDays className="ml-1 size-4 text-muted-foreground"/><Input aria-label="Rapor ayı" type="month" value={month === "all" ? "" : month} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} className="h-8 w-[132px] border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"/><Button type="button" size="sm" variant={month === "all" ? "default" : "ghost"} onClick={() => setMonth("all")} className="h-8 px-3">Tümü</Button></div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-2xl bg-emerald-500/[0.07] p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Gelen</p><p className="num mt-1 truncate text-sm font-bold sm:text-base">{formatTL(incoming)}</p></div>
          <div className="rounded-2xl bg-rose-500/[0.07] p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">Çıkan</p><p className="num mt-1 truncate text-sm font-bold sm:text-base">{formatTL(outgoing)}</p></div>
          <div className="rounded-2xl bg-indigo-500/[0.07] p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">İşlem</p><p className="num mt-1 text-sm font-bold sm:text-base">{rows.length} kayıt</p></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-3.5"/>PDF bu cihazda oluşturulur, Supabase’e yüklenmez.</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSmsImportOpen((value) => !value)} disabled={accounts.isLoading || Boolean(accounts.error)}><MessageSquareText/>SMS’ten aktar</Button><Button variant="secondary" onClick={() => void downloadReport()} disabled={records.isLoading || accounts.isLoading || Boolean(accounts.error)}><Download/>PDF raporunu indir</Button><Button onClick={() => setAdding((value) => !value)} disabled={accounts.isLoading || Boolean(accounts.error)}><Plus/>Hareket ekle</Button></div>
        </div>
      </div>
    </section>
    {smsImportOpen && <section className="space-y-3 rounded-2xl border border-primary/20 bg-card p-4 shadow-sm"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><MessageSquareText className="size-5"/></div><div><h2 className="font-semibold">Banka SMS’inden alan çıkar</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">SMS metnini buraya yapıştır. Metin bu ekranda ayrıştırılır; kaydedilmez ve sunucuya gönderilmez. Bankaların SMS biçimleri farklı olduğundan bulunan alanları kontrol etmen gerekir.</p></div></div><Textarea value={smsText} onChange={(event) => setSmsText(event.target.value.slice(0, 4000))} maxLength={4000} rows={4} autoComplete="off" placeholder="Bankadan gelen işlem SMS’ini buraya yapıştır…"/><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => { setSmsText(""); setSmsImportOpen(false); }}>İptal</Button><Button type="button" onClick={importSmsLocally} disabled={!smsText.trim()}><MessageSquareText/>Alanları çıkar</Button></div><p className="text-xs text-muted-foreground">Web uygulaması gelen SMS kutunu okuyamaz. Bu özellik yalnızca senin buraya yapıştırdığın mesajı cihazda işler; kayıt için ayrıca Kaydet’e basmalısın.</p></section>}
    {adding && <form className="space-y-3 rounded-2xl border bg-card p-4" onSubmit={(event) => {
      event.preventDefault();
      const value = Number(amount.replace(",", "."));
      if (!(value > 0) || !Number.isFinite(value) || value > 99_999_999.99) return toast.error("Geçerli bir tutar girin");
      if (!date || Number.isNaN(Date.parse(date + "T00:00:00"))) return toast.error("Geçerli bir tarih seçin");
      add.mutate({ direction, amount: value, date, counterparty: counterparty.trim().slice(0, 120), description: description.trim().slice(0, 500) }, { onSuccess: () => { setAdding(false); setAmount(""); setCounterparty(""); setDescription(""); } });
    }}>
      <div className="flex items-center justify-between"><div><h2 className="font-semibold">Yeni hareket</h2><p className="text-xs text-muted-foreground">{activeAccount ? `${activeAccount.bank_name} · ${activeAccount.account_name}` : "Kişisel manuel kayıt hesabı"} için eklenir.</p></div><Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Kapat</Button></div>
      <div className="grid grid-cols-2 gap-2"><Button type="button" variant={direction === "incoming" ? "default" : "secondary"} onClick={() => setDirection("incoming")}><ArrowDownLeft/>Gelen para</Button><Button type="button" variant={direction === "outgoing" ? "default" : "secondary"} onClick={() => setDirection("outgoing")}><ArrowUpRight/>Çıkan para</Button></div>
      <div className="space-y-2"><Label htmlFor="bank-amount">Tutar (TL)</Label><Input id="bank-amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="bank-date">İşlem tarihi</Label><Input id="bank-date" required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="bank-counterparty">{direction === "incoming" ? "Kimden geldi?" : "Kime gönderildi?"}</Label><Input id="bank-counterparty" maxLength={120} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="bank-description">Açıklama</Label><Input id="bank-description" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <Button type="submit" disabled={add.isPending}>Kaydet</Button>
    </form>}
    {records.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Hareketler yüklenemedi. Bağlantını kontrol edip yeniden dene.</p>}
    <div className="space-y-3"><div className="flex items-center justify-between px-1"><div><h2 className="font-semibold">İşlemler</h2><p className="text-xs text-muted-foreground">{rows.length} kayıt · {monthLabel}</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{displayedRows.length} gösteriliyor</span></div>
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input aria-label="Hareketlerde ara" placeholder="Kişi veya açıklamada ara" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-xl pl-9"/></div>
    {displayedRows.map((row) => <article key={row.id} className="flex items-start justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex min-w-0 gap-3"><div className={"mt-0.5 rounded-xl p-2 " + (row.direction === "incoming" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600")}>{row.direction === "incoming" ? <ArrowDownLeft className="size-4"/> : <ArrowUpRight className="size-4"/>}</div><div className="min-w-0"><p className="truncate font-medium">{row.counterparty || (row.source === "open_banking" ? "Karşı taraf banka verisinde yok" : row.direction === "incoming" ? "Gelen para" : "Çıkan para")}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(row.date)} · {row.direction === "incoming" ? "Kimden" : "Kime"}{row.status && row.status !== "completed" ? ` · ${row.status}` : ""}{row.source === "open_banking" ? " · Bankadan eşitlendi" : ""}</p>{row.description && <p className="mt-2 break-words text-sm text-muted-foreground">{row.description}</p>}{row.reference && <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">Ref: {row.reference}</p>}</div></div>
      <div className="flex shrink-0 items-start gap-1"><span className={"num pt-1 text-right text-sm font-semibold " + (row.direction === "incoming" ? "text-emerald-600" : "text-rose-600")}>{row.direction === "incoming" ? "+" : "−"}{formatTL(row.amount)}</span><Button variant="ghost" size="icon" aria-label="SAHA hareket belgesini indir" title="SAHA belgesi (resmi banka dekontu değildir)" onClick={() => void downloadSahaReceipt(row)}><FileDown className="size-4"/></Button><Button variant="ghost" size="icon" aria-label="Hareketi kalıcı sil" title="Kalıcı sil" disabled={remove.isPending} onClick={() => remove.mutate(row.id)}><Trash2 className="size-4"/></Button></div>
    </article>)}
    {!displayedRows.length && !records.isLoading && !records.error && (rows.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aramanla eşleşen hareket yok.</p> : <div className="rounded-2xl border border-dashed bg-card/60 px-5 py-10 text-center"><div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><WalletCards className="size-6"/></div><p className="mt-3 font-semibold">Bu ay için hareket yok</p><p className="mt-1 text-sm text-muted-foreground">İlk gelen veya çıkan para kaydını ekleyebilirsin.</p><Button className="mt-4" variant="secondary" onClick={() => setAdding(true)}><Plus/>Hareket ekle</Button></div>)}
    </div>
  </div>;
}

function Summary({ label, amount, tone }: { label: string; amount: number; tone: string }) {
  return <div className="min-w-0 rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={"num mt-1 truncate text-sm font-semibold " + tone}>{formatTL(amount)}</p></div>;
}
