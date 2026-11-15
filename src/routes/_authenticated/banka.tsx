import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
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

  const rows = useMemo(() => (records.data ?? []).filter((r) => monthKey(r.date) === month), [records.data, month]);
  const incoming = rows.filter((r) => r.direction === "incoming").reduce((sum, r) => sum + r.amount, 0);
  const outgoing = rows.filter((r) => r.direction === "outgoing").reduce((sum, r) => sum + r.amount, 0);

  async function downloadReport() {
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const fontBytes = await (await fetch("/fonts/DejaVuSans.ttf")).arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(fontBytes);
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      doc.addFileToVFS("DejaVu.ttf", btoa(binary));
      doc.addFont("DejaVu.ttf", "DejaVu", "normal");
      doc.setFont("DejaVu");
      const label = new Date(month + "-01T00:00:00").toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
      doc.setFontSize(16);
      doc.text("Hesap hareketleri - " + label, 14, 20);
      doc.setFontSize(10);
      doc.text("Gelen para: " + formatTL(incoming), 14, 30);
      doc.text("Çıkan para / harcama: " + formatTL(outgoing), 14, 37);
      doc.text("Aylık net: " + formatTL(incoming - outgoing), 14, 44);
      let y = 55;
      for (const row of rows) {
        const details = [
          formatDate(row.date) + " · " + (row.direction === "incoming" ? "Gelen" : "Giden") + " · " + formatTL(row.amount),
          (row.direction === "incoming" ? "Kimden" : "Kime") + ": " + (row.counterparty || "Belirtilmedi"),
          "Açıklama: " + (row.description || "Belirtilmedi"),
        ].join("\n");
        const lines = doc.splitTextToSize(details, 180) as string[];
        if (y + lines.length * 5 + 5 > 280) { doc.addPage(); y = 20; }
        doc.text(lines, 14, y);
        y += lines.length * 5 + 5;
      }
      doc.save("hesap-hareketleri-" + month + ".pdf");
    } catch {
      toast.error("PDF raporu oluşturulamadı");
    }
  }

  if (ownerId === undefined) return <p className="py-12 text-center text-muted-foreground">Oturum kontrol ediliyor…</p>;
  if (!ownerId) return <p className="py-12 text-center text-muted-foreground">Hareketleri görmek için oturum açın.</p>;

  return <div className="space-y-4">
    <div className="flex items-start justify-between gap-2">
      <div><h1 className="text-2xl font-bold">Hesap hareketleri</h1><p className="mt-1 text-xs text-muted-foreground">Kişisel kayıtlarınız. Diğer kullanıcılar bu hareketleri göremez.</p></div>
      <Button onClick={() => setAdding((value) => !value)}><Plus />Hareket</Button>
    </div>
    <div className="flex flex-wrap items-center gap-2"><Input aria-label="Rapor ayı" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto"/><Button variant="secondary" onClick={() => void downloadReport()} disabled={records.isLoading}><Download />PDF indir</Button></div>
    <div className="grid grid-cols-3 gap-2"><Summary label="Gelen" amount={incoming} tone="text-success"/><Summary label="Çıkan" amount={outgoing} tone="text-destructive"/><Summary label="Aylık net" amount={incoming - outgoing} tone={incoming - outgoing < 0 ? "text-destructive" : "text-foreground"}/></div>
    {adding && <form className="space-y-3 rounded-2xl border bg-card p-4" onSubmit={(event) => {
      event.preventDefault();
      const value = Number(amount.replace(",", "."));
      if (!(value > 0) || !Number.isFinite(value) || value > 99_999_999.99) return toast.error("Geçerli bir tutar girin");
      if (!date || Number.isNaN(Date.parse(date + "T00:00:00"))) return toast.error("Geçerli bir tarih seçin");
      add.mutate({ direction, amount: value, date, counterparty: counterparty.trim().slice(0, 120), description: description.trim().slice(0, 500) }, { onSuccess: () => { setAdding(false); setAmount(""); setCounterparty(""); setDescription(""); } });
    }}>
      <div className="grid grid-cols-2 gap-2"><Button type="button" variant={direction === "incoming" ? "default" : "secondary"} onClick={() => setDirection("incoming")}>Gelen para</Button><Button type="button" variant={direction === "outgoing" ? "default" : "secondary"} onClick={() => setDirection("outgoing")}>Çıkan para</Button></div>
      <div className="space-y-2"><Label htmlFor="bank-amount">Tutar (TL)</Label><Input id="bank-amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="bank-date">İşlem tarihi</Label><Input id="bank-date" required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="bank-counterparty">{direction === "incoming" ? "Kimden geldi?" : "Kime gönderildi?"}</Label><Input id="bank-counterparty" maxLength={120} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="bank-description">Açıklama</Label><Input id="bank-description" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <Button type="submit" disabled={add.isPending}>Kaydet</Button>
    </form>}
    {records.error && <p className="text-destructive">Hareketler yüklenemedi.</p>}
    {rows.map((row) => <article key={row.id} className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4">
      <div className="min-w-0"><p className="font-medium">{row.direction === "incoming" ? "Gelen para" : "Çıkan para"} · {formatDate(row.date)}</p><p className="mt-1 text-sm">{row.direction === "incoming" ? "Kimden" : "Kime"}: {row.counterparty || "Belirtilmedi"}</p>{row.description && <p className="mt-1 break-words text-xs text-muted-foreground">{row.description}</p>}</div>
      <div className="flex shrink-0 items-center gap-1"><span className={"num " + (row.direction === "incoming" ? "text-success" : "text-destructive")}>{row.direction === "incoming" ? "+" : "−"}{formatTL(row.amount)}</span><Button variant="ghost" size="icon" aria-label="Hareketi sil" disabled={remove.isPending} onClick={() => remove.mutate(row.id)}><Trash2 className="size-4"/></Button></div>
    </article>)}
    {!rows.length && !records.isLoading && <p className="py-8 text-center text-muted-foreground">Bu ay için hareket yok.</p>}
    <p className="text-center text-xs text-muted-foreground">Bu ekrana hareketleri elle girersiniz; banka hesabınıza bağlanılmaz.</p>
  </div>;
}

function Summary({ label, amount, tone }: { label: string; amount: number; tone: string }) {
  return <div className="min-w-0 rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={"num mt-1 truncate text-sm font-semibold " + tone}>{formatTL(amount)}</p></div>;
}
