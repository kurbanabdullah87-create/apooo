import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Save, UserPlus, LogOut, Fingerprint, LockKeyhole, Award, Link2, Loader2, Plus, X, ShieldCheck, CheckCircle2, ArchiveRestore, Star, Trash2, Activity, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InstallButton } from "@/components/app/InstallButton";
import { useMe } from "@/hooks/use-me";
import { useRecords, useSaveRecord, pageHead, type Payload } from "@/lib/work";
import { useCustomers, useExpenses, useTemplates, useUpsert, useTransactions } from "@/lib/data";
import { createApprentice } from "@/lib/team.functions";
import { savePin, registerBiometric } from "@/lib/device-lock";
import { supabase } from "@/integrations/supabase/client";
import { todayISO, formatTL } from "@/lib/finance";
import { pendingCount, flushQueue } from "@/lib/offline";
import { IbanInput } from "@/components/app/IbanInput";
import { useBusinessProfile } from "@/lib/work-profile-context";
export const Route = createFileRoute("/_authenticated/ayarlar")({
  head: () => pageHead("Ayarlar", "Ekip, mesaj şablonları ve cihaz güvenliği."),
  component: Settings,
});
function Settings() {
  const me = useMe();
  const settings = useRecords("settings");
  const jobs = useRecords("job");
  const txs = useTransactions();
  const customers = useCustomers();
  const expenses = useExpenses();
  const templates = useTemplates();
  const updateTemplate = useUpsert("message_templates");
  const save = useSaveRecord("settings");
  const create = useCreateServerFn();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<Payload>({ business: "Yevmiye & Finans", target: 0 });
  const [pin, setPin] = useState("");
  const [team, setTeam] = useState({ username: "", password: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [fieldMode, setFieldMode] = useState(() => { try { return localStorage.getItem("saha-field-mode") === "sunlight"; } catch { return false; } });
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("saha-theme") ?? "ocean"; } catch { return "ocean"; } });
  const settingsRecord = settings.data?.find((row) => row.payload.key !== "navigation-preferences");
  useEffect(() => {
    if (settingsRecord) setForm(settingsRecord.payload);
  }, [settingsRecord]);
  useEffect(() => {
    void pendingCount()
      .then(setCount)
      .catch(() => {});
  }, []);
  useEffect(() => {
    document.documentElement.dataset.fieldMode = fieldMode ? "sunlight" : "standard";
    try { localStorage.setItem("saha-field-mode", fieldMode ? "sunlight" : "standard"); } catch { /* device storage can be disabled */ }
  }, [fieldMode]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("saha-theme", theme); } catch { /* browser storage can be disabled */ }
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#4fd1b5";
  }, [theme]);
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
      {me.data?.isAdmin && <AuthorizedAccounts />}
      {me.data?.isAdmin && <AdminUsageDashboard />}
      {me.data?.isAdmin && <PlanCampaignAdmin />}
      <section className="rounded-2xl border bg-card p-4"><h2 className="font-semibold">Plan ve erişim</h2><p className="mt-1 text-sm text-muted-foreground">{me.data?.hasFullAccess ? "Premium erişiminiz açık; tüm bölümler kullanılabilir." : "Ücretsiz planda Panel, işler, cari ve yevmiye kullanılabilir. Diğer bölümler görünür; kullanmak için Premium gerekir."}</p><Button asChild variant="outline" className="mt-3"><a href="/premium">Planı görüntüle</a></Button></section>
      <InstallButton />
      {me.data?.isUsta && (
        <>
          <DataHealth customers={customers.data ?? []} expenses={expenses.data ?? []} />
          <UsageStats userId={me.data.id} />
          <section className="space-y-3">
            <AccessibilitySettings />
            <ThemeSettings value={theme} onChange={setTheme} />
            <NavigationSettings />
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
            {me.data?.hasFullAccess ? <BusinessProfilesSettings /> : <p className="rounded-xl border border-primary/20 bg-primary/[.04] p-3 text-xs text-muted-foreground">Birden fazla usta/işletme profili Premium planında açılır.</p>}
            <Label htmlFor="target">Aylık ciro hedefi (TL)</Label>
            <Input
              id="target"
              type="number"
              min="0"
              value={String(form.target ?? 0)}
              onChange={(e) => setForm({ ...form, target: Number(e.target.value) })}
            />
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="monthly-jobs-target">Aylık tamamlanan iş hedefi</Label><Input id="monthly-jobs-target" type="number" min="0" step="1" value={String(form.monthly_jobs_target ?? 0)} onChange={(e) => setForm({ ...form, monthly_jobs_target: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}/></div><div className="space-y-2"><Label htmlFor="monthly-customers-target">Aylık yeni müşteri hedefi</Label><Input id="monthly-customers-target" type="number" min="0" step="1" value={String(form.monthly_customers_target ?? 0)} onChange={(e) => setForm({ ...form, monthly_customers_target: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}/></div></div>
            <Button
              disabled={save.isPending}
              onClick={() => save.mutate({ id: settingsRecord?.id, payload: form })}
            >
              <Save />
              Kaydet
            </Button>
          </section>
          <LaunchReadinessChecklist
            value={String(form.launch_checklist_v1 ?? "")}
            onChange={(value) => setForm((current) => ({ ...current, launch_checklist_v1: value }))}
              onSave={() => save.mutate({ id: settingsRecord?.id, payload: form })}
            saving={save.isPending}
          />
          {me.data?.hasFullAccess && <section className="space-y-3 border-t pt-5">
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
          </section>}
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

function AuthorizedAccounts() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const list = useQuery({ queryKey: ["authorized-emails"], queryFn: async () => {
    const { data, error } = await supabase.rpc("list_authorized_emails");
    if (error) throw error;
    return data ?? [];
  }});
  const change = useMutation({ mutationFn: async ({ email: target, enabled }: { email: string; enabled: boolean }) => {
    const { error } = await supabase.rpc("set_authorized_email", { _email: target, _enabled: enabled });
    if (error) throw error;
  }, onSuccess: async () => { setEmail(""); toast.success("Yetkili hesap listesi güncellendi."); await qc.invalidateQueries({ queryKey: ["authorized-emails"] }); }, onError: (error: Error) => toast.error(error.message) });
  return <section className="space-y-3 rounded-2xl border border-primary/20 bg-primary/[.035] p-4"><div><h2 className="font-semibold">Yönetici · yetkili hesaplar</h2><p className="mt-1 text-xs text-muted-foreground">Tam erişim yalnızca burada listelenen, e-postası doğrulanmış kayıtlı hesaplara verilir. Şifre girmeyin veya paylaşmayın.</p></div>{list.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Yönetici listesi yüklenemedi. Oturum e-postasının doğrulandığını ve yönetici yetkisinin tanımlandığını kontrol edin.</p>}<form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (email.trim()) change.mutate({ email: email.trim(), enabled: true }); }}><Input type="email" autoComplete="off" required maxLength={254} placeholder="kullanici@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /><Button disabled={change.isPending}>Yetkili ekle</Button></form><div className="space-y-2">{list.data?.map((item) => <div key={item.email} className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3 text-sm"><span className="truncate">{item.email}</span><Button variant="outline" size="sm" disabled={change.isPending || item.email === "abdullahkurban670@gmail.com"} onClick={() => change.mutate({ email: item.email, enabled: false })}>Erişimi kaldır</Button></div>)}</div></section>;
}

function localDateTime(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

type AdminUsageSummary = {
  day: { users: number; sessions: number; views: number };
  month: { users: number; sessions: number; views: number };
  all_time: { users: number; sessions: number; views: number };
  modules: { module: string; views: number }[];
  users: { id: string; email: string; last_seen: string; sessions: number; views: number }[];
};
const usageModuleNames: Record<string, string> = { app: "Uygulama oturumu", panel: "Ana sayfa", isler: "İşler", cari: "Cari", yevmiye: "Yevmiye", ekipman: "Ekipman", doviz: "Döviz", banka: "Banka", randevu: "Randevu", rapor: "Raporlar", ayarlar: "Ayarlar", premium: "Planlar", giderler: "Giderler", alim: "Alımlar", borc: "Borçlar", puantaj: "Puantaj", hava: "Hava", hesaplayici: "Hesaplayıcı", other: "Diğer" };
function AdminUsageDashboard() {
  const usage = useQuery({ queryKey: ["admin-usage-summary"], queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_usage_summary");
    if (error) throw error;
    return data as unknown as AdminUsageSummary;
  }, staleTime: 60_000 });
  const periods = [{ label: "Bugün", values: usage.data?.day }, { label: "Bu ay", values: usage.data?.month }, { label: "Tüm zamanlar", values: usage.data?.all_time }];
  return <section className="space-y-4 rounded-2xl border bg-card p-4">
    <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Activity className="size-5 text-primary"/><div><h2 className="font-semibold">Uygulama kullanımı</h2><p className="text-xs text-muted-foreground">Gizliliği koruyan, bölüm düzeyinde ziyaret ve oturum özeti</p></div></div><Button variant="outline" size="sm" onClick={() => void usage.refetch()} disabled={usage.isFetching}><RefreshCw className={`mr-2 size-4 ${usage.isFetching ? "animate-spin" : ""}`}/>Yenile</Button></div>
    {usage.error ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Kullanım raporu alınamadı. Veritabanı güncellemesi henüz tamamlanmamış olabilir.</p> : <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{periods.map(({ label, values }) => <article key={label} className="rounded-xl border bg-background/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{values?.users ?? 0} <span className="text-xs font-normal text-muted-foreground">kişi</span></p><p className="text-xs text-muted-foreground">{values?.sessions ?? 0} oturum · {values?.views ?? 0} sayfa ziyareti</p></article>)}</div>
      <div className="grid gap-4 md:grid-cols-2"><div><h3 className="mb-2 text-sm font-semibold">En çok ziyaret edilen bölümler</h3><div className="space-y-1">{(usage.data?.modules ?? []).slice(0, 8).map((item) => <div key={item.module} className="flex justify-between rounded-lg bg-background/40 px-3 py-2 text-sm"><span>{usageModuleNames[item.module] ?? item.module}</span><span className="num text-muted-foreground">{item.views}</span></div>)}{!usage.data?.modules?.length && <p className="text-xs text-muted-foreground">Henüz ziyaret kaydı yok.</p>}</div></div>
        <div><h3 className="mb-2 text-sm font-semibold">Son aktif hesaplar</h3><div className="max-h-64 space-y-1 overflow-auto">{(usage.data?.users ?? []).map((user) => <div key={user.id} className="rounded-lg bg-background/40 px-3 py-2"><div className="truncate text-sm">{user.email}</div><div className="flex justify-between gap-2 text-[11px] text-muted-foreground"><span>{user.sessions} oturum · {user.views} ziyaret</span><time>{new Date(user.last_seen).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</time></div></div>)}{!usage.data?.users?.length && <p className="text-xs text-muted-foreground">Henüz kullanım kaydı yok.</p>}</div></div></div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">Yalnızca oturum, bölüm ziyareti ve zaman bilgisi kaydedilir. Banka hareketleri, e-posta içeriği, formlara yazılanlar ve işlem ayrıntıları izlenmez. Rapor yalnızca yönetici hesabına açıktır.</p>
    </>}
  </section>;
}

function PlanCampaignAdmin() {
  const qc = useQueryClient();
  const pricing = useQuery({ queryKey: ["plan-catalog"], queryFn: async () => {
    const { data, error } = await supabase.rpc("get_plan_catalog");
    if (error) throw error;
    return data ?? [];
  }});
  const campaigns = useQuery({ queryKey: ["plan-campaigns"], queryFn: async () => {
    const { data, error } = await supabase.rpc("list_plan_campaigns");
    if (error) throw error;
    return data ?? [];
  }});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [form, setForm] = useState(() => ({ id: null as string | null, title: "", description: "", discount: "10", appliesTo: "all", startsAt: localDateTime(new Date()), endsAt: localDateTime(new Date(Date.now() + 7 * 86400_000)), enabled: false }));
  useEffect(() => {
    if (pricing.data) setPrices(Object.fromEntries(pricing.data.filter((plan) => plan.plan_code !== "free").map((plan) => [plan.plan_code, String(plan.amount)])));
  }, [pricing.data]);
  const savePrice = useMutation({ mutationFn: async (planCode: string) => {
    const { error } = await supabase.rpc("set_plan_price", { _plan_code: planCode, _amount: Number(prices[planCode]) });
    if (error) throw error;
  }, onSuccess: async () => { toast.success("Plan fiyatı güncellendi."); await qc.invalidateQueries({ queryKey: ["plan-catalog"] }); }, onError: () => toast.error("Fiyat güncellenemedi.") });
  const saveCampaign = useMutation({ mutationFn: async () => {
    const { error } = await supabase.rpc("save_plan_campaign", { _id: form.id, _title: form.title, _description: form.description, _discount_percent: Number(form.discount), _applies_to: form.appliesTo, _starts_at: new Date(form.startsAt).toISOString(), _ends_at: new Date(form.endsAt).toISOString(), _enabled: form.enabled });
    if (error) throw error;
  }, onSuccess: async () => { toast.success("Kampanya kaydedildi."); setForm((current) => ({ ...current, id: null, title: "", description: "", enabled: false })); await qc.invalidateQueries({ queryKey: ["plan-campaigns"] }); }, onError: () => toast.error("Kampanya kaydedilemedi. Tarihleri ve alanları kontrol edin.") });
  const updateCampaign = useMutation({ mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
    const current = campaigns.data?.find((campaign) => campaign.id === id);
    if (!current) throw new Error("Kampanya bulunamadı.");
    const { error } = await supabase.rpc("save_plan_campaign", { _id: id, _title: current.title, _description: current.description, _discount_percent: current.discount_percent, _applies_to: current.applies_to, _starts_at: current.starts_at, _ends_at: current.ends_at, _enabled: enabled });
    if (error) throw error;
  }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["plan-campaigns"] }); }, onError: () => toast.error("Kampanya güncellenemedi.") });
  const removeCampaign = useMutation({ mutationFn: async (id: string) => {
    const { error } = await supabase.rpc("delete_plan_campaign", { _id: id });
    if (error) throw error;
  }, onSuccess: async () => { toast.success("Kampanya silindi."); await qc.invalidateQueries({ queryKey: ["plan-campaigns"] }); }, onError: () => toast.error("Kampanya silinemedi.") });
  return <section className="space-y-4 rounded-2xl border bg-card p-4"><div><h2 className="font-semibold">Plan fiyatları ve kampanyalar</h2><p className="mt-1 text-xs text-muted-foreground">Fiyat ve kampanyaları yalnızca yönetici değiştirebilir. Kampanya, belirtilen tarih aralığında plan ekranında görünür; ödeme sağlayıcısı bağlanmadan indirim tahsilatı veya Premium erişimi başlatmaz.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">{pricing.data?.filter((plan) => plan.plan_code !== "free").map((plan) => <form key={plan.plan_code} className="flex items-end gap-2 rounded-xl border p-3" onSubmit={(event) => { event.preventDefault(); savePrice.mutate(plan.plan_code); }}><div className="min-w-0 flex-1"><Label htmlFor={`plan-price-${plan.plan_code}`}>{plan.plan_code === "premium_monthly" ? "Premium · aylık" : "Premium · yıllık"}</Label><Input id={`plan-price-${plan.plan_code}`} type="number" min="1" max="100000" step="0.01" value={prices[plan.plan_code] ?? String(plan.amount)} onChange={(event) => setPrices((current) => ({ ...current, [plan.plan_code]: event.target.value }))}/></div><Button size="sm" disabled={savePrice.isPending}>Fiyatı kaydet</Button></form>)}</div>
    <form className="space-y-3 rounded-xl border p-3" onSubmit={(event) => { event.preventDefault(); saveCampaign.mutate(); }}><h3 className="font-medium">{form.id ? "Kampanyayı düzenle" : "Yeni kampanya oluştur"}</h3><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="campaign-title">Kampanya adı</Label><Input id="campaign-title" required minLength={3} maxLength={80} placeholder="Örn. İlk yıl fırsatı" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/></div><div className="space-y-1"><Label htmlFor="campaign-discount">İndirim (%)</Label><Input id="campaign-discount" type="number" required min="1" max="80" value={form.discount} onChange={(event) => setForm({ ...form, discount: event.target.value })}/></div><div className="space-y-1"><Label htmlFor="campaign-applies">Uygulanacak plan</Label><select id="campaign-applies" className="h-10 w-full rounded-xl border bg-background px-3 text-sm" value={form.appliesTo} onChange={(event) => setForm({ ...form, appliesTo: event.target.value })}><option value="all">Aylık ve yıllık</option><option value="premium_monthly">Yalnızca aylık</option><option value="premium_annual">Yalnızca yıllık</option></select></div><div className="space-y-1"><Label htmlFor="campaign-description">Açıklama</Label><Input id="campaign-description" maxLength={240} placeholder="Kısa kampanya açıklaması" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></div><div className="space-y-1"><Label htmlFor="campaign-start">Başlangıç</Label><Input id="campaign-start" type="datetime-local" required value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })}/></div><div className="space-y-1"><Label htmlFor="campaign-end">Bitiş</Label><Input id="campaign-end" type="datetime-local" required value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })}/></div></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })}/>Kaydeder kaydetmez etkinleştir</label><div className="flex gap-2"><Button disabled={saveCampaign.isPending}>{form.id ? "Değişiklikleri kaydet" : "Kampanyayı kaydet"}</Button>{form.id && <Button type="button" variant="outline" onClick={() => setForm((current) => ({ ...current, id: null, title: "", description: "", enabled: false }))}>Düzenlemeyi iptal et</Button>}</div></form>
    {campaigns.error && <p role="alert" className="text-sm text-destructive">Kampanyalar yüklenemedi. Veritabanı güncellemesi tamamlandıktan sonra yenileyin.</p>}
    <div className="space-y-2">{campaigns.data?.map((campaign) => <article key={campaign.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="font-medium">{campaign.title} · %{campaign.discount_percent}</p><p className="text-xs text-muted-foreground">{campaign.description || "Açıklama yok"} · {new Date(campaign.starts_at).toLocaleString("tr-TR")} – {new Date(campaign.ends_at).toLocaleString("tr-TR")}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setForm({ id: campaign.id, title: campaign.title, description: campaign.description, discount: String(campaign.discount_percent), appliesTo: campaign.applies_to, startsAt: localDateTime(new Date(campaign.starts_at)), endsAt: localDateTime(new Date(campaign.ends_at)), enabled: campaign.enabled })}>Düzenle</Button><Button variant="outline" size="sm" disabled={updateCampaign.isPending} onClick={() => updateCampaign.mutate({ id: campaign.id, enabled: !campaign.enabled })}>{campaign.enabled ? "Durdur" : "Etkinleştir"}</Button><Button variant="destructive" size="sm" disabled={removeCampaign.isPending} onClick={() => { if (confirm("Bu kampanya silinsin mi?")) removeCampaign.mutate(campaign.id); }}>Sil</Button></div></article>)}</div>
  </section>;
}

function useCreateServerFn() {
  return useServerFn(createApprentice);
}
function DataHealth({ customers, expenses }: {
  customers: NonNullable<ReturnType<typeof useCustomers>["data"]>;
  expenses: NonNullable<ReturnType<typeof useExpenses>["data"]>;
}) {
  const missingPhone = customers.filter((customer) => !customer.phone?.trim()).length;
  const missingLocation = customers.filter((customer) => customer.latitude == null || customer.longitude == null).length;
  const missingReceipt = expenses.filter((expense) => expense.amount > 500 && !expense.receipt_photo_url).length;
  const missingCategory = expenses.filter((expense) => !expense.category).length;
  const checks = [["Telefonu olmayan müşteri", missingPhone], ["Konumu kayıtlı olmayan müşteri", missingLocation], ["500 ₺ üzeri fişsiz gider", missingReceipt], ["Kategorisiz gider", missingCategory]] as const;
  return <section className="space-y-3 rounded-2xl border bg-card p-4"><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary"/><div><h2 className="font-semibold">Veri sağlığı</h2><p className="text-xs text-muted-foreground">Mevcut kayıtlardaki eksik alanların özeti</p></div></div><div className="grid grid-cols-2 gap-2">{checks.map(([label, value]) => <div key={label} className="flex min-h-16 items-center justify-between gap-2 rounded-xl border bg-background/40 p-3"><span className="text-xs leading-snug text-muted-foreground">{label}</span><span className={`num text-lg font-bold ${value ? "text-warning" : "text-success"}`}>{value}</span></div>)}</div><p className="text-[11px] leading-relaxed text-muted-foreground">Bu özet yalnızca kayıt alanlarını sayar; belgelerin doğruluğunu veya yasal uygunluğunu denetlemez.</p></section>;
}
function UsageStats({ userId }: { userId: string }) {
  const [usage, setUsage] = useState<Record<string, number>>({});
  useEffect(() => {
    const read = () => {
      try {
        const value: unknown = JSON.parse(localStorage.getItem(`saha-usage:${userId}`) ?? "{}");
        setUsage(value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, number> : {});
      } catch { setUsage({}); }
    };
    read();
    const timer = window.setInterval(read, 30_000);
    return () => window.clearInterval(timer);
  }, [userId]);
  const pages = Object.entries(usage).filter(([, seconds]) => Number.isFinite(seconds) && seconds > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const labels: Record<string, string> = { "/panel": "Panel", "/isler": "İşler", "/cari": "Cari", "/yevmiye": "Yevmiye", "/ekipman": "Ekipman", "/doviz": "Döviz", "/banka": "Banka", "/randevu": "Randevular", "/rapor": "Raporlar" };
  const duration = (seconds: number) => seconds >= 3600 ? `${(seconds / 3600).toFixed(1)} sa` : `${Math.max(1, Math.round(seconds / 60))} dk`;
  return <details className="rounded-2xl border bg-card p-4"><summary className="cursor-pointer list-none font-semibold">Bu cihazdaki kullanım özeti</summary><p className="mt-1 text-xs text-muted-foreground">Sayfada geçirilen süre yerel depolamada tutulur, dışarı gönderilmez.</p>{pages.length ? <ul className="mt-3 space-y-2">{pages.map(([path, seconds]) => <li key={path} className="flex items-center justify-between rounded-xl bg-background/40 px-3 py-2 text-sm"><span>{labels[path] ?? path}</span><span className="num font-semibold text-primary">{duration(seconds)}</span></li>)}</ul> : <p className="mt-3 rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">Kullanım özeti oluşturmak için uygulamayı kullanmaya devam edin.</p>}</details>;
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
const launchChecklistIds: Set<string> = new Set(launchChecklistGroups.flatMap((group) => group.items.map(([id]) => id)));

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
        <div className="liquid-fill h-full rounded-full" style={{ width: `${Math.min(100, (completed / total) * 100)}%` }} />
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
  const [vision, setVision] = useState(() => { try { return localStorage.getItem("saha-color-vision") ?? (localStorage.getItem("saha-colorblind") === "true" ? "deuteranopia" : "standard"); } catch { return "standard"; } });
  const [highContrast, setHighContrast] = useState(() => { try { return localStorage.getItem("saha-high-contrast") === "true"; } catch { return false; } });
  useEffect(() => {
    document.documentElement.dataset.textScale = scale;
    document.documentElement.dataset.colorVision = vision;
    document.documentElement.dataset.highContrast = highContrast ? "true" : "false";
    try { localStorage.setItem("saha-text-scale", scale); localStorage.setItem("saha-color-vision", vision); localStorage.setItem("saha-high-contrast", String(highContrast)); } catch { /* browser storage can be disabled */ }
  }, [scale, vision, highContrast]);
  const scales = [["tiny", "Çok küçük · 12px"], ["small", "Küçük · 14px"], ["normal", "Normal · 16px"], ["large", "Büyük · 18px"], ["xlarge", "Çok büyük · 20px"], ["accessible", "Erişilebilir · 22px"], ["lowvision", "Görme güçlüğü · 26px"]] as const;
  const changeScale = (direction: -1 | 1) => { const index = scales.findIndex(([id]) => id === scale); setScale(scales[Math.max(0, Math.min(scales.length - 1, (index < 0 ? 2 : index) + direction))]![0]); };
  return <div className="space-y-3 rounded-2xl border bg-card p-4"><div><h3 className="font-semibold">Erişilebilirlik</h3><p className="text-xs text-muted-foreground">Seçimler bu cihazda saklanır ve anında uygulanır.</p></div><div className="space-y-2"><Label htmlFor="text-scale">Metin boyutu</Label><div className="flex gap-2"><Button type="button" variant="outline" aria-label="Metin boyutunu küçült" onClick={() => changeScale(-1)}>A−</Button><select id="text-scale" className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm" value={scale} onChange={(event) => setScale(event.target.value)}>{scales.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><Button type="button" variant="outline" aria-label="Metin boyutunu büyüt" onClick={() => changeScale(1)}>A+</Button></div><p className="rounded-lg bg-secondary/60 p-2 text-[length:1em]">Örnek metin · seçili boyut anında uygulanır.</p></div><div className="space-y-2"><Label htmlFor="color-vision">Renk ayırt etme paleti</Label><select id="color-vision" className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={vision} onChange={(event) => setVision(event.target.value)}><option value="standard">Standart</option><option value="deuteranopia">Kırmızı-yeşil · deuteranopi</option><option value="protanopia">Kırmızı-yeşil · protanopi</option><option value="tritanopia">Mavi-sarı · tritanopi</option></select><p className="text-[11px] text-muted-foreground">Durum renkleri her palette farklı tonlara çevrilir ve ikon/metin işaretleri korunur; tıbbi renk testi değildir.</p></div><label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3"><span><span className="block text-sm font-medium">Yüksek kontrast</span><span className="text-xs text-muted-foreground">Metin, sınır ve klavye odaklarını belirginleştir</span></span><input type="checkbox" checked={highContrast} onChange={(event) => setHighContrast(event.target.checked)}/></label></div>;
}

const mobileNavigationChoices = [
  ["/panel", "Panel"], ["/isler", "İşler"], ["/cari", "Cari"], ["/yevmiye", "Yevmiye"], ["/ekipman", "Ekipman"], ["/doviz", "Döviz"],
  ["/randevu", "Randevular"], ["/rapor", "Rapor"], ["/banka", "Banka"], ["/giderler", "Giderler"], ["/hava", "Hava"], ["/borc", "Borç"], ["/ayarlar", "Ayarlar"],
] as const;
const defaultMobileNavigation = ["/panel", "/isler", "/cari", "/yevmiye", "/ekipman"];
function NavigationSettings() {
  const me = useMe();
  const settings = useRecords("settings");
  const save = useSaveRecord("settings");
  const [selected, setSelected] = useState<string[]>(() => { try { const saved = localStorage.getItem("saha-mobile-nav"); const list = saved?.split("|").filter((path) => mobileNavigationChoices.some(([route]) => route === path)); return list?.length === 5 ? list : [...defaultMobileNavigation]; } catch { return [...defaultMobileNavigation]; } });
  const [quickAdd, setQuickAdd] = useState(() => { try { return localStorage.getItem("saha-mobile-quick-add") !== "false"; } catch { return true; } });
  const [dragged, setDragged] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const row = settings.data?.find((item) => item.payload.key === "navigation-preferences");
  useEffect(() => {
    if (typeof row?.payload.mobile_nav !== "string") return;
    const list = row.payload.mobile_nav.split("|").filter((path) => mobileNavigationChoices.some(([route]) => route === path));
    if (list.length === 5) setSelected(list);
    if (typeof row.payload.quick_add_visible === "boolean") setQuickAdd(row.payload.quick_add_visible);
  }, [row]);
  function move(path: string, target: number) {
    setSelected((current) => { const from = current.indexOf(path); if (from < 0 || target < 0 || target >= current.length) return current; const next = [...current]; next.splice(from, 1); next.splice(target, 0, path); return next; });
  }
  async function persist() {
    if (selected.length !== 5 || !me.data?.id) { toast.error("Alt menüde tam 5 sayfa seçin."); return; }
    setBusy(true);
    try {
      await save.mutateAsync({ id: row?.id, owner_id: me.data.id, payload: { ...(row?.payload ?? {}), key: "navigation-preferences", mobile_nav: selected.join("|"), quick_add_visible: quickAdd } });
      try { localStorage.setItem("saha-mobile-nav", selected.join("|")); localStorage.setItem("saha-mobile-quick-add", String(quickAdd)); } catch { /* cloud preference is primary */ }
      toast.success("Mobil gezinme tercihiniz kaydedildi.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Gezinme tercihi kaydedilemedi."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-2xl border bg-card p-4"><div><h3 className="font-semibold">Mobil alt menü</h3><p className="text-xs text-muted-foreground">En sık kullandığınız 5 bölümü seçip sıralayın. Diğer tüm bölümler “Daha fazla” menüsünde kalır.</p></div><div className="space-y-1.5" aria-label="Seçili alt menü sırası">{selected.map((path, index) => <div key={path} draggable onDragStart={() => setDragged(path)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged) move(dragged, index); setDragged(null); }} className="flex min-h-11 items-center gap-2 rounded-xl border bg-background px-2.5"><span aria-hidden="true" className="select-none text-muted-foreground">⠿</span><span className="flex-1 text-sm font-medium">{mobileNavigationChoices.find(([route]) => route === path)?.[1] ?? path}</span><button type="button" disabled={index === 0} onClick={() => move(path, index - 1)} className="min-h-9 rounded-lg px-2 text-xs text-primary disabled:opacity-35" aria-label="Yukarı taşı">Yukarı</button><button type="button" disabled={index === selected.length - 1} onClick={() => move(path, index + 1)} className="min-h-9 rounded-lg px-2 text-xs text-primary disabled:opacity-35" aria-label="Aşağı taşı">Aşağı</button><button type="button" onClick={() => setSelected((current) => current.filter((route) => route !== path))} className="min-h-9 rounded-lg px-2 text-xs text-destructive" aria-label={`${mobileNavigationChoices.find(([route]) => route === path)?.[1]} seçimini kaldır`}>Kaldır</button></div>)}</div><div className="grid grid-cols-2 gap-2">{mobileNavigationChoices.filter(([path]) => !selected.includes(path)).map(([path, label]) => <label key={path} className="flex min-h-10 items-center gap-2 rounded-lg border px-2 text-xs"><input type="checkbox" checked={false} disabled={selected.length >= 5} onChange={() => { if (selected.length < 5) setSelected((current) => [...current, path]); }}/>{label}</label>)}</div><p className="text-[11px] text-muted-foreground">Seçili: {selected.length}/5 · Sıralamayı sürükleyerek veya Yukarı/Aşağı düğmeleriyle değiştirebilirsiniz.</p><label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3"><span className="text-sm font-medium">Ortadaki hızlı ekle düğmesi</span><input type="checkbox" checked={quickAdd} onChange={(event) => setQuickAdd(event.target.checked)}/></label><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setSelected([...defaultMobileNavigation])}>Varsayılana dön</Button><Button type="button" disabled={busy || selected.length !== 5} onClick={() => void persist()}>{busy ? "Kaydediliyor…" : "Alt menüyü kaydet"}</Button></div></section>;
}

function BusinessProfilesSettings() {
  const me = useMe();
  const profileState = useBusinessProfile();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [hourlyRate, setHourlyRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [details, setDetails] = useState<Record<string, { phone: string; currency: string; hourlyRate: string }>>({});
  const profileBackendReady = profileState.isUsta || profileState.loading;
  async function createProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || !me.data?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("business_profiles").insert({ team_id: me.data.id, created_by: me.data.id, name: cleanName, description: description.trim() || null, phone: phone.trim() || null, currency, default_hourly_rate: hourlyRate ? Number(hourlyRate) : null });
      if (error) throw error;
      setName(""); setDescription(""); setPhone(""); setCurrency("TRY"); setHourlyRate("");
      await qc.invalidateQueries({ queryKey: ["business-profiles", me.data.id] });
      toast.success("Usta profili oluşturuldu.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Profil oluşturulamadı."); }
    finally { setSaving(false); }
  }
  async function updateProfile(id: string, update: { name?: string; is_archived?: boolean; phone?: string | null; currency?: string; default_hourly_rate?: number | null }) {
    setSaving(true);
    try {
      const { error } = await supabase.from("business_profiles").update({ ...update, updated_at: new Date().toISOString() }).eq("id", id).eq("team_id", me.data?.id ?? "");
      if (error) throw error;
      if (update.is_archived && profileState.activeProfileId === id) {
        const next = profileState.profiles.find((profile) => profile.is_default && !profile.is_archived && profile.id !== id);
        if (next && !profileState.switchProfile(next.id)) return false;
      }
      await qc.invalidateQueries({ queryKey: ["business-profiles", me.data?.id] });
      toast.success(update.is_archived === undefined ? (update.name ? "Profil adı güncellendi." : "Profil bilgileri güncellendi.") : update.is_archived ? "Profil arşivlendi; geçmiş kayıtlar korundu." : "Profil yeniden etkinleştirildi.");
      return true;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Profil güncellenemedi."); return false; }
    finally { setSaving(false); }
  }
  async function setDefaultProfile(id: string) {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("set_default_business_profile", { _profile_id: id });
      if (error) throw error;
      if (data) profileState.switchProfile(data, false);
      await qc.invalidateQueries({ queryKey: ["business-profiles", me.data?.id] });
      toast.success("Varsayılan giriş profili değiştirildi.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Varsayılan profil değiştirilemedi."); }
    finally { setSaving(false); }
  }
  async function removeProfile(profile: typeof profileState.profiles[number]) {
    if (!window.confirm(`“${profile.name}” profili etkin listeden kaldırılacak. Geçmiş iş, yevmiye ve cari kayıtları korunacak. Devam edilsin mi?`)) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("archive_business_profile", { _profile_id: profile.id });
      if (error) throw error;
      if (profileState.activeProfileId === profile.id && data) profileState.switchProfile(data, false);
      await qc.invalidateQueries({ queryKey: ["business-profiles", me.data?.id] });
      toast.success("Profil etkin listeden kaldırıldı; geçmiş kayıtlar korundu.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Profil kaldırılamadı."); }
    finally { setSaving(false); }
  }
  const activeCount = profileState.profiles.filter((profile) => !profile.is_archived).length;
  return <section className="space-y-3 rounded-2xl border bg-card p-4">
    <div><h2 className="font-semibold">Usta / işletme profilleri</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Her profilin işleri, randevuları, yevmiyesi, gideri ve cari hareketleri ayrı kapsamda tutulur. Varsayılan giriş profilini değiştirebilir, profili etkin listeden kaldırabilirsiniz. Kaldırılan profilin geçmiş kayıtları korunur.</p></div>
    {!profileBackendReady && !profileState.loading && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100" role="status">Profil tablosu henüz erişilebilir değil. Uygulama eski kayıt görünümünde çalışıyor; 0016 migration uygulanıp erişim sağlandığında profil yönetimi açılacak.</p>}
    <form onSubmit={(event) => void createProfile(event)} className="grid gap-2 sm:grid-cols-2">
      <Input aria-label="Yeni profil adı" value={name} maxLength={100} required placeholder="Örn. Ahmet Usta" onChange={(event) => setName(event.target.value)}/>
      <Input aria-label="Profil telefonu (isteğe bağlı)" value={phone} maxLength={40} placeholder="Telefon (isteğe bağlı)" onChange={(event) => setPhone(event.target.value)}/>
      <Input aria-label="Profil açıklaması (isteğe bağlı)" className="sm:col-span-2" value={description} maxLength={300} placeholder="İşletme açıklaması (isteğe bağlı)" onChange={(event) => setDescription(event.target.value)}/>
      <select aria-label="Profil varsayılan para birimi" value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-11 rounded-xl border bg-background px-3 text-sm"><option value="TRY">TRY · Türk lirası</option><option value="USD">USD · ABD doları</option><option value="EUR">EUR · Euro</option><option value="GBP">GBP · İngiliz sterlini</option></select>
      <Input aria-label="Varsayılan saat ücreti (isteğe bağlı)" type="number" min="0" step="0.01" value={hourlyRate} placeholder="Varsayılan saat ücreti (isteğe bağlı)" onChange={(event) => setHourlyRate(event.target.value)}/>
      <Button type="submit" disabled={!profileBackendReady || saving || !name.trim()} className="sm:col-span-2"><Plus className="size-4"/>Profil ekle</Button>
    </form>
    {profileState.loading ? <p className="text-sm text-muted-foreground">Profiller yükleniyor…</p> : <ul className="space-y-2">{profileState.profiles.map((profile) => { const nextName = renames[profile.id]?.trim() ?? ""; const initial = { phone: profile.phone ?? "", currency: profile.currency, hourlyRate: profile.default_hourly_rate == null ? "" : String(profile.default_hourly_rate) }; const draft = details[profile.id] ?? initial; const detailsChanged = draft.phone !== initial.phone || draft.currency !== initial.currency || draft.hourlyRate !== initial.hourlyRate; return <li key={profile.id} className="grid gap-2 rounded-xl border p-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex flex-wrap items-center gap-2">
      <Input aria-label={`${profile.name} profil adı`} className="min-w-40 flex-1" maxLength={100} value={renames[profile.id] ?? profile.name} onChange={(event) => setRenames((current) => ({ ...current, [profile.id]: event.target.value }))}/>
      <span className="text-[10px] text-muted-foreground">{profile.is_default ? "Varsayılan giriş profili" : profile.is_archived ? "Arşivli · geçmiş kayıtlar korunuyor" : "Etkin profil"}</span>
      {renames[profile.id] !== undefined && nextName !== profile.name && <Button type="button" size="sm" variant="secondary" disabled={saving || !nextName} onClick={() => { if (!nextName) return; void updateProfile(profile.id, { name: nextName }).then((saved) => { if (saved) setRenames((current) => { const next = { ...current }; delete next[profile.id]; return next; }); }); }}><Save className="size-4"/>Adı kaydet</Button>}
      {!profile.is_archived && !profile.is_default && <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => void setDefaultProfile(profile.id)}><Star className="size-4"/>Varsayılan yap</Button>}
      {profile.is_archived ? <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void updateProfile(profile.id, { is_archived: false })}><ArchiveRestore className="size-4"/>Etkinleştir</Button> : <Button type="button" size="sm" variant="outline" disabled={saving || (profile.is_default && activeCount <= 1)} title={profile.is_default && activeCount <= 1 ? "Önce yeni bir profil oluşturun." : ""} onClick={() => void removeProfile(profile)}><Trash2 className="size-4"/>Profili kaldır</Button>}
      </div>
      {!profile.is_archived && <div className="grid gap-2 sm:col-span-2 sm:grid-cols-[1fr_1fr_1fr_auto]"><Input aria-label={`${profile.name} telefon`} maxLength={40} value={draft.phone} placeholder="Telefon" onChange={(event) => setDetails((current) => ({ ...current, [profile.id]: { ...draft, phone: event.target.value } }))}/><select aria-label={`${profile.name} varsayılan para birimi`} value={draft.currency} onChange={(event) => setDetails((current) => ({ ...current, [profile.id]: { ...draft, currency: event.target.value } }))} className="h-11 rounded-xl border bg-background px-3 text-sm"><option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select><Input aria-label={`${profile.name} varsayılan saat ücreti`} type="number" min="0" step="0.01" value={draft.hourlyRate} placeholder="Varsayılan saat ücreti" onChange={(event) => setDetails((current) => ({ ...current, [profile.id]: { ...draft, hourlyRate: event.target.value } }))}/><Button type="button" size="sm" variant="secondary" disabled={saving || !detailsChanged} onClick={() => void updateProfile(profile.id, { phone: draft.phone.trim() || null, currency: draft.currency, default_hourly_rate: draft.hourlyRate ? Number(draft.hourlyRate) : null }).then((saved) => { if (saved) setDetails((current) => { const next = { ...current }; delete next[profile.id]; return next; }); })}><Save className="size-4"/>Detayları kaydet</Button></div>}
    </li>; })}</ul>}
  </section>;
}
const themeChoices = [
  ["ocean", "Okyanus", "Mavi · turkuaz"],
  ["forest", "Orman", "Yeşil · doğal"],
  ["sunset", "Gün batımı", "Turuncu · sıcak"],
  ["lilac", "Leylak", "Mor · yumuşak"],
  ["dawn", "Şafak", "Mercan · canlı"],
  ["twilight", "Alacakaranlık", "Çivit · sakin"],
  ["gold", "Altın", "Sarı · enerjik"],
] as const;
function ThemeSettings({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="space-y-3 rounded-2xl border bg-card p-4"><div><h3 className="font-semibold">Renk teması</h3><p className="text-xs text-muted-foreground">Seçiminiz bu cihazda anında uygulanır.</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{themeChoices.map(([id, label, description]) => <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={value === id} className={`flex min-h-14 items-center gap-2 rounded-xl border px-3 text-left transition active:scale-[.98] ${value === id ? "border-primary bg-primary/10 ring-1 ring-primary/40" : "bg-background/40 hover:bg-accent/60"}`}><span className="size-4 shrink-0 rounded-full shadow-sm" style={{ background: `var(--theme-${id}, var(--primary))` }}/><span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="block truncate text-[10px] text-muted-foreground">{description}</span></span></button>)}</div></div>;
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
