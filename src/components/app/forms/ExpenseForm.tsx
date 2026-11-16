import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpsert } from "@/lib/data";
import { ReceiptPhotoField } from "@/components/app/MediaTools";
import { supabase } from "@/integrations/supabase/client";
import { useRecords } from "@/lib/work";
import { EXPENSE_LABELS, todayISO, type ExpenseCategory } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { FormDrawer } from "./FormDrawer";

export function ExpenseForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [category, setCategory] = useState<ExpenseCategory>("yakit");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [expenseId, setExpenseId] = useState(crypto.randomUUID());
  const [jobRecordId, setJobRecordId] = useState("");
  const jobs = useRecords("job");
  function close(openNow: boolean) {
    if (!openNow && receiptPath) void supabase.storage.from("saha-media").remove([receiptPath]);
    if (!openNow) setReceiptPath(null);
    onOpenChange(openNow);
  }
  const upsert = useUpsert("expenses");

  useEffect(() => {
    if (open) {
      setAmount("");
      setDescription("");
      setDate(todayISO());
      setReceiptPath(null);
      setExpenseId(crypto.randomUUID());
      setJobRecordId("");
    }
  }, [open]);

  return (
    <FormDrawer
      open={open}
      onOpenChange={close}
      title="Gider ekle"
      busy={upsert.isPending}
      canSubmit={!(Number(amount.replace(",", ".")) > 500 && !receiptPath)}
      submitHint={Number(amount.replace(",", ".")) > 500 && !receiptPath ? "500 ₺ üzerindeki giderlerde fiş fotoğrafı zorunludur." : undefined}
      onSubmit={async () => {
        const n = Number(amount.replace(",", "."));
        if (!(n > 0)) { toast.error("Geçerli bir tutar girin"); return; }
        if (n > 500 && !receiptPath) return void toast.error("500 ₺ üzerindeki giderler için fiş fotoğrafı ekleyin.");
        try {
          await upsert.mutateAsync({ id: expenseId, category, amount: n, description: description.trim() || null, occurred_on: date, receipt_photo_url: receiptPath, job_record_id: jobRecordId || null });
          onOpenChange(false);
        } catch {
          if (receiptPath) await supabase.storage.from("saha-media").remove([receiptPath]);
        }
      }}
    >
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(EXPENSE_LABELS) as ExpenseCategory[]).map((c) => (
          <button
            type="button"
            key={c}
            onClick={() => setCategory(c)}
            className={cn("rounded-xl border px-3 py-3 text-sm font-medium", category === c ? "border-primary bg-accent text-primary" : "bg-secondary")}
          >
            {EXPENSE_LABELS[c]}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <Label>Tutar (TL)</Label>
        <Input className="num h-14 text-2xl" type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {Number(amount.replace(",", ".")) > 500 && <div role="alert" className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm">500 ₺ üzerindeki giderlerde fiş fotoğrafı eklenmeden kayıt yapılamaz.</div>}
      <ReceiptPhotoField recordId={expenseId} value={receiptPath} onChange={setReceiptPath}/>
      <div className="space-y-2">
        <Label>Açıklama</Label>
        <Input className="h-12" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="space-y-2"><Label htmlFor="expense-job">İş bağlantısı <span className="font-normal text-muted-foreground">(opsiyonel · kârlılık raporu)</span></Label><select id="expense-job" className="h-11 w-full rounded-xl border bg-secondary px-3 text-sm" value={jobRecordId} onChange={(e) => setJobRecordId(e.target.value)}><option value="">Genel gider</option>{(jobs.data ?? []).map((job) => <option value={job.id} key={job.id}>{String(job.payload.title)} · {String(job.payload.date ?? "")}</option>)}</select></div>
      <div className="space-y-2">
        <Label>Tarih</Label>
        <Input className="h-12" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
    </FormDrawer>
  );
}
