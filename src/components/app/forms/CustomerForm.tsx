import { useEffect, useState } from "react";
import { MapPin, Star } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpsert, type Customer } from "@/lib/data";
import { cn } from "@/lib/utils";
import { getPosition } from "@/lib/geo";
import { FormDrawer } from "./FormDrawer";

export function CustomerForm({ open, onOpenChange, customer }: { open: boolean; onOpenChange: (o: boolean) => void; customer?: Customer }) {
  const [f, setF] = useState({ name: "", phone: "", address: "", notes: "", rating: 0, credit_limit: 0, payment_due_days: 15, is_blocked: false, latitude: null as number | null, longitude: null as number | null });
  const [locating, setLocating] = useState(false);
  const upsert = useUpsert("customers");

  useEffect(() => {
    if (open)
      setF({
        name: customer?.name ?? "",
        phone: customer?.phone ?? "",
        address: customer?.address ?? "",
        notes: customer?.notes ?? "",
        rating: customer?.rating ?? 0,
        credit_limit: Number(customer?.credit_limit ?? 0),
        payment_due_days: Number(customer?.payment_due_days ?? 15),
        is_blocked: Boolean(customer?.is_blocked),
        latitude: customer?.latitude ?? null,
        longitude: customer?.longitude ?? null,
      });
  }, [open, customer]);

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={customer ? "Müşteriyi düzenle" : "Yeni müşteri"}
      busy={upsert.isPending}
      onSubmit={() => {
        if (!f.name.trim()) { toast.error("Müşteri adı gerekli"); return; }
        upsert.mutate(
          {
            id: customer?.id,
            name: f.name.trim(),
            phone: f.phone.trim() || null,
            address: f.address.trim() || null,
            notes: f.notes.trim() || null,
            rating: f.rating || null,
            credit_limit: f.credit_limit,
            payment_due_days: f.payment_due_days,
            is_blocked: f.is_blocked,
            latitude: f.latitude,
            longitude: f.longitude,
          },
          { onSuccess: () => onOpenChange(false) },
        );
      }}
    >
      <div className="space-y-2">
        <Label>Ad Soyad / Firma</Label>
        <Input className="h-12" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Telefon</Label>
        <Input className="h-12" type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="customer-credit-limit">Kredi limiti (₺)</Label><Input id="customer-credit-limit" type="number" min="0" step="0.01" inputMode="decimal" value={f.credit_limit} onChange={(e) => setF({ ...f, credit_limit: Number(e.target.value) })}/></div>
        <div className="space-y-2"><Label htmlFor="customer-due-days">Ödeme vadesi (gün)</Label><Input id="customer-due-days" type="number" min="0" max="3650" value={f.payment_due_days} onChange={(e) => setF({ ...f, payment_due_days: Number(e.target.value) })}/></div>
      </div>
      <label className="flex min-h-12 items-center gap-3 rounded-xl border px-3"><input type="checkbox" checked={f.is_blocked} onChange={(e) => setF({ ...f, is_blocked: e.target.checked })}/><span className="text-sm font-medium">Müşteri cari kartını bloke et</span></label>
      <div className="space-y-2 rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-medium">Kayıtlı konum</p><p className="text-xs text-muted-foreground">{f.latitude != null && f.longitude != null ? `${f.latitude}, ${f.longitude}` : "Henüz konum kaydedilmedi"}</p></div><Button type="button" variant="secondary" size="sm" disabled={locating} onClick={async () => { setLocating(true); try { const p = await getPosition(); setF((v) => ({ ...v, latitude: p.lat, longitude: p.lng })); toast.success("Müşteri konumu kaydedildi"); } catch (e) { toast.error(e instanceof Error ? e.message : "Konum alınamadı"); } finally { setLocating(false); } }}><MapPin/>{locating ? "Bulunuyor…" : "Mevcut konum"}</Button></div></div>
      <div className="space-y-2">
        <Label>Adres</Label>
        <Textarea value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Gizli puan (sadece sen görürsün)</Label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button type="button" key={n} onClick={() => setF({ ...f, rating: f.rating === n ? 0 : n })} aria-label={`${n} yıldız`}>
              <Star className={cn("size-8", n <= f.rating ? "fill-warning text-warning" : "text-muted-foreground")} />
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Not</Label>
        <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
    </FormDrawer>
  );
}
