import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Calculator, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pageHead, useSaveRecord } from "@/lib/work";
import { formatTL } from "@/lib/finance";
import { useMe } from "@/hooks/use-me";

export const Route = createFileRoute("/_authenticated/hesaplayici")({
  head: () => pageHead("İş Hesaplayıcı", "İş maliyeti, kâr marjı ve KDV tahmini."),
  component: JobCalculator,
});

type Calculation = { id: string; date: string; name: string; materials: number; labor: number; equipment: number; margin: number; vat: number; cost: number; profit: number; net: number; gross: number };
const fieldNumber = (value: string) => { const parsed = Number(value.replace(",", ".")); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; };

function JobCalculator() {
  const me = useMe();
  const saveTemplate = useSaveRecord("job_template");
  const [name, setName] = useState("");
  const [materials, setMaterials] = useState("0");
  const [hours, setHours] = useState("1");
  const [hourly, setHourly] = useState("0");
  const [equipment, setEquipment] = useState("0");
  const [margin, setMargin] = useState("30");
  const [vat, setVat] = useState("20");
  const [vatIncluded, setVatIncluded] = useState(false);
  const [history, setHistory] = useState<Calculation[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem(`saha.cost-history:${me.data?.id ?? "local"}`) ?? "[]") as Calculation[]; return Array.isArray(saved) ? saved.slice(0, 10) : []; } catch { return []; }
  });
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(`saha.cost-history:${me.data?.id ?? "local"}`) ?? "[]") as Calculation[]; setHistory(Array.isArray(saved) ? saved.slice(0, 10) : []); } catch { setHistory([]); }
  }, [me.data?.id]);
  const result = useMemo(() => {
    const materialCost = fieldNumber(materials); const laborCost = fieldNumber(hours) * fieldNumber(hourly); const equipmentCost = fieldNumber(equipment);
    const cost = materialCost + laborCost + equipmentCost; const marginRate = Math.min(89, fieldNumber(margin)) / 100;
    const net = cost / Math.max(0.11, 1 - marginRate); const profit = net - cost; const vatAmount = net * fieldNumber(vat) / 100;
    return { materialCost, laborCost, equipmentCost, cost, net, profit, vatAmount, gross: net + vatAmount };
  }, [materials, hours, hourly, equipment, margin, vat]);
  function remember() {
    const row: Calculation = { id: crypto.randomUUID(), date: new Date().toISOString(), name: name.trim() || "İş maliyeti", materials: fieldNumber(materials), labor: fieldNumber(hours) * fieldNumber(hourly), equipment: fieldNumber(equipment), margin: fieldNumber(margin), vat: fieldNumber(vat), cost: result.cost, profit: result.profit, net: result.net, gross: result.gross };
    const next = [row, ...history].slice(0, 10); setHistory(next);
    try { localStorage.setItem(`saha.cost-history:${me.data?.id ?? "local"}`, JSON.stringify(next)); toast.success("Hesaplama bu cihazda saklandı."); } catch { toast.error("Hesaplama cihazda saklanamadı."); }
  }
  function saveAsTemplate() {
    const title = name.trim(); if (!title) { toast.error("Şablon için iş adı girin."); return; }
    saveTemplate.mutate({ payload: { title, price: Number(result.net.toFixed(2)), material_cost: fieldNumber(materials), hourly_rate: fieldNumber(hourly), planned_hours: fieldNumber(hours), vat_rate: fieldNumber(vat), estimated_profit_margin: fieldNumber(margin), notes: `Tahmini ekipman maliyeti ${formatTL(result.equipmentCost)} · KDV dahil fiyat ${formatTL(result.gross)}. Hesaplayıcı tahminidir.` } });
  }
  return <div className="mx-auto max-w-4xl space-y-4 pb-8">
    <header className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Calculator className="size-6"/></span><div><h1 className="text-2xl font-bold">İş Maliyet Hesaplayıcısı</h1><p className="text-sm text-muted-foreground">Fiyat ve marjı işe başlamadan önce hesaplayın.</p></div></header>
    <section className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="calc-name">İş / şablon adı</Label><Input id="calc-name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Banyo tesisat yenileme"/></div>
      <MoneyField id="calc-materials" label="Malzeme maliyeti" value={materials} onChange={setMaterials}/>
      <MoneyField id="calc-equipment" label="Ekipman maliyeti" value={equipment} onChange={setEquipment}/>
      <div className="space-y-2"><Label htmlFor="calc-hours">İşçilik saati</Label><Input id="calc-hours" type="number" min="0" max="100000" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)}/></div>
      <MoneyField id="calc-hourly" label="Saatlik ücret" value={hourly} onChange={setHourly}/>
      <div className="space-y-2"><Label htmlFor="calc-margin">İstenen kâr marjı (%)</Label><Input id="calc-margin" type="number" min="0" max="89" step="1" value={margin} onChange={(e) => setMargin(e.target.value)}/><p className="text-[11px] text-muted-foreground">Satış fiyatı içindeki kâr payı olarak hesaplanır.</p></div>
      <div className="space-y-2"><Label htmlFor="calc-vat">KDV oranı</Label><select id="calc-vat" className="h-10 w-full rounded-xl border bg-background px-3 text-sm" value={vat} onChange={(e) => setVat(e.target.value)}>{[1, 8, 18, 20].map((rate) => <option key={rate} value={rate}>%{rate}</option>)}</select></div>
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={vatIncluded} onChange={(e) => setVatIncluded(e.target.checked)}/>Gösterilen satış fiyatı KDV dahil olsun</label>
    </section>
    <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Tahmini sonuç</p><h2 className="mt-1 text-xl font-bold">{formatTL(vatIncluded ? result.gross : result.net)}</h2><p className="text-xs text-muted-foreground">{vatIncluded ? "KDV dahil satış fiyatı" : "KDV hariç satış fiyatı"}</p></div><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">Kâr {formatTL(result.profit)}</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Maliyet",result.cost],["Kâr",result.profit],["KDV",result.vatAmount],["KDV dahil",result.gross]].map(([label,value])=><div key={String(label)} className="rounded-xl border bg-background p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="num mt-1 break-words text-sm font-bold">{formatTL(Number(value))}</p></div>)}</div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={remember}><Save/>Hesaplamayı sakla</Button><Button type="button" onClick={saveAsTemplate} disabled={saveTemplate.isPending}><Save/>{saveTemplate.isPending ? "Kaydediliyor…" : "İş şablonuna kaydet"}</Button></div><p className="text-[11px] text-muted-foreground">Bu hesaplama tahmin içindir; vergi/fatura ve gerçek satış fiyatı yerine geçmez.</p></section>
    {history.length > 0 && <section className="space-y-2 rounded-2xl border bg-card p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Son 10 hesaplama · bu cihaz</h2><Button variant="ghost" size="sm" onClick={() => { setHistory([]); try { localStorage.removeItem(`saha.cost-history:${me.data?.id ?? "local"}`); } catch { /* optional local storage */ } }}><Trash2/>Temizle</Button></div>{history.map((row)=><div key={row.id} className="flex items-center gap-3 border-t py-2 text-sm"><span className="min-w-0 flex-1 truncate">{row.name}<span className="ml-2 text-xs text-muted-foreground">{new Date(row.date).toLocaleDateString("tr-TR")}</span></span><strong className="num">{formatTL(row.gross)}</strong></div>)}</section>}
  </div>;
}

function MoneyField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label} · ₺</Label><Input id={id} type="number" min="0" max="1000000000" step="0.01" value={value} onChange={(e) => onChange(e.target.value)}/></div>;
}
