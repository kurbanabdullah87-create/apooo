import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Download, FileDown, FileText, LockKeyhole, Plus, Search, ShieldCheck, Sparkles, Trash2, WalletCards, KeyRound, MessageSquareText, Mail, Paperclip, RefreshCw, Fingerprint, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatTL, monthKey, todayISO } from "@/lib/finance";
import { pageHead } from "@/lib/work";
import { countPotentialBankMovementDuplicates, createEncryptedBankBackup, deleteLegacyBankDocuments, getBankDocumentFile, importBankStatementFile, importEmailBankMovements, inspectEncryptedBankBackup, migrateLegacyBankData, restoreEncryptedBankBackup, useAddBankMovement, useBankAccounts, useBankDocuments, useBankMovements, useBankOwnerId, useBankVault, useDeleteBankMovement, type BankDirection } from "@/lib/bank";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { parseBankSms } from "@/lib/bank-sms";
import { isSupportedBankStatement, parseBankStatement, parseBankStatementFile, type ImportedBankMovement } from "@/lib/bank-statement";
import { scanBankEmails } from "@/lib/gmail-bank";

export const Route = createFileRoute("/_authenticated/banka")({
  head: () => pageHead("Banka hareketleri", "Kişisel hesap hareketleri ve aylık harcama özeti."),
  component: Bank,
});

function classifyBankMovement(row: { type?: string; description?: string; transaction_reason?: string; counterparty?: string }) {
  const source = `${row.type ?? ""} ${row.transaction_reason ?? ""} ${row.description ?? ""} ${row.counterparty ?? ""}`.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").toLocaleLowerCase("tr-TR");
  if (/market|supermarket|grocery|bim|a101|migros|sok market|carrefour|file market/.test(source)) return "Market alışverişi";
  if (/eft|fast|havale|iban|para transfer|virman|swift/.test(source)) return "Para transferi";
  if (/fatura|elektrik|dogalgaz|su fatur|internet|telekom|gsm odeme|vergi odeme/.test(source)) return "Fatura / kamu ödemesi";
  if (/atm|nakit cek|para cek|cash withdrawal/.test(source)) return "ATM / nakit çekim";
  if (/akaryakit|benzin|petrol|fuel|opet|shell|bp istasyon/.test(source)) return "Akaryakıt";
  if (/pos|kart harcama|kartli odeme|purchase|alisveris/.test(source)) return "Kart alışverişi";
  return "Diğer / açıklama yetersiz";
}

function Bank() {
  const ownerId = useBankOwnerId();
  const vault = useBankVault(ownerId);
  const queryClient = useQueryClient();
  const accounts = useBankAccounts(ownerId, vault.unlocked);
  const [requestedAccountId, setRequestedAccountId] = useState("");
  const activeAccount = accounts.data?.find((account) => account.id === requestedAccountId) ?? accounts.data?.[0] ?? null;
  const records = useBankMovements(ownerId, activeAccount?.id, vault.unlocked);
  const bankDocuments = useBankDocuments(ownerId, vault.unlocked);
  const add = useAddBankMovement(ownerId, activeAccount?.id);
  const remove = useDeleteBankMovement(ownerId);
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [adding, setAdding] = useState(false);
  const [direction, setDirection] = useState<BankDirection>("outgoing");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  const [counterparty, setCounterparty] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [vaultPassphrase, setVaultPassphrase] = useState("");
  const [vaultConfirm, setVaultConfirm] = useState("");
  const [rememberVault, setRememberVault] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [showVaultPassword, setShowVaultPassword] = useState(false);
  const [biometricSetupOpen, setBiometricSetupOpen] = useState(false);
  const [biometricPassphrase, setBiometricPassphrase] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupPreview, setBackupPreview] = useState<Awaited<ReturnType<typeof inspectEncryptedBankBackup>> | null>(null);
  const [smsImportOpen, setSmsImportOpen] = useState(false);
  const [smsText, setSmsText] = useState("");
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [statementRows, setStatementRows] = useState<ImportedBankMovement[]>([]);
  const [statementError, setStatementError] = useState("");
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [gmailConsent, setGmailConsent] = useState(false);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailRows, setGmailRows] = useState<ImportedBankMovement[]>([]);
  const [gmailScannedCount, setGmailScannedCount] = useState(0);
  const statementInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!vault.unlocked) {
      queryClient.removeQueries({ queryKey: ["bank-accounts"] });
      queryClient.removeQueries({ queryKey: ["bank-movements"] });
      queryClient.removeQueries({ queryKey: ["bank-documents"] });
      setStatementRows([]);
      setStatementFile(null);
      setGmailRows([]);
      setGmailScannedCount(0);
      setSelectedMovementId(null);
      setSmsText("");
      setAdding(false);
      setCounterparty("");
      setDescription("");
      setAmount("");
      setVaultPassphrase("");
      setVaultConfirm("");
      setBiometricPassphrase("");
      setBiometricSetupOpen(false);
      setBackupFile(null);
      setBackupPassphrase("");
      setBackupPreview(null);
    }
  }, [vault.unlocked, ownerId, queryClient]);

  const rows = useMemo(() => (records.data ?? []).filter((r) => month === "all" || monthKey(r.date) === month), [records.data, month]);
  const displayedRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return query ? rows.filter((row) => `${row.counterparty} ${row.description} ${row.transaction_reason ?? ""} ${row.counterparty_iban ?? ""} ${row.reference ?? ""}`.toLocaleLowerCase("tr-TR").includes(query)) : rows;
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
  const statementDuplicateCandidates = useMemo(() => activeAccount ? countPotentialBankMovementDuplicates(records.data ?? [], statementRows, activeAccount.id) : 0, [activeAccount, records.data, statementRows]);
  const gmailDuplicateCandidates = useMemo(() => activeAccount ? countPotentialBankMovementDuplicates(records.data ?? [], gmailRows, activeAccount.id) : 0, [activeAccount, records.data, gmailRows]);
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
        title: `YEVMİYE VE FİNANS hesap özeti — ${monthLabel}`,
        subject: "Hesap hareketleri ve aylık finans özeti",
        author: "YEVMİYE VE FİNANS",
        creator: "YEVMİYE VE FİNANS",
        keywords: "hesap hareketi, aylık özet, YEVMİYE VE FİNANS",
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
        doc.text("YEVMİYE VE FİNANS  ·  Bu cihazdaki şifreli kasadan oluşturuldu", margin, 290);
        doc.text(`Oluşturulma: ${generatedAt}`, pageWidth / 2, 290, { align: "center" });
        doc.text(`${page} / ${totalPages}`, pageWidth - margin, 290, { align: "right" });
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
      doc.text("YF", margin + 6.5, 21.5, { align: "center" });
      doc.setFontSize(9);
      doc.text("YEVMİYE VE FİNANS  /  HESAP RAPORU", margin + 18, 18);
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
        doc.setFillColor(card.fill[0], card.fill[1], card.fill[2]);
        doc.roundedRect(x, 81, cardWidth, 27, 3, 3, "F");
        doc.setFont("Saha", "bold");
        doc.setFontSize(7);
        doc.setTextColor(card.tone[0], card.tone[1], card.tone[2]);
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
        doc.setTextColor(metric.color[0], metric.color[1], metric.color[2]);
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
          const recipientFirstLine = recipientLines[0] ?? name;
          const recipientLabel = recipientLines.length > 1 ? `${recipientFirstLine.slice(0, -1)}…` : recipientFirstLine;
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

      const categoryTotals = new Map<string, { amount: number; count: number }>();
      for (const row of outgoingRows) {
        const category = classifyBankMovement(row);
        const current = categoryTotals.get(category) ?? { amount: 0, count: 0 };
        current.amount += row.amount;
        current.count += 1;
        categoryTotals.set(category, current);
      }
      const categoryY = 231;
      doc.setFont("Saha", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...ink);
      doc.text("Harcama türü dağılımı", margin, categoryY);
      doc.setFont("Saha", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...muted);
      doc.text("Açıklama ve alıcı adına göre tahmini sınıflandırma; banka kategorisi değildir.", margin, categoryY + 5);
      const categoryRows = [...categoryTotals.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 6);
      categoryRows.forEach(([category, value], index) => {
        const lineY = categoryY + 13 + index * 6.5;
        doc.setFont("Saha", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...ink);
        doc.text(`${category} · ${value.count} işlem`, margin, lineY);
        doc.setFont("Saha", "bold");
        doc.text(formatTL(value.amount), pageWidth - margin, lineY, { align: "right" });
      });

      // Analytics page: date trend, parties, categories and data provenance.
      doc.addPage();
      doc.setFillColor(...ink);
      doc.rect(0, 0, pageWidth, 43, "F");
      doc.setFillColor(16, 185, 129);
      doc.rect(0, 41, pageWidth, 2, "F");
      doc.setFont("Saha", "bold");
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text("Dönem analizi", margin, 19);
      doc.setFont("Saha", "normal");
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text(`${monthLabel} · seçili hesaptaki kayıtların ayrıntılı kırılımı`, margin, 28);

      const knownDescriptions = rows.filter((row) => row.description.trim() || row.transaction_reason?.trim()).length;
      const knownBalances = rows.filter((row) => typeof row.balance_after === "number" && Number.isFinite(row.balance_after)).length;
      const knownReferences = rows.filter((row) => row.reference?.trim()).length;
      const sourceCounts = new Map<string, number>();
      for (const row of rows) {
        const label = row.source === "open_banking" ? "Banka bağlantısı" : row.source === "email_attachment" ? "E-posta ekstresi" : row.source === "email_auto" ? "Gmail taraması" : "Elle kayıt";
        sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + 1);
      }
      const detailMetrics = [
        { label: "AÇIKLAMASI BULUNAN", value: `${knownDescriptions} / ${rows.length}` },
        { label: "REFERANSI BULUNAN", value: `${knownReferences} / ${rows.length}` },
        { label: "BAKİYESİ BULUNAN", value: `${knownBalances} / ${rows.length}` },
        { label: "KAYIT KAYNAĞI", value: `${sourceCounts.size} farklı kaynak` },
      ];
      const detailMetricY = 51;
      const detailMetricWidth = contentWidth / detailMetrics.length;
      detailMetrics.forEach((metric, index) => {
        const x = margin + index * detailMetricWidth;
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(x + 1, detailMetricY, detailMetricWidth - 3, 20, 2.5, 2.5, "F");
        doc.setFont("Saha", "bold");
        doc.setFontSize(6);
        doc.setTextColor(...muted);
        doc.text(metric.label, x + 4, detailMetricY + 7);
        doc.setFontSize(8.5);
        doc.setTextColor(...ink);
        doc.text(metric.value, x + 4, detailMetricY + 15);
      });

      const trendGroups = new Map<string, { incoming: number; outgoing: number }>();
      for (const row of rows) {
        const period = month === "all" ? monthKey(row.date) : row.date.slice(0, 10);
        const group = trendGroups.get(period) ?? { incoming: 0, outgoing: 0 };
        group[row.direction] += row.amount;
        trendGroups.set(period, group);
      }
      const trend = [...trendGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6);
      const trendTop = 91;
      doc.setFont("Saha", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...ink);
      doc.text(month === "all" ? "Son dönemlere göre para akışı" : "Günlere göre para akışı", margin, 83);
      doc.setFont("Saha", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...muted);
      doc.text("Yeşil: gelen · Kırmızı: çıkan · Grafik seçili aralıkta kayıt bulunan en fazla 6 dönemi gösterir.", margin, 88);
      const chartBottom = 128;
      const chartHeight = 30;
      const chartGap = 7;
      const chartSlot = (contentWidth - chartGap * (trend.length - 1)) / Math.max(trend.length, 1);
      const chartMax = Math.max(1, ...trend.flatMap(([, value]) => [value.incoming, value.outgoing]));
      doc.setDrawColor(...line);
      doc.line(margin, chartBottom, pageWidth - margin, chartBottom);
      trend.forEach(([period, value], index) => {
        const center = margin + index * (chartSlot + chartGap) + chartSlot / 2;
        const barWidth = Math.min(9, chartSlot * 0.28);
        const inHeight = chartHeight * value.incoming / chartMax;
        const outHeight = chartHeight * value.outgoing / chartMax;
        if (inHeight > 0) {
          doc.setFillColor(16, 185, 129);
          doc.roundedRect(center - barWidth - 1, chartBottom - inHeight, barWidth, inHeight, 1.2, 1.2, "F");
        }
        if (outHeight > 0) {
          doc.setFillColor(244, 63, 94);
          doc.roundedRect(center + 1, chartBottom - outHeight, barWidth, outHeight, 1.2, 1.2, "F");
        }
        const labelDate = new Date(`${period}${month === "all" ? "-01" : ""}T00:00:00`);
        const label = Number.isNaN(labelDate.getTime()) ? period : month === "all"
          ? labelDate.toLocaleDateString("tr-TR", { month: "short", year: "2-digit" })
          : labelDate.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
        doc.setFont("Saha", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...muted);
        doc.text(label, center, chartBottom + 7, { align: "center" });
      });
      if (!trend.length) {
        doc.setFont("Saha", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text("Grafik için kayıtlı hareket bulunmuyor.", margin, 108);
      }

      const drawPartyList = (title: string, entries: Array<[string, number]>, x: number, y: number, width: number, tone: readonly [number, number, number]) => {
        doc.setFont("Saha", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...ink);
        doc.text(title, x, y);
        if (!entries.length) {
          doc.setFont("Saha", "normal");
          doc.setFontSize(7);
          doc.setTextColor(...muted);
          doc.text("Bu aralıkta kayıt yok.", x, y + 9);
          return;
        }
        const max = Math.max(...entries.map(([, total]) => total), 1);
        entries.slice(0, 5).forEach(([name, total], index) => {
          const rowY = y + 9 + index * 7;
          doc.setFont("Saha", "normal");
          doc.setFontSize(7);
          doc.setTextColor(...ink);
          const safeName = (doc.splitTextToSize(name || "Belirtilmemiş", width - 25) as string[])[0] ?? "Belirtilmemiş";
          doc.text(safeName, x, rowY);
          doc.setFillColor(226, 232, 240);
          doc.roundedRect(x, rowY + 1.5, width - 25, 2, 1, 1, "F");
          doc.setFillColor(tone[0], tone[1], tone[2]);
          doc.roundedRect(x, rowY + 1.5, Math.max(1, (width - 25) * total / max), 2, 1, 1, "F");
          doc.setFont("Saha", "bold");
          doc.setTextColor(...ink);
          doc.text(formatTL(total), x + width, rowY, { align: "right" });
        });
      };
      const incomingParties = new Map<string, number>();
      for (const row of incomingRows) {
        const name = row.counterparty.trim() || "Gönderen belirtilmemiş";
        incomingParties.set(name, (incomingParties.get(name) ?? 0) + row.amount);
      }
      const splitGap = 12;
      const splitWidth = (contentWidth - splitGap) / 2;
      drawPartyList("En yüksek alıcılar", topRecipients, margin, 151, splitWidth - 8, [99, 102, 241]);
      drawPartyList("En yüksek gönderenler", [...incomingParties].sort((a, b) => b[1] - a[1]).slice(0, 5), margin + splitWidth + splitGap, 151, splitWidth - 8, [16, 185, 129]);

      doc.setFont("Saha", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...ink);
      doc.text("Harcama türü ve kayıt kaynağı", margin, 204);
      const sortedCategories = [...categoryTotals.entries()].sort((a, b) => b[1].amount - a[1].amount);
      const categoryLimit = Math.min(6, sortedCategories.length);
      sortedCategories.slice(0, categoryLimit).forEach(([category, value], index) => {
        const rowY = 213 + index * 7;
        doc.setFont("Saha", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...ink);
        doc.text(`${category} · ${value.count} işlem`, margin, rowY);
        doc.setFont("Saha", "bold");
        doc.text(formatTL(value.amount), pageWidth - margin, rowY, { align: "right" });
      });
      const sourceSummary = [...sourceCounts].map(([label, count]) => `${label}: ${count}`).join("  ·  ") || "Kayıt kaynağı bilgisi yok";
      doc.setFont("Saha", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...muted);
      doc.text(doc.splitTextToSize(`Kaynak dağılımı: ${sourceSummary}`, contentWidth), margin, 261);
      doc.text("Kategori eşleştirmesi açıklama ve taraf adına dayalı tahmindir. Eksik alanlar tamamlanmış veya banka tarafından doğrulanmış sayılmaz.", margin, 270);

      // Full-width transaction cards replace the cramped multi-column table.
      // Text height is measured first and long records flow to continuation cards.
      const drawLedgerPage = (continued = false) => {
        doc.addPage();
        doc.setFillColor(...ink);
        doc.rect(0, 0, pageWidth, 32, "F");
        doc.setFillColor(16, 185, 129);
        doc.rect(0, 30, pageWidth, 2, "F");
        doc.setFont("Saha", "bold");
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        doc.text(continued ? "İşlem dökümü · devam" : "İşlem dökümü", margin, 15);
        doc.setFont("Saha", "normal");
        doc.setFontSize(7);
        doc.setTextColor(203, 213, 225);
        doc.text(`${monthLabel} · ${rows.length} hareket · Gelen ${formatTL(incoming)} · Çıkan ${formatTL(outgoing)}`, margin, 24);
        return 40;
      };
      let y = drawLedgerPage();
      const orderedRows = [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
      if (!orderedRows.length) {
        doc.setFont("Saha", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...muted);
        doc.text(month === "all" ? "Kayıtlı hesap hareketi bulunmuyor." : "Seçilen ayda kayıtlı hesap hareketi bulunmuyor.", margin + 2, y + 8);
      }
      const ledgerLineHeight = 3.8;
      const detailWidth = contentWidth - 10;
      for (const row of orderedRows) {
        const isIncoming = row.direction === "incoming";
        const accent = isIncoming ? [5, 150, 105] as const : [225, 29, 72] as const;
        const dateValue = new Date(row.date);
        const dateLabel = Number.isNaN(dateValue.getTime()) ? row.date : dateValue.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
        const timeLabel = row.date.length > 10 && !Number.isNaN(dateValue.getTime()) ? dateValue.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "Saat belirtilmemiş";
        const counterparty = row.counterparty.trim() || (row.source === "open_banking" ? "Karşı taraf banka verisinde yok" : "Taraf belirtilmedi");
        doc.setFont("Saha", "bold");
        doc.setFontSize(9);
        const counterpartyLines = doc.splitTextToSize(counterparty, detailWidth) as string[];
        const sourceText = row.source === "open_banking" ? "Banka bağlantısı" : row.source === "email_attachment" ? "E-posta ekstresi dosyasından aktarıldı" : row.source === "email_auto" ? "Gmail işlem bildiriminden aktarıldı" : "Elle kayıt";
        const detailFields: Array<[string, string]> = [
          ["Açıklama", row.description.trim() || "Belirtilmemiş"],
          ["İşlem nedeni", row.transaction_reason?.trim() || "Belirtilmemiş"],
          ["İşlem türü", row.type?.trim() || "Belirtilmemiş"],
          ["Durum", row.status?.trim() || "Belirtilmemiş"],
          ["Banka", row.bank_name?.trim() || activeAccount?.bank_name || "Belirtilmemiş"],
          ["Karşı taraf IBAN", row.counterparty_iban?.trim() || "Kayıtta yok"],
          ["Referans / dekont no", row.reference?.trim() || "Kayıtta yok"],
          ["İşlem sonrası bakiye", typeof row.balance_after === "number" && Number.isFinite(row.balance_after) ? formatTL(row.balance_after) : "Kayıtta yok"],
          ["Kayıt kaynağı", sourceText],
        ];
        if (row.raw_source_snippet?.trim()) detailFields.push(["Kaynak e-posta konusu / gönderen", row.raw_source_snippet.trim()]);
        const detailLines = detailFields.flatMap(([label, value]) => {
          doc.setFont("Saha", "normal");
          doc.setFontSize(7.2);
          return (doc.splitTextToSize(`${label}: ${value}`, detailWidth) as string[]).map((text) => ({ text, bold: false }));
        });
        const contentLines = [...counterpartyLines.map((text) => ({ text, bold: true })), ...detailLines];
        const cardHeaderHeight = 10;
        const cardPadding = 7;
        const maxCardHeight = pageHeight - 23 - 43;
        const maxLinesPerCard = Math.max(1, Math.floor((maxCardHeight - cardHeaderHeight - cardPadding) / ledgerLineHeight));
        const chunks: Array<typeof contentLines> = [];
        for (let offset = 0; offset < contentLines.length; offset += maxLinesPerCard) chunks.push(contentLines.slice(offset, offset + maxLinesPerCard));
        if (!chunks.length) chunks.push([]);
        for (const [chunkIndex, chunk] of chunks.entries()) {
          const cardHeight = cardHeaderHeight + chunk.length * ledgerLineHeight + cardPadding;
          if (y + cardHeight > pageHeight - 18) y = drawLedgerPage(true);
          doc.setFillColor(250, 251, 253);
          doc.roundedRect(margin, y, contentWidth, cardHeight, 2.5, 2.5, "F");
          doc.setFillColor(accent[0], accent[1], accent[2]);
          doc.roundedRect(margin, y, 1.5, cardHeight, 0.75, 0.75, "F");
          if (chunkIndex === 0) {
            doc.setFont("Saha", "bold");
            doc.setFontSize(6.8);
            doc.setTextColor(...muted);
            doc.text(dateLabel, margin + 5, y + 4.4);
            doc.setFont("Saha", "normal");
            doc.setFontSize(6.3);
            doc.text(timeLabel, margin + 5, y + 8.3);
            doc.setFont("Saha", "bold");
            doc.setFontSize(8.5);
            doc.setTextColor(accent[0], accent[1], accent[2]);
            doc.text(`${isIncoming ? "GELEN  +" : "GİDEN  −"}${formatTL(row.amount)}`, pageWidth - margin - 5, y + 6.2, { align: "right" });
          } else {
            doc.setFont("Saha", "bold");
            doc.setFontSize(7);
            doc.setTextColor(...muted);
            doc.text(`${dateLabel} · ${timeLabel} · işlem ayrıntısı (devam)`, margin + 5, y + 6.2);
          }
          chunk.forEach((line, lineIndex) => {
            doc.setFont("Saha", line.bold ? "bold" : "normal");
            doc.setFontSize(line.bold ? 8 : 7.2);
            if (line.bold) doc.setTextColor(...ink);
            else doc.setTextColor(...muted);
            doc.text(line.text, margin + 5, y + cardHeaderHeight + lineIndex * ledgerLineHeight);
          });
          y += cardHeight + 3;
        }
      }
      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        drawFooter(page, pages);
      }
      doc.save(`yevmiye-finans-hesap-ozeti-${month === "all" ? "tum-zamanlar" : month}.pdf`);
      toast.success("PDF bu cihazda oluşturuldu ve indirildi; sunucuya kaydedilmedi.");
    } catch {
      toast.error("PDF raporu oluşturulamadı");
    }
  }

  function downloadAccountingCsv() {
    if (!rows.length) { toast.error("Dışa aktarılacak hareket bulunamadı."); return; }
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const header = ["Tarih", "Saat", "Hesap", "Yön", "Kategori", "Karşı taraf", "Açıklama", "Tutar", "Para birimi", "Referans"];
    const lines = rows.map((row) => {
      const stamp = new Date(row.date);
      return [
        Number.isNaN(stamp.getTime()) ? row.date.slice(0, 10) : stamp.toLocaleDateString("sv-SE"),
        Number.isNaN(stamp.getTime()) ? "" : stamp.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        activeAccount?.account_name ?? "",
        row.direction === "incoming" ? "Gelen" : "Giden",
        classifyBankMovement(row), row.counterparty, row.description,
        Number(row.amount).toFixed(2), activeAccount?.currency ?? "TRY", row.reference ?? "",
      ].map(escape).join(";");
    });
    const blob = new Blob(["\uFEFF", [header.map(escape).join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `yevmiye-finans-muhasebe-aktarimi-${month === "all" ? "tum-zamanlar" : month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} hareket muhasebe CSV dosyası olarak indirildi.`);
  }

  async function downloadSahaReceipt(row: (typeof rows)[number]) {
    if (!ownerId || !activeAccount) { toast.error("Belge oluşturmak için hesap seçilmeli"); return; }
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
      doc.setProperties({ title: `YEVMİYE VE FİNANS hareket özeti — ${row.date}`, author: "YEVMİYE VE FİNANS", creator: "YEVMİYE VE FİNANS" });
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
      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.rect(0, 52, pageWidth, 3, "F");
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, 12, 11, 11, 3, 3, "F");
      doc.setFont("Saha", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("YF", margin + 5.5, 19.4, { align: "center" });
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text("YEVMİYE VE FİNANS  /  HESAP HAREKETLERİ", margin + 16, 19);
      doc.setFontSize(17);
      doc.setTextColor(255, 255, 255);
      doc.text("Hareket özeti", margin, 37);
      doc.setFont("Saha", "normal");
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text(formatDate(row.date), pageWidth - margin, 37, { align: "right" });

      const cardFill = positive ? [236, 253, 245] : [255, 241, 242];
      doc.setFillColor(cardFill[0]!, cardFill[1]!, cardFill[2]!);
      doc.roundedRect(margin, 64, contentWidth, 34, 4, 4, "F");
      doc.setFont("Saha", "bold");
      doc.setFontSize(7);
      doc.setTextColor(accent[0], accent[1], accent[2]);
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
          doc.text("YEVMİYE VE FİNANS  /  HAREKET ÖZETİ · DEVAM", margin, 12);
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
      drawField("Kayıt kaynağı", row.source === "open_banking" ? "Banka bağlantısından eşitlendi" : row.source === "email_attachment" ? "E-posta ekstresi dosyasından içe aktarıldı" : "Kullanıcı tarafından elle girildi");

      doc.setDrawColor(...line);
      doc.line(margin, 190, pageWidth - margin, 190);
      doc.setFont("Saha", "bold");
      doc.setFontSize(7);
      doc.setTextColor(185, 28, 28);
      doc.text("YEVMİYE VE FİNANS KAYDI  ·  RESMİ BANKA DEKONTU DEĞİLDİR", margin, 197);
      doc.setFont("Saha", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...muted);
      doc.text("Bu belge, bu cihazdaki şifreli kasada bulunan hareket bilgilerini özetler.", margin, 202);
      const filename = `yevmiye-finans-hareket-${row.date.replace(/[^0-9-]/g, "-")}-${row.id.slice(0, 8)}.pdf`;
      doc.save(filename);
      toast.success("YEVMİYE VE FİNANS hareket belgesi bu cihazda oluşturuldu; sunucuya kaydedilmedi.");
    } catch {
      toast.error("Hareket belgesi oluşturulamadı veya saklanamadı");
    }
  }

  async function submitVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVaultBusy(true);
    try {
      const isNewVault = !vault.exists;
      if (!vault.exists) {
        if (vaultPassphrase !== vaultConfirm) throw new Error("Kasa parolaları eşleşmiyor.");
        await vault.create(vaultPassphrase);
      } else {
        await vault.unlock(vaultPassphrase);
      }
      let biometricEnabled = vault.biometricReady;
      if (rememberVault && !biometricEnabled) {
        try {
          await vault.enableBiometric(vaultPassphrase);
          biometricEnabled = true;
        } catch (error) {
          toast.error(error instanceof Error ? `Kasa açıldı; biyometrik hatırlama kurulamadı: ${error.message}` : "Kasa açıldı; biyometrik hatırlama bu cihazda kurulamadı.");
        }
      }
      if (biometricEnabled && rememberVault) toast.success("Kasa açıldı. Bu cihazda bir sonraki girişte biyometri kullanabilirsin.");
      else if (isNewVault) toast.success("Bu cihazda şifreli kişisel kasa oluşturuldu.");
      else toast.success("Şifreli kişisel kasa açıldı.");
      setVaultPassphrase("");
      setVaultConfirm("");
      setRememberVault(false);
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

  async function downloadEncryptedBackup() {
    if (!ownerId) return;
    try {
      const blob = await createEncryptedBankBackup(ownerId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `yevmiye-finans-banka-kasa-yedegi-${todayISO()}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("Şifreli kasa yedeği indirildi. Açma parolası yedek dosyasına eklenmedi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Şifreli yedek hazırlanamadı.");
    }
  }

  async function previewEncryptedBackup() {
    if (!ownerId || !backupFile || !backupPassphrase) return;
    setVaultBusy(true);
    try {
      const preview = await inspectEncryptedBankBackup(ownerId, backupFile, backupPassphrase);
      setBackupPreview(preview);
      toast.success("Yedek parolası ve şifreli içerik doğrulandı.");
    } catch (error) {
      setBackupPreview(null);
      toast.error(error instanceof Error ? error.message : "Yedek doğrulanamadı.");
    } finally { setVaultBusy(false); }
  }

  async function restoreEncryptedBackup() {
    if (!ownerId || !backupPreview) return;
    const current = { accounts: accounts.data?.length ?? 0, movements: records.data?.length ?? 0, documents: bankDocuments.data?.length ?? 0 };
    const incoming = backupPreview.counts;
    const confirmed = window.confirm(`Mevcut kasadaki ${current.accounts} hesap, ${current.movements} hareket ve ${current.documents} belge yedek içeriğiyle değiştirilecek. Yedekte ${incoming.accounts} hesap, ${incoming.movements} hareket ve ${incoming.documents} belge var. Bu işlem geri alınamaz. Devam edilsin mi?`);
    if (!confirmed) return;
    setVaultBusy(true);
    try {
      await restoreEncryptedBankBackup(ownerId, backupPreview.backup, backupPassphrase);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bank-accounts", ownerId] }),
        queryClient.invalidateQueries({ queryKey: ["bank-movements", ownerId] }),
        queryClient.invalidateQueries({ queryKey: ["bank-documents", ownerId] }),
      ]);
      setBackupFile(null);
      setBackupPassphrase("");
      setBackupPreview(null);
      toast.success("Şifreli kasa yedeği geri yüklendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Yedek geri yüklenemedi.");
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

  async function inspectStatement(file?: File) {
    setStatementFile(null);
    setStatementRows([]);
    setStatementError("");
    if (!file) return;
    if (!isSupportedBankStatement(file.name)) {
      setStatementError("Şimdilik CSV, TSV, OFX, QIF veya TXT ekstre dosyaları destekleniyor. Banka uygulamasından bu biçimlerden biriyle dışa aktar.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setStatementError("Ekstre dosyası en fazla 8 MB olabilir.");
      return;
    }
    try {
      let parsed: ImportedBankMovement[];
      if (/\.pdf$/i.test(file.name)) parsed = await parseBankStatementFile(file);
      else {
        let text = await file.text();
        if (text.includes("\uFFFD")) text = new TextDecoder("windows-1254").decode(await file.arrayBuffer());
        parsed = parseBankStatement(file.name, text);
      }
      if (parsed.length === 0) {
        setStatementError("Dosyada tanınan işlem satırı bulunamadı. CSV dosyasında tarih, tutar ve açıklama sütunları olmalı; dosya değişmeden kalır.");
        return;
      }
      setStatementFile(file);
      setStatementRows(parsed);
    } catch {
      setStatementError("Dosya okunamadı. Ekstreyi bankadan tekrar indirip yeniden seç.");
    }
  }

  async function saveStatementImport() {
    if (!ownerId || !activeAccount || !statementFile || !statementRows.length) return;
    const includePossibleDuplicates = statementDuplicateCandidates > 0 && window.confirm(`${statementDuplicateCandidates} satır, aynı hesapta referans numarası olmadığı için mevcut bir hareketle benzer görünüyor. Evet: benzer satırları da içe aktar. Hayır: benzer satırları atla, diğerlerini aktar.`);
    setImportBusy(true);
    try {
      const result = await importBankStatementFile(ownerId, activeAccount.id, statementFile, statementRows, includePossibleDuplicates);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bank-movements", ownerId] }),
        queryClient.invalidateQueries({ queryKey: ["bank-documents", ownerId] }),
      ]);
      toast.success(`${result.importedCount} hareket aktarıldı; ${result.duplicateCount} tekrar kayıt atlandı. Dosyanın şifreli aslı bu cihazda saklandı.`);
      setStatementFile(null);
      setStatementRows([]);
      setStatementError("");
      if (statementInput.current) statementInput.current.value = "";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ekstre aktarılamadı.");
    } finally {
      setImportBusy(false);
    }
  }

  async function scanGmailForMovements() {
    if (!gmailConsent) { toast.error("Önce Gmail erişimi ve cihazda işleme onayını ver."); return; }
    if (!ownerId || !activeAccount) { toast.error("Önce şifreli kasayı açıp aktarım hesabını seç."); return; }
    setGmailBusy(true);
    setGmailRows([]);
    try {
      const result = await scanBankEmails();
      setGmailScannedCount(result.scanned);
      setGmailRows(result.rows);
      if (!result.rows.length) toast.info(`${result.scanned} eşleşen e-posta tarandı; güvenilir biçimde işlem alanı çıkarılamadı. Kayıt eklenmedi.`);
      else toast.success(`${result.rows.length} olası hareket bulundu. Kaydetmeden önce tabloyu kontrol et.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gmail taraması tamamlanamadı.");
    } finally {
      setGmailBusy(false);
    }
  }

  async function saveGmailImport() {
    if (!ownerId || !activeAccount || !gmailRows.length) return;
    const includePossibleDuplicates = gmailDuplicateCandidates > 0 && window.confirm(`${gmailDuplicateCandidates} e-posta hareketi, sabit referans numarası olmadan mevcut kayıtla benzer görünüyor. Evet: benzerleri de ekle. Hayır: benzerleri atla, diğer hareketleri kaydet.`);
    setImportBusy(true);
    try {
      const result = await importEmailBankMovements(ownerId, activeAccount.id, gmailRows, includePossibleDuplicates);
      await queryClient.invalidateQueries({ queryKey: ["bank-movements", ownerId] });
      await queryClient.refetchQueries({ queryKey: ["bank-movements", ownerId, activeAccount.id, true], type: "active" });
      setSearch("");
      setMonth("all");
      toast.success(`${result.importedCount} hareket kaydedildi; tüm zamanlar işlemlerine ve PDF özetine eklendi. ${result.duplicateCount} tekrar veya geçersiz kayıt atlandı.`);
      setGmailRows([]);
      setGmailScannedCount(0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gmail hareketleri kaydedilemedi.");
    } finally {
      setImportBusy(false);
    }
  }

  async function downloadOriginalStatement(documentId: string) {
    try {
      if (!ownerId) return;
      const file = await getBankDocumentFile(ownerId, documentId);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ekstre dosyası açılamadı.");
    }
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
      {vault.exists && vault.biometricReady && !showVaultPassword && <div className="space-y-3 p-6 sm:p-8"><Button type="button" className="h-12 w-full" disabled={vaultBusy} onClick={() => { void vault.unlockBiometric().then(() => toast.success("Kasa biyometri ile açıldı.")).catch((error) => { setShowVaultPassword(true); toast.error(error instanceof Error ? `${error.message} Parolanla devam edebilirsin.` : "Biyometri kullanılamadı. Parolanla devam edebilirsin."); }); }}><Fingerprint/>Face ID / parmak izi ile aç</Button><Button type="button" variant="ghost" className="w-full" onClick={() => setShowVaultPassword(true)}>Parola kullan</Button><p className="text-center text-xs text-muted-foreground">Cihazın kayıtlı yüz tanıma veya parmak izi doğrulamasını kullanır.</p></div>}
      {(!vault.exists || !vault.biometricReady || showVaultPassword) && <form className="space-y-4 p-6 sm:p-8" onSubmit={(event) => void submitVault(event)}>
        <div className="space-y-2"><Label htmlFor="bank-vault-pass">{vault.exists ? "Kasa parolası" : "Yeni kasa parolası"}</Label><Input id="bank-vault-pass" type="password" autoComplete={vault.exists ? "current-password" : "new-password"} minLength={vault.exists ? undefined : 14} required value={vaultPassphrase} onChange={(event) => setVaultPassphrase(event.target.value)} placeholder={vault.exists ? "Parolanı gir" : "En az 14 karakter"}/></div>
        {!vault.exists && <><div className="space-y-2"><Label htmlFor="bank-vault-confirm">Parolayı tekrar gir</Label><Input id="bank-vault-confirm" type="password" autoComplete="new-password" minLength={14} required value={vaultConfirm} onChange={(event) => setVaultConfirm(event.target.value)} placeholder="Aynı parolayı tekrar yaz"/></div><p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-muted-foreground">Parolayı unutursan kasayı kurtarmak mümkün olmaz. Güvenli bir parola yöneticisinde sakla. Bu kasa bu tarayıcıya ve cihaza özeldir; cihazlar arası senkronize edilmez.</p></>}
        {!vault.biometricReady ? <label htmlFor="bank-vault-remember" className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/30 p-3"><input id="bank-vault-remember" type="checkbox" checked={rememberVault} onChange={(event) => setRememberVault(event.target.checked)} className="mt-0.5 size-4 accent-primary"/><span><span className="block text-sm font-medium">Beni hatırla</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">Parolan kaydedilmez. Bu cihaz destekliyorsa Face ID, parmak izi veya cihaz PIN’i ile güvenli açma kurulur.</span></span></label> : <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-xs leading-relaxed text-muted-foreground"><Fingerprint className="mr-1 inline size-3.5"/>Bu cihazda biyometrik hatırlama zaten etkin. Parolan burada saklanmaz.</p>}
        <Button className="w-full" type="submit" disabled={vaultBusy}><LockKeyhole/>{vault.exists ? "Kasayı aç" : "Şifreli kasayı oluştur"}</Button>
        {vault.exists && vault.biometricReady && <Button type="button" variant="ghost" className="w-full" onClick={() => setShowVaultPassword(false)}>Biyometrik girişe dön</Button>}
      </form>}
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
      <div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 rounded-lg border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-slate-200">Otomatik kilit<select aria-label="Banka kasası otomatik kilit süresi" className="bg-transparent font-semibold text-white outline-none" value={vault.lockDurationMinutes} onChange={(event) => void vault.setLockDurationMinutes(Number(event.target.value) as 1 | 5 | 10)}><option className="text-black" value={1}>1 dakika</option><option className="text-black" value={5}>5 dakika</option><option className="text-black" value={10}>10 dakika</option></select></label><Button variant="outline" size="sm" disabled={vaultBusy} onClick={() => void migrateLegacy()}><ShieldCheck className="size-4"/>Eski bulut hareketlerini taşı ve sil</Button><Button variant="outline" size="sm" disabled={vaultBusy} onClick={() => void removeCloudPdfs()}><FileText className="size-4"/>Eski bulut PDF’lerini sil</Button>{vault.biometricReady ? <Button variant="outline" size="sm" disabled={vaultBusy} onClick={() => void vault.disableBiometric().then(() => toast.success("Kasa biyometrisi bu cihazdan kaldırıldı."))}><Fingerprint className="size-4"/>Biyometrik açmayı kapat</Button> : <Button variant="outline" size="sm" disabled={vaultBusy} onClick={() => setBiometricSetupOpen(true)}><Fingerprint className="size-4"/>Face ID / parmak izi kur</Button>}<Button variant="secondary" size="sm" onClick={() => { vault.lock(); queryClient.removeQueries({ queryKey: ["bank-accounts", ownerId] }); queryClient.removeQueries({ queryKey: ["bank-movements", ownerId] }); queryClient.removeQueries({ queryKey: ["bank-documents", ownerId] }); }}><LockKeyhole className="size-4"/>Kasayı kilitle</Button></div>
    </section>

    <details className="rounded-2xl border bg-card p-4">
      <summary className="cursor-pointer font-semibold">Şifreli kasayı yedekle veya geri yükle</summary>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border p-3">
          <p className="text-sm font-medium">Bu cihazdan yedek al</p>
          <p className="text-xs leading-relaxed text-muted-foreground">Dosyada yalnızca şifreli kasa verisi bulunur. Parolanı yedekten ayrı ve güvenli sakla; parola dosyaya eklenmez.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void downloadEncryptedBackup()}><Download className="size-4"/>Şifreli yedeği indir</Button>
        </div>
        <div className="space-y-2 rounded-xl border p-3">
          <p className="text-sm font-medium">Şifreli yedekten geri yükle</p>
          <p className="text-xs leading-relaxed text-muted-foreground">Önce dosyayı ve kasanın parolasını doğrula. Mevcut ve yedek kayıt sayıları karşılaştırılmadan üzerine yazılmaz.</p>
          <Input aria-label="Şifreli banka kasası yedek dosyası" type="file" accept=".json,application/json" onChange={(event) => { setBackupFile(event.target.files?.[0] ?? null); setBackupPreview(null); }} />
          <Input aria-label="Yedek kasasının parolası" type="password" autoComplete="current-password" placeholder="Yedek oluşturulurken kullanılan kasa parolası" value={backupPassphrase} onChange={(event) => { setBackupPassphrase(event.target.value); setBackupPreview(null); }} />
          {backupPreview && <p className="rounded-lg bg-muted p-2 text-xs">Yedek: {backupPreview.counts.accounts} hesap · {backupPreview.counts.movements} hareket · {backupPreview.counts.documents} belge<br/>Mevcut: {accounts.data?.length ?? 0} hesap · {records.data?.length ?? 0} hareket · {bankDocuments.data?.length ?? 0} belge</p>}
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={vaultBusy || !backupFile || !backupPassphrase} onClick={() => void previewEncryptedBackup()}>{vaultBusy ? <RefreshCw className="size-4 animate-spin"/> : <ShieldCheck className="size-4"/>}Yedeği doğrula ve önizle</Button>{backupPreview && <Button type="button" size="sm" disabled={vaultBusy} onClick={() => void restoreEncryptedBackup()}><Download className="size-4"/>Yedeği geri yükle</Button>}</div>
        </div>
      </div>
    </details>
    <section className="space-y-4 rounded-3xl border border-primary/20 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3"><div className="rounded-2xl bg-primary/10 p-3 text-primary"><Mail className="size-5"/></div><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wider text-primary">E-posta eki / banka ekstresi</p><h2 className="mt-1 text-lg font-semibold">Ekstre dosyasını içe aktar</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Bankanın e-postayla gönderdiği PDF, CSV, OFX, QIF veya TSV/TXT ekini indirip seç. Okunabilen tarih, saat, yön, tutar, açıklama, taraf ve referans bilgileri çıkarılır; kaydetmeden önce örnek satırları kontrol et.</p></div></div>
      <input ref={statementInput} type="file" accept=".csv,.tsv,.txt,.ofx,.qif,.pdf,text/csv,text/plain,application/x-ofx,application/pdf" className="sr-only" onChange={(event) => void inspectStatement(event.target.files?.[0])}/>
      <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="secondary" onClick={() => statementInput.current?.click()} disabled={importBusy || !activeAccount}><Paperclip className="size-4"/>{statementFile ? "Başka ekstre seç" : "E-postadan indirdiğim dosyayı seç"}</Button>{statementFile && <span className="max-w-full truncate text-xs text-muted-foreground">{statementFile.name} · {(statementFile.size / 1024).toFixed(0)} KB</span>}</div>
      {statementError && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{statementError}</p>}
      {statementFile && <div className="space-y-3 rounded-2xl border bg-background/60 p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{statementRows.length} satır bulundu</p><p className="text-xs text-muted-foreground">PDF tarama görüntüsüyse metin çıkarılamaz. Saat ve karşı taraf dosyada yoksa uygulama bunları tahmin etmez.</p></div><span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-300">Kontrol etmeden kaydetme</span></div>
        <div className="max-h-72 overflow-auto rounded-xl border"><table className="w-full min-w-[620px] text-left text-xs"><thead className="sticky top-0 bg-muted text-muted-foreground"><tr><th className="p-2">Tarih / saat</th><th className="p-2">Yön</th><th className="p-2">Karşı taraf</th><th className="p-2">Açıklama</th><th className="p-2 text-right">Tutar</th></tr></thead><tbody>{statementRows.slice(0, 100).map((row, index) => <tr key={`${row.date}-${index}`} className="border-t"><td className="whitespace-nowrap p-2">{formatDate(row.date)}</td><td className="p-2">{row.direction === "incoming" ? "Gelen" : "Giden"}</td><td className="max-w-40 truncate p-2">{row.counterparty || "Dosyada belirtilmemiş"}</td><td className="max-w-56 truncate p-2">{row.description || "—"}</td><td className="whitespace-nowrap p-2 text-right font-semibold">{formatTL(row.amount)}</td></tr>)}</tbody></table></div>
        {statementRows.length > 100 && <p className="text-xs text-muted-foreground">Önizlemede ilk 100 satır gösteriliyor; {statementRows.length} satırın tamamı aktarılacak.</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => { setStatementFile(null); setStatementRows([]); setStatementError(""); if (statementInput.current) statementInput.current.value = ""; }}>Vazgeç</Button><Button type="button" onClick={() => void saveStatementImport()} disabled={importBusy || statementRows.length === 0}>{importBusy ? <RefreshCw className="size-4 animate-spin"/> : <Download className="size-4"/>}Hareketleri ve dosyayı şifreli kaydet</Button></div></div>}
      {bankDocuments.data?.length ? <div className="space-y-2 border-t pt-3"><p className="text-sm font-semibold">Bu cihazdaki ekstre arşivi</p>{bankDocuments.data.map((document) => <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"><div className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0 text-muted-foreground"/><div className="min-w-0"><p className="truncate text-sm font-medium">{document.file_name}</p><p className="text-[11px] text-muted-foreground">{formatDate(document.imported_at)} · {document.movement_count} yeni hareket</p></div></div><Button type="button" variant="ghost" size="sm" onClick={() => void downloadOriginalStatement(document.id)}><Download className="size-4"/>Dosyayı indir</Button></div>)}</div> : null}
      <p className="text-[11px] leading-relaxed text-muted-foreground">Bu yöntem Gmail’e bağlanmaz: ekstre dosyasını sen seçersin; dosya ve işlemler bu cihazdaki kasaya şifreli kaydedilir, sunucuya yüklenmez.</p>
    </section>
    <section className="space-y-4 rounded-3xl border border-sky-500/20 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3"><div className="rounded-2xl bg-sky-500/10 p-3 text-sky-700 dark:text-sky-300"><Mail className="size-5"/></div><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">İsteğe bağlı Google bağlantısı</p><h2 className="mt-1 text-lg font-semibold">Gmail’deki banka bildirimlerini tara</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Yalnızca sen başlatınca, son 1 yıldaki işlem/harcama/transfer konulu en fazla 100 ileti aranır. E-posta metni ve Google erişim belirteci tarayıcıda geçici işlenir; sunucuya gönderilmez veya kaydedilmez. Bulunan alanlar önce önizlenir; sen kaydedince bu cihazdaki şifreli kasaya eklenir.</p></div></div>
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-3 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Google izninin kapsamı:</strong> `gmail.readonly` teknik olarak Gmail iletilerini okuma yetkisi verir; yalnızca banka iletilerini arama sınırı uygulamanın Gmail sorgusudur, Google izninin kendisi değildir. Bu uygulama e-posta göndermez, değiştirmez veya silmez. Erişimi Google Hesabı → Güvenlik → Üçüncü taraf uygulama bağlantılarından kaldırabilirsin.</div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background/60 p-3 text-sm leading-relaxed"><input type="checkbox" checked={gmailConsent} onChange={(event) => { setGmailConsent(event.target.checked); if (!event.target.checked) { setGmailRows([]); setGmailScannedCount(0); } }} className="mt-1 size-4 shrink-0 accent-primary"/><span><strong>Gmail taramasına açıkça izin veriyorum.</strong> Bu cihazda eşleşen e-posta metinlerinin geçici okunmasını ve yalnızca bulduğum hareket alanlarının, kaydetmem halinde, şifreli kasama eklenmesini kabul ediyorum.</span></label>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">İzin her tarama başlatışında Google penceresinde ayrıca onaylanır. Arka planda veya uygulama kapalıyken tarama yapılmaz.</p><Button type="button" onClick={() => void scanGmailForMovements()} disabled={!gmailConsent || gmailBusy || importBusy || !activeAccount}><Mail className="size-4"/>{gmailBusy ? "Gmail taranıyor…" : "Google ile onayla ve tara"}</Button></div>
      {gmailRows.length > 0 && <div className="space-y-3 rounded-2xl border bg-background/60 p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{gmailRows.length} olası hareket · {gmailScannedCount} ileti incelendi</p><p className="text-xs text-muted-foreground">E-posta biçimleri bankalara göre değişir. Tarih, yön, tutar, alıcı ve açıklamayı kontrol et; hatalıysa kaydetme, elle yeni hareket ekle.</p></div><span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-300">Önizleme · henüz kaydedilmedi</span></div>
        <div className="max-h-72 overflow-auto rounded-xl border"><table className="w-full min-w-[620px] text-left text-xs"><thead className="sticky top-0 bg-muted text-muted-foreground"><tr><th className="p-2">Tarih</th><th className="p-2">Yön</th><th className="p-2">Karşı taraf</th><th className="p-2">Açıklama</th><th className="p-2 text-right">Tutar</th></tr></thead><tbody>{gmailRows.slice(0, 100).map((row, index) => <tr key={`${row.reference}-${index}`} className="border-t"><td className="whitespace-nowrap p-2">{formatDate(row.date)}</td><td className="p-2">{row.direction === "incoming" ? "Gelen" : "Giden"}</td><td className="max-w-40 truncate p-2">{row.counterparty || "E-postada belirtilmemiş"}</td><td className="max-w-56 truncate p-2">{row.description || "—"}</td><td className="whitespace-nowrap p-2 text-right font-semibold">{formatTL(row.amount)}</td></tr>)}</tbody></table></div>
        {gmailRows.length > 100 && <p className="text-xs text-muted-foreground">Önizlemede ilk 100 kayıt gösteriliyor; eşleşenlerin tamamı kaydedilecek.</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => { setGmailRows([]); setGmailScannedCount(0); }}>Vazgeç</Button><Button type="button" onClick={() => void saveGmailImport()} disabled={importBusy || gmailRows.length === 0}>{importBusy ? <RefreshCw className="size-4 animate-spin"/> : <LockKeyhole className="size-4"/>}Kontrol ettim · şifreli kaydet</Button></div>
      </div>}
    </section>
    <section className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-400 via-primary to-indigo-500"/>
      <div className="flex items-start gap-3 pl-1"><div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-700 dark:text-emerald-300"><ShieldCheck className="size-5"/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Hesap sahibi özelinde · salt okunur</p><span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Banka transfer yetkisi yok</span></div><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Banka hesabına bağlanılmaz. Gmail taraması yalnızca sen açıkça izin verip başlattığında yapılır; uygulama kapalıyken çalışmaz. Kaydedilen finansal alanlar bu cihazdaki şifreli kasada kalır.</p></div></div>
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
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSmsImportOpen((value) => !value)} disabled={accounts.isLoading || Boolean(accounts.error)}><MessageSquareText/>SMS’ten aktar</Button><Button variant="outline" onClick={downloadAccountingCsv} disabled={!rows.length || records.isLoading || accounts.isLoading || Boolean(accounts.error)}><Download/>Muhasebe CSV aktar</Button><Button variant="secondary" onClick={() => void downloadReport()} disabled={records.isLoading || accounts.isLoading || Boolean(accounts.error)}><Download/>Detaylı PDF raporunu indir</Button><Button onClick={() => setAdding((value) => !value)} disabled={accounts.isLoading || Boolean(accounts.error)}><Plus/>Hareket ekle</Button></div>
        </div>
      </div>
    </section>
    {smsImportOpen && <section className="space-y-3 rounded-2xl border border-primary/20 bg-card p-4 shadow-sm"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><MessageSquareText className="size-5"/></div><div><h2 className="font-semibold">Banka SMS’inden alan çıkar</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">SMS metnini buraya yapıştır. Metin bu ekranda ayrıştırılır; kaydedilmez ve sunucuya gönderilmez. Bankaların SMS biçimleri farklı olduğundan bulunan alanları kontrol etmen gerekir.</p></div></div><Textarea value={smsText} onChange={(event) => setSmsText(event.target.value.slice(0, 4000))} maxLength={4000} rows={4} autoComplete="off" placeholder="Bankadan gelen işlem SMS’ini buraya yapıştır…"/><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => { setSmsText(""); setSmsImportOpen(false); }}>İptal</Button><Button type="button" onClick={importSmsLocally} disabled={!smsText.trim()}><MessageSquareText/>Alanları çıkar</Button></div><p className="text-xs text-muted-foreground">Web uygulaması gelen SMS kutunu okuyamaz. Bu özellik yalnızca senin buraya yapıştırdığın mesajı cihazda işler; kayıt için ayrıca Kaydet’e basmalısın.</p></section>}
    {adding && <form className="space-y-3 rounded-2xl border bg-card p-4" onSubmit={(event) => {
      event.preventDefault();
      const value = Number(amount.replace(",", "."));
      if (!(value > 0) || !Number.isFinite(value) || value > 99_999_999.99) { toast.error("Geçerli bir tutar girin"); return; }
      if (!date || Number.isNaN(Date.parse(date))) { toast.error("Geçerli bir tarih ve saat seçin"); return; }
      add.mutate({ direction, amount: value, date, counterparty: counterparty.trim().slice(0, 120), description: description.trim().slice(0, 500) }, { onSuccess: () => { setAdding(false); setAmount(""); setCounterparty(""); setDescription(""); } });
    }}>
      <div className="flex items-center justify-between"><div><h2 className="font-semibold">Yeni hareket</h2><p className="text-xs text-muted-foreground">{activeAccount ? `${activeAccount.bank_name} · ${activeAccount.account_name}` : "Kişisel manuel kayıt hesabı"} için eklenir.</p></div><Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Kapat</Button></div>
      <div className="grid grid-cols-2 gap-2"><Button type="button" variant={direction === "incoming" ? "default" : "secondary"} onClick={() => setDirection("incoming")}><ArrowDownLeft/>Gelen para</Button><Button type="button" variant={direction === "outgoing" ? "default" : "secondary"} onClick={() => setDirection("outgoing")}><ArrowUpRight/>Çıkan para</Button></div>
      <div className="space-y-2"><Label htmlFor="bank-amount">Tutar (TL)</Label><Input id="bank-amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="bank-date">İşlem tarihi ve saati</Label><Input id="bank-date" required type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="bank-counterparty">{direction === "incoming" ? "Kimden geldi?" : "Kime gönderildi?"}</Label><Input id="bank-counterparty" maxLength={120} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="bank-description">Açıklama</Label><Input id="bank-description" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <Button type="submit" disabled={add.isPending}>Kaydet</Button>
    </form>}
    {records.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Hareketler yüklenemedi. Bağlantını kontrol edip yeniden dene.</p>}
    <div className="space-y-3"><div className="flex items-center justify-between px-1"><div><h2 className="font-semibold">İşlemler</h2><p className="text-xs text-muted-foreground">{rows.length} kayıt · {monthLabel}</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{displayedRows.length} gösteriliyor</span></div>
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input aria-label="Hareketlerde ara" placeholder="Kişi veya açıklamada ara" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-xl pl-9"/></div>
    {displayedRows.map((row) => <article key={row.id} className="flex items-start justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex min-w-0 gap-3"><div className={"mt-0.5 rounded-xl p-2 " + (row.direction === "incoming" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600")}>{row.direction === "incoming" ? <ArrowDownLeft className="size-4"/> : <ArrowUpRight className="size-4"/>}</div><div className="min-w-0"><p className="truncate font-medium">{row.counterparty || (row.source === "open_banking" ? "Karşı taraf banka verisinde yok" : row.direction === "incoming" ? "Gelen para" : "Çıkan para")}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(row.date)} · {row.direction === "incoming" ? "Kimden" : "Kime"}{row.status && row.status !== "completed" ? ` · ${row.status}` : ""}{row.source === "open_banking" ? " · Bankadan eşitlendi" : row.source === "email_attachment" ? " · Ekstre dosyasından" : row.source === "email_auto" ? " · Gmail taraması" : ""}</p>{row.description && <p className="mt-2 break-words text-sm text-muted-foreground">{row.description}</p>}{row.reference && <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">Ref: {row.reference}</p>}</div></div>
      <div className="flex shrink-0 items-start gap-1"><span className={"num pt-1 text-right text-sm font-semibold " + (row.direction === "incoming" ? "text-emerald-600" : "text-rose-600")}>{row.direction === "incoming" ? "+" : "−"}{formatTL(row.amount)}</span><Button variant="ghost" size="icon" aria-label="Hareket ayrıntılarını aç" title="Hareket ayrıntıları" onClick={() => setSelectedMovementId(row.id)}><Eye className="size-4"/></Button><Button variant="ghost" size="icon" aria-label="YEVMİYE VE FİNANS hareket belgesini indir" title="YEVMİYE VE FİNANS belgesi (resmi banka dekontu değildir)" onClick={() => void downloadSahaReceipt(row)}><FileDown className="size-4"/></Button><Button variant="ghost" size="icon" aria-label="Hareketi kalıcı sil" title="Kalıcı sil" disabled={remove.isPending} onClick={() => remove.mutate(row.id)}><Trash2 className="size-4"/></Button></div>
    </article>)}
    {!displayedRows.length && !records.isLoading && !records.error && (rows.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aramanla eşleşen hareket yok.</p> : <div className="rounded-2xl border border-dashed bg-card/60 px-5 py-10 text-center"><div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><WalletCards className="size-6"/></div><p className="mt-3 font-semibold">Bu ay için hareket yok</p><p className="mt-1 text-sm text-muted-foreground">İlk gelen veya çıkan para kaydını ekleyebilirsin.</p><Button className="mt-4" variant="secondary" onClick={() => setAdding(true)}><Plus/>Hareket ekle</Button></div>)}
    </div>
    {selectedMovementId && (() => { const row = records.data?.find((item) => item.id === selectedMovementId); if (!row) return null; const fields: Array<[string, string | undefined]> = [["Tarih ve saat", formatDate(row.date)], [row.direction === "incoming" ? "Gönderen" : "Alıcı", row.counterparty], ["Tutar", formatTL(row.amount)], ["İşlem nedeni", row.transaction_reason], ["Açıklama", row.description], ["Karşı taraf IBAN", row.counterparty_iban], ["Banka", row.bank_name ?? activeAccount?.bank_name], ["Referans / dekont no", row.reference], ["İşlem durumu", row.status], ["İşlem sonrası bakiye", row.balance_after === undefined ? undefined : formatTL(row.balance_after)], ["Kayıt kaynağı", row.source === "email_attachment" ? "Elle seçilen ekstre eki" : row.source === "email_auto" ? "Google Gmail taraması" : row.source === "manual" ? "Elle giriş" : row.source ?? "—"]]; return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedMovementId(null); }}><section role="dialog" aria-modal="true" aria-labelledby="movement-details-title" className="max-h-[88dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-3xl border bg-background p-5 shadow-2xl sm:rounded-3xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hesap hareketi</p><h2 id="movement-details-title" className="mt-1 text-xl font-bold">{row.direction === "incoming" ? "Gelen transfer" : "Giden transfer"} · {formatTL(row.amount)}</h2></div><Button variant="outline" onClick={() => setSelectedMovementId(null)}>Kapat</Button></div><dl className="grid gap-2 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border bg-card p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value || "Dosyada belirtilmemiş"}</dd></div>)}</dl>{row.raw_source_snippet && <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-medium">Kaynak iletinin göndereni ve konusu</summary><pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{row.raw_source_snippet}</pre></details>}<p className="text-xs leading-relaxed text-muted-foreground">Gösterilen bilgiler içe aktarılan dosyada veya taranan e-postadaki metinde bulunan alanlardır. Eksik bilgiler tahmin edilmez. Bu kayıt banka tarafından doğrulanmış resmi dekont değildir.</p></section></div>; })()}
    {biometricSetupOpen && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { setBiometricSetupOpen(false); setBiometricPassphrase(""); } }}><section role="dialog" aria-modal="true" aria-labelledby="vault-biometric-title" className="w-full max-w-sm space-y-4 rounded-2xl border bg-background p-5 shadow-2xl"><div className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-2 text-primary"><Fingerprint/></span><div><h2 id="vault-biometric-title" className="font-semibold">Biyometrik kasa açma</h2><p className="text-xs text-muted-foreground">Bu cihazda güvenli biçimde etkinleştir</p></div></div><p className="text-sm leading-relaxed text-muted-foreground">Parolan WebAuthn PRF ile üretilen cihaz anahtarı altında şifrelenir. Biyometri, bu anahtarı cihazda serbest bırakır; parolan sunucuya gönderilmez.</p><div className="space-y-2"><Label htmlFor="vault-bio-pass">Kasa parolanı doğrula</Label><Input id="vault-bio-pass" type="password" autoComplete="current-password" value={biometricPassphrase} onChange={(event) => setBiometricPassphrase(event.target.value)} /></div><div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => { setBiometricSetupOpen(false); setBiometricPassphrase(""); }}>İptal</Button><Button className="flex-1" disabled={vaultBusy || !biometricPassphrase} onClick={() => { void vault.enableBiometric(biometricPassphrase).then(() => { toast.success("Bu cihaz için biyometrik kasa açma etkinleştirildi."); setBiometricSetupOpen(false); setBiometricPassphrase(""); }).catch((error) => toast.error(error instanceof Error ? error.message : "Biyometri etkinleştirilemedi.")); }}><Fingerprint/>Etkinleştir</Button></div></section></div>}
  </div>;
}

function Summary({ label, amount, tone }: { label: string; amount: number; tone: string }) {
  return <div className="min-w-0 rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={"num mt-1 truncate text-sm font-semibold " + tone}>{formatTL(amount)}</p></div>;
}
