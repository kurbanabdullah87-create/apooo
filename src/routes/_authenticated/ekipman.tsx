import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Play, Pause, Wrench, ScanLine, Check, ArrowRightLeft, AlertTriangle, Clock, Package, PackagePlus, PackageMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDrawer } from "@/components/app/forms/FormDrawer";
import { RecordFields, type Field } from "@/components/app/RecordFields";
import { MediaTools } from "@/components/app/MediaTools";
import { CodeScanner } from "@/components/app/CodeScanner";
import { useUndoableDelete } from "@/lib/data";
import {
  useRecords,
  useSaveRecord,
  elapsedSeconds,
  depreciation,
  hourlyCharge,
  machineSeconds,
  maintenanceStatus,
  pageHead,
  type Payload,
  type WorkRecord,
} from "@/lib/work";

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = Date.parse(String(dateStr));
  if (!isFinite(d)) return null;
  return Math.floor((Date.now() - d) / 86_400_000);
}
import { todayISO, formatTL, formatDate } from "@/lib/finance";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/ekipman")({
  head: () => pageHead("Ekipman", "Ekipman sicili, bakım ve emanet takibi."),
  component: Equipment,
});

function Equipment() {
  const items = useRecords("equipment");
  const jobs = useRecords("job");
  const maintenance = useRecords("maintenance");
  const shopping = useRecords("shopping");
  const inventory = useRecords("inventory");
  const stockMovements = useRecords("stock_movement");
  const save = useSaveRecord("equipment");
  const saveShopping = useSaveRecord("shopping");
  const saveInventory = useSaveRecord("inventory");
  const delEquipment = useUndoableDelete("equipment");
  const delShopping = useUndoableDelete("shopping");

  const qc = useQueryClient();
  const [servicing, setServicing] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkRecord>();
  const [form, setForm] = useState<Payload>({});
  const [selected, setSelected] = useState<string>();
  const [tab, setTab] = useState("Ekipman");
  const [scan, setScan] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [shoppingText, setShoppingText] = useState("");
  const [borrower, setBorrower] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [stockItemOpen, setStockItemOpen] = useState(false);
  const [stockForm, setStockForm] = useState({ id: "", name: "", sku: "", unit: "adet", quantity: 0, minimum: 0, unit_cost: 0, notes: "" });
  const [movementOpen, setMovementOpen] = useState(false);
  const [movementForm, setMovementForm] = useState({ itemId: "", operation: "purchase", quantity: 1, jobId: "", notes: "" });
  const [movementBusy, setMovementBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fields: Field[] = [
    { key: "name", label: "Ekipman adı", required: true },
    { key: "code", label: "QR / barkod numarası" },
    { key: "purchased", label: "Alış tarihi", type: "date", required: true },
    { key: "price", label: "Alış bedeli (TL)", type: "number" },
    { key: "years", label: "Amortisman süresi (yıl)", type: "number" },
    { key: "maintenance_hours", label: "Bakım aralığı (saat)", type: "number", required: true },
    { key: "notes", label: "Sicil notları" },
  ];

  function edit(item?: WorkRecord) {
    setEditing(item);
    setForm(
      item?.payload ?? {
        name: "",
        purchased: todayISO(),
        price: 0,
        years: 5,
        maintenance_hours: 30,
        seconds: 0,
        last_service_seconds: 0,
      },
    );
    setOpen(true);
  }

  async function change(item: WorkRecord, p: Payload) {
    await save.mutateAsync({ id: item.id, payload: p });
  }

  const rows = (items.data ?? []).filter((i) => tab !== "Emanet" || i.payload.borrower);
  const stockRows = inventory.data ?? [];
  const lowStockRows = stockRows.filter((item) => Number(item.payload.quantity ?? 0) <= Number(item.payload.minimum ?? 0));

  function openStockForm(item?: WorkRecord) {
    setStockForm(item ? {
      id: item.id,
      name: String(item.payload.name ?? ""),
      sku: String(item.payload.sku ?? ""),
      unit: String(item.payload.unit ?? "adet"),
      quantity: Number(item.payload.quantity ?? 0),
      minimum: Number(item.payload.minimum ?? 0),
      unit_cost: Number(item.payload.unit_cost ?? 0),
      notes: String(item.payload.notes ?? ""),
    } : { id: "", name: "", sku: "", unit: "adet", quantity: 0, minimum: 0, unit_cost: 0, notes: "" });
    setStockItemOpen(true);
  }

  function openMovement(item: WorkRecord, operation: "purchase" | "use" | "return") {
    setMovementForm({ itemId: item.id, operation, quantity: 1, jobId: "", notes: "" });
    setMovementOpen(true);
  }

  async function recordMovement() {
    if (!movementForm.itemId || !Number.isFinite(movementForm.quantity) || movementForm.quantity <= 0) return void toast.error("Geçerli bir miktar girin.");
    if (!navigator.onLine) return void toast.error("Stok hareketi için internet bağlantısı gerekir.");
    setMovementBusy(true);
    const { error } = await supabase.rpc("record_stock_movement", {
      _item_id: movementForm.itemId,
      _operation: movementForm.operation,
      _quantity: movementForm.quantity,
      _notes: movementForm.notes.trim(),
      _job_id: movementForm.jobId || null,
    });
    setMovementBusy(false);
    if (error) return void toast.error("Stok hareketi kaydedilemedi: " + error.message);
    await qc.invalidateQueries({ queryKey: ["work"] });
    setMovementOpen(false);
    toast.success("Stok miktarı ve hareket geçmişi birlikte güncellendi.");
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Ekipman</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            title="QR / barkod tara"
            onClick={() => setScan(true)}
          >
            <ScanLine />
          </Button>
          {tab === "Stok" ? <Button size="sm" onClick={() => openStockForm()}><Plus/>Stok kalemi</Button> : <Button size="sm" onClick={() => edit()}><Plus/>Ekipman</Button>}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {["Ekipman", "Emanet", "Alınacaklar", "Stok"].map((t) => (
          <Button
            size="sm"
            key={t}
            variant={tab === t ? "default" : "secondary"}
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      {scan && (
        <CodeScanner
          onClose={() => setScan(false)}
          onRead={(code) => {
            const found = items.data?.find((i) => i.id === code || i.payload.code === code);
            setScan(false);
            if (found) {
              setTab("Ekipman");
              setSelected(found.id);
            } else toast.error("Bu koda ait ekipman bulunamadı.");
          }}
        />
      )}
      {tab === "Stok" ? (
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border bg-card p-3"><p className="text-xs text-muted-foreground">Stok kalemi</p><p className="mt-1 text-xl font-bold">{stockRows.length}</p></div>
            <div className={`rounded-2xl border p-3 ${lowStockRows.length ? "border-amber-500/40 bg-amber-500/10" : "bg-card"}`}><p className="text-xs text-muted-foreground">Azalan stok</p><p className={`mt-1 text-xl font-bold ${lowStockRows.length ? "text-amber-600 dark:text-amber-300" : ""}`}>{lowStockRows.length}</p></div>
          </div>
          {lowStockRows.length > 0 && <div role="status" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><p className="font-semibold">Yenileme gerekli</p><p className="mt-1 text-xs text-muted-foreground">Asgari seviyeye inen: {lowStockRows.slice(0, 4).map((item) => String(item.payload.name)).join(", ")}{lowStockRows.length > 4 ? ` ve ${lowStockRows.length - 4} kalem daha` : ""}.</p></div>}
          {stockRows.length === 0 && <div className="rounded-2xl border border-dashed p-7 text-center"><Package className="mx-auto size-7 text-muted-foreground"/><p className="mt-2 font-medium">Henüz stok kalemi yok</p><p className="mt-1 text-xs text-muted-foreground">Sahadaki malzemeleri ekleyip giriş, kullanım ve iade hareketlerini takip edin.</p><Button className="mt-3" size="sm" onClick={() => openStockForm()}><Plus/>İlk stok kalemini ekle</Button></div>}
          <div className="space-y-3">
            {stockRows.map((item) => {
              const quantity = Number(item.payload.quantity ?? 0);
              const minimum = Number(item.payload.minimum ?? 0);
              const low = quantity <= minimum;
              const history = (stockMovements.data ?? []).filter((movement) => movement.payload.item_id === item.id).slice(0, 3);
              return <article key={item.id} className="space-y-3 rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-semibold">{String(item.payload.name)}</h2><p className="mt-0.5 text-xs text-muted-foreground">{item.payload.sku ? `Kod: ${String(item.payload.sku)} · ` : ""}Asgari {minimum} {String(item.payload.unit ?? "adet")}</p></div><Button type="button" variant="ghost" size="sm" onClick={() => openStockForm(item)}>Düzenle</Button></div>
                <div className="flex items-end justify-between rounded-xl bg-secondary/60 p-3"><div><p className="text-xs text-muted-foreground">Mevcut miktar</p><p className={`num text-2xl font-bold ${low ? "text-amber-600 dark:text-amber-300" : ""}`}>{quantity} <span className="text-sm font-medium">{String(item.payload.unit ?? "adet")}</span></p></div><p className="text-right text-xs text-muted-foreground">Birim maliyet<br/><span className="num font-semibold text-foreground">{formatTL(Number(item.payload.unit_cost ?? 0))}</span></p></div>
                {item.payload.notes && <p className="text-xs text-muted-foreground">{String(item.payload.notes)}</p>}
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => openMovement(item, "purchase")}><PackagePlus className="size-4"/>Stok girişi</Button><Button size="sm" variant="secondary" disabled={quantity <= 0} onClick={() => openMovement(item, "use")}><PackageMinus className="size-4"/>Sahaya çıkar</Button><Button size="sm" variant="ghost" disabled={quantity <= 0} onClick={() => openMovement(item, "return")}><ArrowRightLeft className="size-4"/>İade al</Button></div>
                {history.length > 0 && <details className="border-t pt-2"><summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Son stok hareketleri</summary><div className="mt-2 space-y-1.5">{history.map((movement) => <div key={movement.id} className="flex items-center justify-between gap-2 text-xs"><span>{String(movement.payload.date ?? "")} · {movement.payload.operation === "use" ? "Sahaya çıkış" : movement.payload.operation === "return" ? "İade" : "Stok girişi"}{movement.payload.job_id ? ` · İş ${String(movement.payload.job_id).slice(0, 8)}` : ""}</span><span className="num font-semibold">{movement.payload.operation === "use" ? "−" : "+"}{Number(movement.payload.quantity)} {String(item.payload.unit ?? "adet")}</span></div>)}</div></details>}
              </article>;
            })}
          </div>
        </section>
      ) : tab === "Alınacaklar" ? (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (shoppingText.trim())
                saveShopping.mutate(
                  { payload: { name: shoppingText, done: false } },
                  { onSuccess: () => setShoppingText("") },
                );
            }}
          >
            <Input
              aria-label="Alınacak malzeme"
              value={shoppingText}
              onChange={(e) => setShoppingText(e.target.value)}
              required
            />
            <Button type="submit" aria-label="Listeye ekle">
              <Plus />
            </Button>
          </form>
          {shopping.data?.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 border-b py-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  aria-label={String(i.payload.name)}
                  checked={Boolean(i.payload.done)}
                  onChange={(e) =>
                    saveShopping.mutate({
                      id: i.id,
                      payload: { ...i.payload, done: e.target.checked },
                    })
                  }
                />
                <span className={i.payload.done ? "line-through text-muted-foreground" : ""}>
                  {i.payload.name}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 h-8 px-2"
                onClick={() => {
                  if (confirm("Bu malzemeyi listeden silmek istediğinize emin misiniz?")) {
                    delShopping(i.id);
                  }
                }}
              >
                Sil
              </Button>
            </div>
          ))}
        </>
      ) : (
        <>
          {items.error && <p className="text-destructive">Ekipmanlar yüklenemedi.</p>}
          {!rows.length && !items.isLoading && (
            <p className="py-8 text-center text-muted-foreground">Kayıt yok.</p>
          )}
          {rows.map((item) => {
            const p = item.payload;
            const seconds = elapsedSeconds(p, now); // yalnızca elle kronometre
            const total = machineSeconds(p, now); // kronometre + tamamlanan işler
            const m = maintenanceStatus(p, now);
            const blocked = m.remaining < -5 || p.maintenance_blocked === true;
            const mine = (jobs.data ?? []).filter((j) => j.payload.equipment_id === item.id && j.payload.billed);
            const earned = mine.reduce((t, j) => t + (Number(j.payload.hourly_rate) > 0 ? hourlyCharge(Number(j.payload.seconds ?? 0), Number(j.payload.hourly_rate)) : Number(j.payload.price ?? 0)), 0);
            const price = Number(p.price ?? 0);
            return (
              <article key={item.id} className="space-y-3 rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold break-words">{p.name}</h2>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelected(selected === item.id ? undefined : item.id);
                        setBorrower(String(p.borrower ?? ""));
                      }}
                    >
                      Sicil
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm("Bu ekipmanı silmek istediğinize emin misiniz?")) {
                          delEquipment(item.id);
                        }
                      }}
                    >
                      Sil
                    </Button>
                  </div>
                </div>
                <p className="num text-lg">{(total / 3600).toFixed(2)} saat <span className="text-xs text-muted-foreground">toplam çalışma</span></p>
                {blocked && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm font-semibold text-destructive">🔒 İş atama kilidi · eşik 5 saatten fazla aşıldı. Bakım kaydı girin.</p>}
                {!blocked && m.level === "over" && <p className="rounded-md bg-warning/10 p-2 text-sm font-semibold text-warning">🔴 Bakım zamanı geçti ({(-m.remaining).toFixed(1)} saat) — bakım planlayın</p>}
                {m.level === "warn" && <p className="rounded-md bg-warning/10 p-2 text-sm font-semibold text-warning">🟡 Bakım yaklaşıyor: {m.remaining.toFixed(1)} saat kaldı</p>}
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className={"h-full " + (m.level === "over" ? "bg-destructive" : m.level === "warn" ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(100, m.ratio * 100)}%` }} /></div>
                {mine.length > 0 && (
                  <p className="num text-xs text-muted-foreground">
                    {mine.length} iş · kazandırdığı {formatTL(earned)}{price > 0 ? ` · geri dönüş %${Math.round((earned / price) * 100)}` : ""}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Son bakımdan sonra {m.used.toFixed(2)} / {p.maintenance_hours} saat · {m.remaining >= 0 ? `${m.remaining.toFixed(1)} saat kaldı` : `${(-m.remaining).toFixed(1)} saat gecikti`}
                  </p>
                  {(() => {
                    const lastMaintenance = p.last_maintenance_date ?? p.last_serviced_at;
                    const days = daysSince(lastMaintenance == null ? null : String(lastMaintenance));
                    if (days === null) return null;
                    return (
                      <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${days > 60 ? "bg-destructive/15 text-destructive" : days > 30 ? "bg-warning/15 text-warning" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}>
                        <Clock className="size-2.5" />
                        {days}g önce bakım
                      </span>
                    );
                  })()}
                </div>
                {p.borrower && (
                  <p className="text-warning text-sm">
                    {p.borrower} · {p.borrowed_on ? formatDate(String(p.borrowed_on)) : ""}
                  </p>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={save.isPending}
                  onClick={() =>
                    void change(item, {
                      ...p,
                      seconds,
                      started_at: p.started_at ? null : new Date().toISOString(),
                    })
                  }
                >
                  {p.started_at ? <Pause /> : <Play />}
                  {p.started_at ? "Durdur" : "Çalıştır"}
                </Button>
                {(m.level === "warn" || m.level === "over" || blocked) && (
                  <Button variant="outline" size="sm" className="ml-2" onClick={() => setSelected(item.id)}>
                    <Wrench /> Bakım kaydı gir
                  </Button>
                )}
                {selected === item.id && (
                  <div className="space-y-4 border-t pt-3">
                    <p className="text-sm">
                      Alış: {p.purchased ? formatDate(String(p.purchased)) : "—"} ·{" "}
                      {formatTL(Number(p.price ?? 0))}
                    </p>
                    <p className="text-sm">
                      Kalan değer:{" "}
                      {formatTL(
                        depreciation(
                          Number(p.price ?? 0),
                          Number(p.years ?? 5),
                          String(p.purchased ?? todayISO()),
                        ),
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {p.notes} · Kod: {p.code || item.id}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => edit(item)}>
                      Sicili düzenle
                    </Button>
                    <MediaTools record={item} onSave={(p) => change(item, p)} />
                    <h3 className="font-semibold">Emanet</h3>
                    <Input
                      aria-label="Ekipman kimde"
                      value={borrower}
                      onChange={(e) => setBorrower(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!borrower.trim()}
                        onClick={() =>
                          void change(item, { ...p, borrower, borrowed_on: todayISO() })
                        }
                      >
                        <ArrowRightLeft />
                        Emanete ver
                      </Button>
                      {p.borrower && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            void change(item, { ...p, borrower: null, borrowed_on: null })
                          }
                        >
                          <Check />
                          Geri alındı
                        </Button>
                      )}
                    </div>
                    <h3 className="font-semibold">Bakım kaydı</h3>
                    <Input
                      aria-label="Bakım açıklaması"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <Input
                      type="number"
                      min="0"
                      aria-label="Bakım maliyeti"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={servicing || !navigator.onLine}
                      onClick={async () => {
                        if (Number(cost || 0) < 0) return void toast.error("Bakım maliyeti negatif olamaz");
                        setServicing(true);
                        // Sunucuda atomik: son bakım sayacı toplam saate eşitlenir, toplam çalışma saati korunur.
                        const { error } = await supabase.rpc("service_equipment", { _equipment_id: item.id, _note: note.trim() || "Periyodik bakım", _cost: Number(cost || 0) });
                        setServicing(false);
                        if (error) return void toast.error("Bakım kaydedilemedi: " + error.message);
                        await qc.invalidateQueries({ queryKey: ["work"] });
                        toast.success("Bakım kaydedildi; bakım sayacı güncellendi.");
                        setCost("");
                        setNote("");
                      }}
                    >
                      <Wrench />
                      Bakım yapıldı
                    </Button>
                    {!navigator.onLine && <p className="text-xs text-muted-foreground">Bakım kaydı için internet gerekir (sayaç sunucuda güvenle güncellenir).</p>}
                    {maintenance.data
                      ?.filter((m) => m.payload.equipment_id === item.id)
                      .map((m) => (
                        <p className="text-xs border-b py-2" key={m.id}>
                          {m.payload.date} · {m.payload.notes} · {formatTL(Number(m.payload.cost))}
                        </p>
                      ))}
                  </div>
                )}
              </article>
            );
          })}
        </>
      )}
      <FormDrawer
        open={stockItemOpen}
        onOpenChange={setStockItemOpen}
        title={stockForm.id ? "Stok kalemini düzenle" : "Yeni stok kalemi"}
        busy={saveInventory.isPending}
        onSubmit={() => {
          const name = stockForm.name.trim();
          if (!name) return void toast.error("Malzeme adı gerekli.");
          if (stockForm.quantity < 0 || stockForm.minimum < 0 || stockForm.unit_cost < 0) return void toast.error("Stok ve maliyet değerleri negatif olamaz.");
          const old = inventory.data?.find((item) => item.id === stockForm.id);
          saveInventory.mutate({ id: stockForm.id || undefined, payload: { ...old?.payload, _t: "inventory_item", name, sku: stockForm.sku.trim(), unit: stockForm.unit.trim() || "adet", quantity: stockForm.quantity, minimum: stockForm.minimum, unit_cost: stockForm.unit_cost, notes: stockForm.notes.trim() } }, { onSuccess: () => setStockItemOpen(false) });
        }}
      >
        <div className="space-y-2"><Label htmlFor="stock-name">Malzeme adı</Label><Input id="stock-name" required maxLength={120} value={stockForm.name} onChange={(event) => setStockForm({ ...stockForm, name: event.target.value })}/></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="stock-sku">Stok kodu</Label><Input id="stock-sku" maxLength={50} value={stockForm.sku} onChange={(event) => setStockForm({ ...stockForm, sku: event.target.value })}/></div><div className="space-y-2"><Label htmlFor="stock-unit">Birim</Label><Input id="stock-unit" maxLength={20} placeholder="adet, kg, litre…" value={stockForm.unit} onChange={(event) => setStockForm({ ...stockForm, unit: event.target.value })}/></div></div>
        <div className="grid grid-cols-3 gap-2"><div className="space-y-2"><Label htmlFor="stock-quantity">Başlangıç</Label><Input id="stock-quantity" type="number" min="0" step="0.001" inputMode="decimal" value={stockForm.quantity} onChange={(event) => setStockForm({ ...stockForm, quantity: Number(event.target.value) })}/></div><div className="space-y-2"><Label htmlFor="stock-min">Asgari</Label><Input id="stock-min" type="number" min="0" step="0.001" inputMode="decimal" value={stockForm.minimum} onChange={(event) => setStockForm({ ...stockForm, minimum: Number(event.target.value) })}/></div><div className="space-y-2"><Label htmlFor="stock-cost">Birim ₺</Label><Input id="stock-cost" type="number" min="0" step="0.01" inputMode="decimal" value={stockForm.unit_cost} onChange={(event) => setStockForm({ ...stockForm, unit_cost: Number(event.target.value) })}/></div></div>
        <div className="space-y-2"><Label htmlFor="stock-notes">Not</Label><Textarea id="stock-notes" maxLength={500} value={stockForm.notes} onChange={(event) => setStockForm({ ...stockForm, notes: event.target.value })}/></div>
      </FormDrawer>
      <FormDrawer
        open={movementOpen}
        onOpenChange={setMovementOpen}
        title={movementForm.operation === "use" ? "Malzemeyi sahaya çıkar" : movementForm.operation === "return" ? "Malzeme iadesi al" : "Stok girişi"}
        busy={movementBusy}
        onSubmit={() => { void recordMovement(); }}
      >
        <p className="rounded-xl bg-secondary/60 p-3 text-sm font-semibold">{String(inventory.data?.find((item) => item.id === movementForm.itemId)?.payload.name ?? "Stok kalemi")}</p>
        <div className="space-y-2"><Label htmlFor="stock-move-quantity">Miktar</Label><Input id="stock-move-quantity" type="number" min="0.001" step="0.001" inputMode="decimal" value={movementForm.quantity} onChange={(event) => setMovementForm({ ...movementForm, quantity: Number(event.target.value) })}/><p className="text-xs text-muted-foreground">Mevcut: {Number(inventory.data?.find((item) => item.id === movementForm.itemId)?.payload.quantity ?? 0)} {String(inventory.data?.find((item) => item.id === movementForm.itemId)?.payload.unit ?? "adet")}</p></div>
        {movementForm.operation === "use" && <div className="space-y-2"><Label htmlFor="stock-move-job">İlişkili iş emri (isteğe bağlı)</Label><select id="stock-move-job" className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={movementForm.jobId} onChange={(event) => setMovementForm({ ...movementForm, jobId: event.target.value })}><option value="">İş seçilmedi</option>{(jobs.data ?? []).filter((job) => job.payload.status !== "Tamamlandı").map((job) => <option key={job.id} value={job.id}>{String(job.payload.title ?? "İş")} · {String(job.payload.date ?? "")}</option>)}</select></div>}
        <div className="space-y-2"><Label htmlFor="stock-move-notes">Açıklama (isteğe bağlı)</Label><Textarea id="stock-move-notes" maxLength={500} value={movementForm.notes} onChange={(event) => setMovementForm({ ...movementForm, notes: event.target.value })}/></div>
        {!navigator.onLine && <p className="text-sm text-destructive">Stok hareketleri sunucuda atomik işlendiği için internet gerekir.</p>}
      </FormDrawer>
      <FormDrawer
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Sicili düzenle" : "Yeni ekipman"}
        busy={save.isPending}
        onSubmit={() =>
          save.mutate({ id: editing?.id, payload: form }, { onSuccess: () => setOpen(false) })
        }
      >
        <RecordFields fields={fields} value={form} onChange={setForm} />
      </FormDrawer>
    </div>
  );
}
