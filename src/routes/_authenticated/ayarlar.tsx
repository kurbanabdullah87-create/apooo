import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Save, UserPlus, LogOut, Fingerprint, LockKeyhole, Award, Link2, Loader2, Plus, X, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InstallButton } from "@/components/app/InstallButton";
import { useMe } from "@/hooks/use-me";
import { useRecords, useSaveRecord, pageHead, type Payload } from "@/lib/work";
import { useTemplates, useUpsert, useTransactions } from "@/lib/data";
import { createApprentice } from "@/lib/team.functions";
import { savePin, registerBiometric } from "@/lib/device-lock";
import { supabase } from "@/integrations/supabase/client";
import { todayISO, formatTL } from "@/lib/finance";
import { pendingCount, flushQueue } from "@/lib/offline";
import { IbanInput } from "@/components/app/IbanInput";
export const Route = createFileRoute("/_authenticated/ayarlar")({
  head: () => pageHead("Ayarlar", "Ekip, mesaj şablonları ve cihaz güvenliği."),
  component: Settings,
});
function Settings() {
  const me = useMe();
  const settings = useRecords("settings");
  const jobs = useRecords("job");
  const txs = useTransactions();
  const templates = useTemplates();
  const updateTemplate = useUpsert("message_templates");
  const save = useSaveRecord("settings");
  const create = useCreateServerFn();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<Payload>({ business: "Saha", target: 0 });
  const [pin, setPin] = useState("");
  const [team, setTeam] = useState({ username: "", password: "", name: "" });
  const [masterNameInput, setMasterNameInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [fieldMode, setFieldMode] = useState(() => { try { return localStorage.getItem("saha-field-mode") === "sunlight"; } catch { return false; } });
  const masterNameOptions = [...new Set(String(form.master_names ?? "").split(/\r?\n/).map((name) => name.trim()).filter(Boolean))];
  const addMasterName = () => {
    const name = masterNameInput.trim();
    if (!name) return;
    if (masterNameOptions.some((existing) => existing.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"))) {
      toast.error("Bu usta adı zaten ekli.");
      return;
    }
    setForm((current) => ({ ...current, master_names: [...masterNameOptions, name].join("\n") }));
    setMasterNameInput("");
  };
  const removeMasterName = (name: string) => {
    const remaining = masterNameOptions.filter((existing) => existing !== name);
    setForm((current) => ({ ...current, master_names: remaining.join("\n"), ...(current.master_report_name === name ? { master_report_name: "" } : {}) }));
  };
  useEffect(() => {
    if (settings.data?.[0]) setForm(settings.data[0].payload);
  }, [settings.data]);
  useEffect(() => {
    void pendingCount()
      .then(setCount)
      .catch(() => {});
  }, []);
  useEffect(() => {
    document.documentElement.dataset.fieldMode = fieldMode ? "sunlight" : "standard";
    try { localStorage.setItem("saha-field-mode", fieldMode ? "sunlight" : "standard"); } catch { /* device storage can be disabled */ }
  }, [fieldMode]);
  const completed = (jobs.data ?? []).filter((j) => j.payload.status === "Tamamlandı").length;
  const income = (txs.data ?? [])
    .filter((t) => t.kind === "payment" && t.occurred_on.startsWith(todayISO().slice(0, 7)))
    .reduce((s, t) => s + t.amount, 0);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ayarlar</h1>
      <div className="border-b pb-4">
        <p className="font-semibold">
          {me.data?.profile?.display_name || me.data?.profile?.username}
        </p>
        <p className="text-sm text-muted-foreground">{me.data?.isUsta ? "Usta" : "Çırak"}</p>
      </div>
      <InstallButton />
      {me.data?.isUsta && (
        <>
          <section className="space-y-3">
            <AccessibilitySettings />
            <BusinessHoursSettings value={String(form.working_hours_json ?? "")} onChange={(value) => setForm({ ...form, working_hours_json: value })}/>
            <h2 className="font-semibold">İşletme</h2>
            <label className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border bg-card p-3"><span><span className="block font-semibold">Saha modu · yüksek kontrast</span><span className="text-xs text-muted-foreground">Güneş ışığında daha net metin ve kenarlıklar</span></span><input type="checkbox" checked={fieldMode} onChange={(e) => setFieldMode(e.target.checked)}/></label>
            <Label htmlFor="business">Makbuz işletme adı</Label>
            <Input
              id="business"
              value={String(form.business ?? "")}
              onChange={(e) => setForm({ ...form, business: e.target.value })}
            />
            {([
              ["address", "Makbuz adresi"],
              ["phone", "İşletme telefonu"],
              ["tax", "Vergi dairesi / numarası"],
              ["iban", "IBAN"],
            ] as const).map(([k, l]) => (
              <div className="space-y-2" key={k}>
                <Label htmlFor={k}>{l}</Label>
                {k === "iban" ? <IbanInput id={k} value={String(form[k] ?? "")} onChange={(value) => setForm({ ...form, [k]: value })}/> : <Input id={k} value={String(form[k] ?? "")} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />}
              </div>
            ))}
            <div className="space-y-3 rounded-2xl border bg-card p-4">
              <div><Label htmlFor="master-name-input">Aynı hesaba usta adı ekle</Label><p className="mt-1 text-xs text-muted-foreground">Her usta/işveren adını ekleyin; giriş ve hesap yetkileri değişmez.</p></div>
              <div className="flex gap-2">
                <Input id="master-name-input" maxLength={80} value={masterNameInput} onChange={(e) => setMasterNameInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMasterName(); } }} placeholder="Örn. Abdullah Usta" />
                <Button type="button" variant="secondary" aria-label="Usta adı ekle" onClick={addMasterName}><Plus className="size-4"/>Ekle</Button>
              </div>
              {masterNameOptions.length > 0 ? <ul className="flex flex-wrap gap-2">{masterNameOptions.map((name) => <li key={name} className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-sm"><span className="truncate">{name}</span><button type="button" className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`${name} adını sil`} onClick={() => removeMasterName(name)}><X className="size-3.5"/></button></li>)}</ul> : <p className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">Henüz ek usta adı eklenmedi.</p>}
              <Label htmlFor="master-report-name">Yevmiye PDF’inde gösterilecek ad</Label>
              <select id="master-report-name" className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={String(form.master_report_name ?? "")} onChange={(e) => setForm({ ...form, master_report_name: e.target.value })}>
                <option value="">Profil adı · {me.data?.profile?.display_name || me.data?.profile?.username || "Usta"}</option>
                {masterNameOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <Label htmlFor="target">Aylık ciro hedefi (TL)</Label>
            <Input
              id="target"
              type="number"
              min="0"
              value={String(form.target ?? 0)}
              onChange={(e) => setForm({ ...form, target: Number(e.target.value) })}
            />
            <Button
              disabled={save.isPending}
              onClick={() => save.mutate({ id: settings.data?.[0]?.id, payload: form })}
            >
              <Save />
              Kaydet
            </Button>
          </section>
          <LaunchReadinessChecklist
            value={String(form.launch_checklist_v1 ?? "")}
            onChange={(value) => setForm((current) => ({ ...current, launch_checklist_v1: value }))}
            onSave={() => save.mutate({ id: settings.data?.[0]?.id, payload: form })}
            saving={save.isPending}
          />
          <section className="space-y-3 border-t pt-5">
            <h2 className="font-semibold">Çırak / eleman hesabı</h2>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await create({ data: team });
                  setTeam({ username: "", password: "", name: "" });
                  toast.success("Çırak hesabı açıldı");
                  qc.invalidateQueries();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Hesap açılamadı");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Label htmlFor="member-name">Ad Soyad</Label>
              <Input
                id="member-name"
                value={team.name}
                onChange={(e) => setTeam({ ...team, name: e.target.value })}
                required
              />
              <Label htmlFor="member-u">Kullanıcı adı</Label>
              <Input
                id="member-u"
                value={team.username}
                onChange={(e) => setTeam({ ...team, username: e.target.value })}
                required
              />
              <Label htmlFor="member-p">Şifre</Label>
              <Input
                id="member-p"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={team.password}
                onChange={(e) => setTeam({ ...team, password: e.target.value })}
                required
              />
              <Button disabled={busy}>
                <UserPlus />
                Hesap oluştur
              </Button>
            </form>
          </section>
          <section className="space-y-3 border-t pt-5">
            <h2 className="font-semibold">Mesaj şablonları</h2>
            {templates.data?.map((t) => (
              <TemplateEditor
                key={t.id}
                template={t}
                onSave={(body) => updateTemplate.mutate({ id: t.id, body })}
              />
            ))}
          </section>
          <section className="space-y-3 border-t pt-5">
            <h2 className="font-semibold">Başarılar</h2>
            <div className="flex items-center gap-3">
              <Award className={completed >= 100 ? "text-primary" : "text-muted-foreground"} />
              <div>
                <p>100. İş Tamamlandı</p>
                <p className="text-xs text-muted-foreground">{completed} / 100</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Award
                className={
                  Number(form.target) > 0 && income >= Number(form.target)
                    ? "text-primary"
                    : "text-muted-foreground"
                }
              />
              <div>
                <p>Aylık Ciro Hedefi</p>
                <p className="text-xs text-muted-foreground">
                  {formatTL(income)} / {formatTL(Number(form.target ?? 0))}
                </p>
              </div>
            </div>
          </section>
        </>
      )}
      <section className="space-y-3 border-t pt-5">
        <h2 className="font-semibold">Giriş yöntemlerini bağla</h2>
        <p className="text-sm text-muted-foreground">Eski hesabınla giriş yaptıktan sonra Google veya Apple hesabını buradan bağlayabilirsin. Bağladığında mevcut kayıtların aynı hesapta kalır.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={linkBusy} onClick={async () => {
            setLinkBusy(true);
            const { error } = await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: "select_account" } } });
            if (error) { toast.error("Google hesabı bağlanamadı. Supabase sağlayıcı ve hesap bağlama ayarlarını kontrol edin."); setLinkBusy(false); }
          }}>
            {linkBusy ? <Loader2 className="animate-spin"/> : <Link2/>}Google hesabını bağla
          </Button>
          <Button variant="outline" disabled={linkBusy} onClick={async () => {
            setLinkBusy(true);
            const { error } = await supabase.auth.linkIdentity({ provider: "apple", options: { redirectTo: `${window.location.origin}/auth/callback`, scopes: "email name" } });
            if (error) { toast.error("Apple hesabı bağlanamadı. Supabase sağlayıcı ve hesap bağlama ayarlarını kontrol edin."); setLinkBusy(false); }
          }}>
            {linkBusy ? <Loader2 className="animate-spin"/> : <Link2/>}Apple hesabını bağla
          </Button>
        </div>
      </section>
      <section className="space-y-3 border-t pt-5">
        <h2 className="font-semibold">Cihaz kilidi</h2>
        <Label htmlFor="pin">4 haneli PIN</Label>
        <Input
          id="pin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              if (!me.data) return;
              try {
                await savePin(me.data.id, pin);
                setPin("");
                toast.success("PIN etkinleştirildi");
                window.dispatchEvent(new Event("saha-lock"));
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "PIN kaydedilemedi");
              }
            }}
          >
            <LockKeyhole />
            PIN etkinleştir
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              if (!me.data) return;
              try {
                await registerBiometric(me.data.id);
                toast.success("Biyometrik cihaz kilidi etkinleştirildi");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Cihaz desteklemiyor");
              }
            }}
          >
            <Fingerprint />
            FaceID / Parmak izi
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (me.data) {
                localStorage.removeItem("saha-lock:" + me.data.id);
                localStorage.removeItem("saha-biometric:" + me.data.id);
                toast.success("Cihaz kilidi kapatıldı");
              }
            }}
          >
            Kilidi kapat
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Cihaz kilidi bu cihazdaki oturuma ek koruma sağlar; başka cihazlarda hesabınla yeniden doğrulama gerekir.
        </p>
      </section>
      <section className="space-y-2 border-t pt-5">
        <h2 className="font-semibold">Senkronizasyon</h2>
        <p className="text-sm text-muted-foreground">Bekleyen kayıt: {count}</p>
        <Button
          variant="secondary"
          onClick={async () => {
            await flushQueue();
            setCount(await pendingCount());
            qc.invalidateQueries();
          }}
        >
          Bekleyenleri gönder
        </Button>
      </section>
      <Button
        variant="destructive"
        className="w-full"
        onClick={async () => {
          await supabase.auth.signOut();
          qc.clear();
          navigate({ to: "/auth" });
        }}
      >
        <LogOut />
        Çıkış yap
      </Button>
    </div>
  );
}
function useCreateServerFn() {
  return useServerFn(createApprentice);
}
const launchChecklistGroups = [
  {
    title: "Kod ve kalite",
    items: [
      ["build", "Üretim derlemesi başarılı", "Vercel’in kullanacağı production build komutunu çalıştırın."],
      ["types", "TypeScript denetimi temiz", "Derlemenin geçmesi tek başına tip hatası olmadığını göstermez."],
      ["tests", "Otomatik testler başarılı", "Özellikle oturum, ekip yetkileri ve finans hesaplarını kontrol edin."],
      ["review", "Değişiklikler gözden geçirildi", "Son değişiklikleri ve bağımlılık güncellemelerini inceleyin."],
    ],
  },
  {
    title: "Vercel ve alan adı",
    items: [
      ["vercel-project", "Doğru GitHub deposu ve main dalı bağlı", "Vercel Project Settings → Git bölümünde doğrulayın."],
      ["deployment", "Son production deployment Ready ve doğru commit", "Deployment ayrıntısındaki commit ile main dalındaki son commit aynı olmalı."],
      ["env", "Production ortam değişkenleri güncel", "Supabase URL/anahtarları ve Google OAuth ayarlarını production ortamında kontrol edin."],
      ["domain", "Canlı alan adı, HTTPS ve yönlendirmeler çalışıyor", "Giriş, çıkış, geri dönüş adresleri ve hata sayfalarını deneyin."],
    ],
  },
  {
    title: "Veritabanı ve güvenlik",
    items: [
      ["migrations", "Bekleyen Supabase migrasyonları uygulandı", "Migration geçmişi ile kod deposundaki SQL dosyalarını karşılaştırın."],
      ["rls", "RLS ve ekipler arası veri ayrımı doğrulandı", "Usta ve çırak hesaplarıyla başka ekibin kayıtlarına erişilemediğini deneyin."],
      ["storage", "Dosya depolama izinleri ve bağlantı süreleri doğrulandı", "Dekont ve fotoğrafların yetkisiz, herkese açık URL ile açılmadığını kontrol edin."],
      ["backup", "Yedekleme ve geri yükleme yolu doğrulandı", "Yedeğin alınabildiğini ve geri yüklemenin nasıl yapılacağını belgeleyin."],
    ],
  },
  {
    title: "Oturum ve dayanıklılık",
    items: [
      ["auth", "Google ve parola girişi ile kalıcı oturum denendi", "Tarayıcıyı kapatıp açın; OAuth dönüş ve çıkış akışını da kontrol edin."],
      ["device-lock", "Cihaz kilidi ve biyometrik yedek akışı denendi", "Desteklenmeyen cihazda PIN/parola geri dönüşünü doğrulayın."],
      ["offline", "Çevrimdışı kuyruk yeniden deneme ve çift kayıt açısından denendi", "Bağlantı kesip kayıt oluşturun; yeniden bağlanınca bir kez eşitlendiğini doğrulayın."],
      ["monitoring", "Hata kayıtları ve izleme kişisel veriyi açığa çıkarmıyor", "İstemci ve sunucu loglarında parola, token ve finans verisi olmadığını kontrol edin."],
    ],
  },
  {
    title: "Ürün, erişilebilirlik ve mevzuat",
    items: [
      ["pwa", "Mobil PWA kurulumu ve güncellemesi doğrulandı", "Eski service worker önbelleğinden yeni sürüme geçişi de deneyin."],
      ["a11y", "Klavye, kontrast ve azaltılmış hareket kontrol edildi", "Telefon ve masaüstünde temel ekranları gözden geçirin."],
      ["finance", "Finans hesapları ve PDF raporları örneklerle mutabık", "Bilinen gelir, gider, yevmiye ve banka örneklerini çıktıyla karşılaştırın."],
      ["privacy", "KVKK, saklama, dışa aktarma ve silme süreçleri gözden geçirildi", "Gerekli aydınlatma, saklama süresi ve kullanıcı taleplerini doğrulayın."],
    ],
  },
  {
    title: "Canlı kullanım provası",
    items: [
      ["smoke", "Uçtan uca canlı prova tamamlandı", "Giriş, iş oluşturma, tahsilat, banka PDF’i, çıkış ve yeniden girişi deneyin."],
      ["support", "Sorun bildirme ve geri alma adımları hazır", "Sürüm sorunu halinde kimin ne yapacağını ve önceki sürüme dönüşü belirleyin."],
    ],
  },
] as const;
const launchChecklistIds = new Set(launchChecklistGroups.flatMap((group) => group.items.map(([id]) => id)));

function LaunchReadinessChecklist({
  value,
  onChange,
  onSave,
  saving,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const checked = (() => {
    try {
      const parsed: unknown = JSON.parse(value || "[]");
      return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && launchChecklistIds.has(item)) : []);
    } catch {
      return new Set<string>();
    }
  })();
  const total = launchChecklistGroups.reduce((sum, group) => sum + group.items.length, 0);
  const completed = checked.size;
  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(JSON.stringify([...next]));
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-primary/10 p-2 text-primary"><ShieldCheck className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Canlıya çıkış kontrol listesi</h2>
          <p className="mt-1 text-sm text-muted-foreground">Yayın öncesi teknik, güvenlik ve kullanım kontrollerini takip edin.</p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{completed}/{total}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Kontrol listesi ilerlemesi" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.min(100, (completed / total) * 100)}%` }} />
      </div>
      <div className="space-y-2">
        {launchChecklistGroups.map((group) => {
          const groupDone = group.items.filter(([id]) => checked.has(id)).length;
          return (
            <details key={group.title} className="rounded-xl border px-3">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <span>{group.title}</span><span className="text-xs text-muted-foreground">{groupDone}/{group.items.length}</span>
              </summary>
              <div className="space-y-2 pb-3">
                {group.items.map(([id, title, hint]) => (
                  <label key={id} className="flex cursor-pointer gap-3 rounded-xl bg-muted/40 p-3">
                    <input className="mt-0.5 size-4 shrink-0 accent-primary" type="checkbox" checked={checked.has(id)} onChange={() => toggle(id)} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-medium">{checked.has(id) && <CheckCircle2 className="size-4 shrink-0 text-primary" />}{title}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </details>
          );
        })}
      </div>
      <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">Bu liste kontrolleri kaydeder; işaretler otomatik doğrulama veya güvenlik sertifikası anlamına gelmez.</p>
        <Button type="button" className="shrink-0" disabled={saving} onClick={onSave}><Save className="size-4" />{saving ? "Kaydediliyor…" : "İlerlemeyi kaydet"}</Button>
      </div>
    </section>
  );
}
function AccessibilitySettings() {
  const [scale, setScale] = useState(() => { try { return localStorage.getItem("saha-text-scale") ?? "normal"; } catch { return "normal"; } });
  const [colorblind, setColorblind] = useState(() => { try { return localStorage.getItem("saha-colorblind") === "true"; } catch { return false; } });
  useEffect(() => {
    document.documentElement.dataset.textScale = scale;
    document.documentElement.dataset.colorblind = colorblind ? "true" : "false";
    try { localStorage.setItem("saha-text-scale", scale); localStorage.setItem("saha-colorblind", String(colorblind)); } catch { /* browser storage can be disabled */ }
  }, [scale, colorblind]);
  return <div className="space-y-3 rounded-2xl border bg-card p-4"><div><h3 className="font-semibold">Erişilebilirlik</h3><p className="text-xs text-muted-foreground">Yalnızca bu cihazda saklanır.</p></div><div className="space-y-2"><Label htmlFor="text-scale">Metin boyutu</Label><select id="text-scale" className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={scale} onChange={(event) => setScale(event.target.value)}><option value="small">Küçük</option><option value="normal">Normal</option><option value="large">Büyük</option><option value="xlarge">Çok büyük</option></select></div><label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3"><span><span className="block text-sm font-medium">Renk körlüğüne uygun işaretler</span><span className="text-xs text-muted-foreground">Durum renklerine ek olarak farklı çizgi desenleri kullan</span></span><input type="checkbox" checked={colorblind} onChange={(event) => setColorblind(event.target.checked)}/></label></div>;
}
type WorkDay = { open: boolean; start: string; end: string };
type WorkHours = { days: WorkDay[]; holidays: Array<{ date: string; label: string }> };
const defaultWorkHours: WorkHours = { days: [{ open: true, start: "08:00", end: "18:00" }, { open: true, start: "08:00", end: "18:00" }, { open: true, start: "08:00", end: "18:00" }, { open: true, start: "08:00", end: "18:00" }, { open: true, start: "08:00", end: "18:00" }, { open: true, start: "09:00", end: "14:00" }, { open: false, start: "09:00", end: "14:00" }], holidays: [] };
function readWorkHours(value: string): WorkHours {
  if (!value) return defaultWorkHours;
  try { const parsed = JSON.parse(value) as Partial<WorkHours>; return { days: Array.from({ length: 7 }, (_, index) => ({ ...defaultWorkHours.days[index]!, ...(parsed.days?.[index] ?? {}) })), holidays: Array.isArray(parsed.holidays) ? parsed.holidays.filter((holiday) => Boolean(holiday.date) && Boolean(holiday.label)) : [] }; }
  catch { return defaultWorkHours; }
}
function BusinessHoursSettings({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [holidayDate, setHolidayDate] = useState(""); const [holidayLabel, setHolidayLabel] = useState("");
  const data = readWorkHours(value);
  const write = (next: WorkHours) => onChange(JSON.stringify(next));
  const days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
  function addHoliday() { if (!holidayDate || !holidayLabel.trim()) return; if (data.holidays.some((holiday) => holiday.date === holidayDate)) return void toast.error("Bu tarih zaten tatil listesinde."); write({ ...data, holidays: [...data.holidays, { date: holidayDate, label: holidayLabel.trim().slice(0, 80) }].sort((a, b) => a.date.localeCompare(b.date)) }); setHolidayDate(""); setHolidayLabel(""); }
  return <details className="space-y-3 rounded-2xl border bg-card p-4"><summary className="cursor-pointer font-semibold">Çalışma saatleri ve tatiller</summary><p className="text-xs text-muted-foreground">Kapalı gün veya saat aralığı dışındaki randevular engellenir. Resmî tatilleri her yıl kontrol edip ekleyin.</p><div className="space-y-2">{days.map((day, index) => { const schedule = data.days[index] ?? defaultWorkHours.days[index]!; return <div key={day} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-xl border p-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={schedule.open} onChange={(event) => write({ ...data, days: data.days.map((entry, i) => i === index ? { ...entry, open: event.target.checked } : entry) })}/>{day}</label>{schedule.open && <><Input aria-label={`${day} açılış saati`} type="time" value={schedule.start} onChange={(event) => write({ ...data, days: data.days.map((entry, i) => i === index ? { ...entry, start: event.target.value } : entry) })}/><Input aria-label={`${day} kapanış saati`} type="time" value={schedule.end} onChange={(event) => write({ ...data, days: data.days.map((entry, i) => i === index ? { ...entry, end: event.target.value } : entry) })}/></>}</div>; })}</div><div className="space-y-2 border-t pt-3"><h3 className="text-sm font-semibold">Özel tatiller</h3><div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input type="date" aria-label="Tatil tarihi" value={holidayDate} onChange={(event) => setHolidayDate(event.target.value)}/><Input aria-label="Tatil adı" value={holidayLabel} maxLength={80} placeholder="Şirket tatili" onChange={(event) => setHolidayLabel(event.target.value)}/><Button type="button" variant="secondary" onClick={addHoliday}><Plus/>Ekle</Button></div>{data.holidays.map((holiday) => <div key={holiday.date} className="flex items-center justify-between gap-2 text-sm"><span>{holiday.date} · {holiday.label}</span><Button type="button" variant="ghost" size="icon" aria-label={`${holiday.label} tatilini sil`} onClick={() => write({ ...data, holidays: data.holidays.filter((entry) => entry.date !== holiday.date) })}><X className="size-4"/></Button></div>)}</div></details>;
}
function TemplateEditor({
  template,
  onSave,
}: {
  template: { title: string; body: string };
  onSave: (body: string) => void;
}) {
  const [body, setBody] = useState(template.body);
  return (
    <details className="border-b pb-3">
      <summary className="cursor-pointer text-sm font-medium">{template.title}</summary>
      <Textarea className="my-3" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      <Button variant="secondary" size="sm" onClick={() => onSave(body)}>
        <Save />
        Kaydet
      </Button>
    </details>
  );
}
