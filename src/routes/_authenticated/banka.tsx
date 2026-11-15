import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Download, Plus, ShieldCheck, Trash2, WalletCards } from "lucide-react";
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

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3">
      <div className="flex items-center gap-2"><Input aria-label="Rapor ayı" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto"/><span className="hidden text-xs text-muted-foreground sm:inline">Rapor ayı</span></div>
      <div className="flex gap-2"><Button variant="secondary" onClick={() => void downloadReport()} disabled={records.isLoading}><Download />PDF indir</Button><Button onClick={() => setAdding((value) => !value)}><Plus />Hareket ekle</Button></div>
    </div>
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
    <div className="space-y-2"><div className="flex items-center justify-between px-1"><h2 className="font-semibold">İşlemler</h2><span className="text-xs text-muted-foreground">{rows.length} kayıt</span></div>
    {rows.map((row) => <article key={row.id} className="flex items-start justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex min-w-0 gap-3"><div className={"mt-0.5 rounded-xl p-2 " + (row.direction === "incoming" ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600")}>{row.direction === "incoming" ? <ArrowDownLeft className="size-4"/> : <ArrowUpRight className="size-4"/>}</div><div className="min-w-0"><p className="truncate font-medium">{row.counterparty || (row.direction === "incoming" ? "Gelen para" : "Çıkan para")}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(row.date)} · {row.direction === "incoming" ? "Kimden" : "Kime"}</p>{row.description && <p className="mt-2 break-words text-sm text-muted-foreground">{row.description}</p>}</div></div>
      <div className="flex shrink-0 items-start gap-1"><span className={"num pt-1 text-right text-sm font-semibold " + (row.direction === "incoming" ? "text-emerald-600" : "text-rose-600")}>{row.direction === "incoming" ? "+" : "−"}{formatTL(row.amount)}</span><Button variant="ghost" size="icon" aria-label="Hareketi kalıcı sil" title="Kalıcı sil" disabled={remove.isPending} onClick={() => remove.mutate(row.id)}><Trash2 className="size-4"/></Button></div>
    </article>)}
    {!rows.length && !records.isLoading && !records.error && <div className="rounded-2xl border border-dashed bg-card/60 px-5 py-10 text-center"><div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><WalletCards className="size-6"/></div><p className="mt-3 font-semibold">Bu ay için hareket yok</p><p className="mt-1 text-sm text-muted-foreground">İlk gelen veya çıkan para kaydını ekleyebilirsin.</p><Button className="mt-4" variant="secondary" onClick={() => setAdding(true)}><Plus/>Hareket ekle</Button></div>}
    </div>
  </div>;
}

function Summary({ label, amount, tone }: { label: string; amount: number; tone: string }) {
  return <div className="min-w-0 rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={"num mt-1 truncate text-sm font-semibold " + tone}>{formatTL(amount)}</p></div>;
}
