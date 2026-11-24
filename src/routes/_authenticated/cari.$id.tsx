import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Pencil,
  Plus,
  Banknote,
  Download,
  MessageCircle,
  ArrowLeft,
  Phone,
  MapPin,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CustomerForm } from "@/components/app/forms/CustomerForm";
import { TransactionForm } from "@/components/app/forms/TransactionForm";
import { MessageSheet } from "@/components/app/MessageSheet";
import { useCustomers, useTransactions } from "@/lib/data";
import { customerBalance, customerRestriction, formatDate, formatTL, todayISO, type Tx } from "@/lib/finance";
import { buildReceipt, shareOrDownload } from "@/lib/receipt";
import { pageHead, useRecords, useSaveRecord } from "@/lib/work";
import { buildStatementText } from "@/lib/statement";
import { openWhatsApp } from "@/lib/templates";
export const Route = createFileRoute("/_authenticated/cari/$id")({
  head: () => pageHead("Müşteri Ekstresi", "Müşteri hesabı, parçalı tahsilatlar ve makbuzlar."),
  component: CustomerDetail,
});
function CustomerDetail() {
  const { id } = Route.useParams();
  const customers = useCustomers();
  const txs = useTransactions();
  const settings = useRecords("settings");
  const jobs = useRecords("job");
  const saveJob = useSaveRecord("job");
  const navigate = useNavigate();
  const c = customers.data?.find((c) => c.id === id);
  const rows = (txs.data ?? []).filter((t) => t.customer_id === id);
  const balance = customerBalance(rows);
  const credit = customerRestriction(c ?? {}, rows);
  const lastJob = (jobs.data ?? []).filter((job) => job.payload.customer_id === id).sort((a, b) => String(b.payload.date ?? b.created_at).localeCompare(String(a.payload.date ?? a.created_at)))[0];
  const customerValue = useMemo(() => {
    const customerJobs = (jobs.data ?? []).filter((job) => job.payload.customer_id === id && job.payload.status !== "İptal");
    const ticketValues = customerJobs.map((job) => Number(job.payload.price ?? 0) || Number(job.payload.hourly_rate ?? 0) * Number(job.payload.planned_hours ?? 0)).filter((value) => value > 0);
    const lifetimeYears = Math.max(1, (customers.data ?? []).length ? (customers.data ?? []).reduce((sum, customer) => sum + Math.max(1, (Date.now() - new Date(customer.created_at).getTime()) / (365.25 * 86_400_000)), 0) / (customers.data ?? []).length : 1);
    const avgTicket = ticketValues.length ? ticketValues.reduce((sum, value) => sum + value, 0) / ticketValues.length : 0;
    const annualFrequency = customerJobs.length / lifetimeYears;
    const lifetimeValues = (customers.data ?? []).map((customer) => {
      const related = (jobs.data ?? []).filter((job) => job.payload.customer_id === customer.id && job.payload.status !== "İptal");
      const amounts = related.map((job) => Number(job.payload.price ?? 0) || Number(job.payload.hourly_rate ?? 0) * Number(job.payload.planned_hours ?? 0)).filter((value) => value > 0);
      const years = Math.max(1, (Date.now() - new Date(customer.created_at).getTime()) / (365.25 * 86_400_000));
      return amounts.length ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length * (related.length / years) * lifetimeYears : 0;
    }).filter((value) => value > 0);
    const averageLifetimeValue = lifetimeValues.length ? lifetimeValues.reduce((sum, value) => sum + value, 0) / lifetimeValues.length : 0;
    return { estimate: avgTicket * annualFrequency * lifetimeYears, averageLifetimeValue, jobs: customerJobs.length };
  }, [customers.data, jobs.data, id, c?.created_at]);
  const [edit, setEdit] = useState(false);
  const [kind, setKind] = useState<"debt" | "payment">("debt");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(false);
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  async function receipt(tx: Tx) {
    if (!c) return;
    setBusy(true);
    try {
      setFile(
        await buildReceipt({
          business: String(settings.data?.[0]?.payload.business ?? "Yevmiye & Finans"),
          profile: settings.data?.[0]?.payload,
          customer: c,
          tx,
          balance,
        }),
      );
      toast.success("Makbuz hazır");
    } catch {
      toast.error("Makbuz oluşturulamadı");
    } finally {
      setBusy(false);
    }
  }
  if (!c)
    return (
      <p className="py-8 text-muted-foreground">
        {customers.isLoading ? "Yükleniyor…" : "Müşteri bulunamadı."}
      </p>
    );
  const last = rows[0];
  const vars = {
    "Müşteri Adı": c.name,
    Tarih: formatDate(last?.occurred_on ?? todayISO()),
    "Kalan Tutar": formatTL(balance),
    "Toplam Tutar": formatTL(
      rows.filter((t) => t.kind === "debt").reduce((s, t) => s + t.amount, 0),
    ),
    "Ödenen Tutar": formatTL(last?.kind === "payment" ? last.amount : 0),
    "İş Türü": last?.description ?? "",
    "İş Detayı": last?.description ?? "",
    "Malzeme Tutarı": formatTL(last?.material_cost ?? 0),
    "İşçilik Tutarı": formatTL((last?.amount ?? 0) - (last?.material_cost ?? 0)),
  };
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/cari">
          <ArrowLeft />
          Cari hesaplar
        </Link>
      </Button>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold">{c.name}</h1>
          <p className="text-sm text-muted-foreground">{"★".repeat(c.rating ?? 0)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Müşteriyi düzenle"
          onClick={() => setEdit(true)}
        >
          <Pencil />
        </Button>
      </div>
      <section aria-label="Tahmini müşteri yaşam boyu değeri" className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Müşteri değeri · tahmini</p>
        <p className="num mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{formatTL(customerValue.estimate)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Tüm müşterilerin ortalama tahmini değeri: {formatTL(customerValue.averageLifetimeValue)} · {customerValue.jobs} kayıtlı iş</p>
        {customerValue.averageLifetimeValue > 0 && customerValue.estimate >= customerValue.averageLifetimeValue * 2 && <span className="mt-2 inline-flex rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">⭐ Yüksek değerli müşteri</span>}
        <p className="mt-2 text-[10px] text-muted-foreground">Kayıtlı iş fiyatı ve müşteri hesabı açılış süresinden türetilen yaklaşık göstergedir; gelecek gelir garantisi değildir.</p>
      </section>
      <p className="break-words text-sm text-muted-foreground">{c.address}</p>
      <p className="text-sm">{c.notes}</p>
      <div className="flex flex-wrap gap-2">
        {c.phone && (
          <>
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${c.phone}`}>
                <Phone />
                {c.phone}
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => openWhatsApp(c.phone!, buildStatementText({ customer: c, txs: rows, profile: settings.data?.[0]?.payload }))}>
              <MessageCircle />
              Ekstreyi WhatsApp'a gönder
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMessage(true)}>
              <MessageCircle />
              Mesaj gönder
            </Button>
          </>
        )}
        {c.address && (
          <Button asChild variant="outline" size="sm">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MapPin />
              Adres
            </a>
          </Button>
        )}
      </div>
      <div className="border-y py-5">
        <p className="text-sm text-muted-foreground">Kalan bakiye</p>
        <p className="num text-3xl text-warning">{formatTL(balance)}</p>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            setKind("debt");
            setOpen(true);
          }}
        >
          <Plus />
          Borç
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setKind("payment");
            setOpen(true);
          }}
        >
          <Banknote />
          Tahsilat
        </Button>
      </div>
      {lastJob && <Button variant="outline" className="h-12 w-full" disabled={saveJob.isPending || credit.blocked} onClick={() => {
        saveJob.mutate({ owner_id: lastJob.owner_id, payload: { ...lastJob.payload, customer_id: id, date: todayISO(), status: "Bekliyor", seconds: 0, started_at: null, billed: false, appointment_id: null, override_reason: "" } }, { onSuccess: () => { toast.success("Son işin bilgileri yeni işe kopyalandı."); void navigate({ to: "/isler" }); } });
      }}><Copy/>Son işlemi tekrar et</Button>}
      {credit.blocked && <p role="alert" className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">Cari kilidi açık. Yeni iş için önce tahsilat alın veya iş ekranında gerekçeli yönetici istisnası girin.</p>}
      {file && (
        <Button className="w-full" onClick={() => void shareOrDownload(file)}>
          <Download />
          Makbuzu indir / paylaş
        </Button>
      )}
      <h2 className="font-semibold">Hesap ekstresi</h2>
      {rows.map((t) => (
        <div className="flex items-center gap-3 border-b py-3" key={t.id}>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm">
              {t.description || (t.kind === "debt" ? "İş ücreti" : "Tahsilat")}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(t.occurred_on)} · {t.method ?? "Borç"}
            </p>
          </div>
          <span className={`num text-sm ${t.kind === "debt" ? "text-warning" : "text-success"}`}>
            {t.kind === "debt" ? "+" : "−"}
            {formatTL(t.amount)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            title="Makbuz oluştur"
            aria-label="Makbuz oluştur"
            disabled={busy}
            onClick={() => void receipt(t)}
          >
            <Download />
          </Button>
        </div>
      ))}
      {!rows.length && <p className="text-muted-foreground">Henüz işlem yok.</p>}
      <CustomerForm open={edit} onOpenChange={setEdit} customer={c} />
      <TransactionForm open={open} onOpenChange={setOpen} customerId={id} defaultKind={kind} />
      <MessageSheet open={message} onOpenChange={setMessage} phone={c.phone ?? ""} vars={vars} />
    </div>
  );
}
